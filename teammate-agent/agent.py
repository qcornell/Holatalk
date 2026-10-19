"""Hola Teammate agent: a Spanish-speaking AI teammate for door-to-door reps.

The rep's phone joins a LiveKit room on speakerphone. This agent joins the same room,
talks with the customer in Spanish on OpenAI's gpt-realtime-2.1 (or GPT-Live-1 with
ENGINE=live in .env), and sends the phone:
English captions, price cards, the sign-up form, and any flagged numbers.
Like a real interpreter, Ana steps aside to check in with the rep in English after the
sign-up is saved, or when she doesn't know an answer.

Every line Ana says about the offer is checked twice: by number_check.py (amounts with no
source, a price tied to the wrong way to pay) and by offer_judge.py (meaning, e.g. agreeing to a
price the customer suggested). Leads are written to storage (leads.py) before Ana says "saved".

Run it:
  python agent.py console   talk to it with your PC mic and speakers (quickest test)
  python agent.py dev       connect to your LiveKit project so the phone app can join
  python agent.py start     production
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
from collections import deque
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    RunContext,
    cli,
    function_tool,
)
from livekit.agents.llm import ChatMessage
from livekit.plugins import openai
from livekit.plugins.openai.realtime import ResponsesDelegationOptions
from openai import AsyncOpenAI
from openai.types.realtime import AudioTranscription, RealtimeReasoning
from openai.types.realtime.realtime_audio_input_turn_detection import SemanticVad

from leads import store_lead
from number_check import amounts_in_text, expand_allowed, payment_pairing_errors, unexpected_amounts
from offer_judge import OfferJudge, worth_checking
from playbook import Playbook, local_now
from usage import log_session

HERE = Path(__file__).parent
load_dotenv(HERE / ".env")
logger = logging.getLogger("hola-teammate")

ENGINE = os.getenv("ENGINE", "realtime").strip().lower()  # "realtime" or "live"
REALTIME_MODEL = os.getenv("REALTIME_MODEL", "gpt-realtime-2.1")
LIVE_MODEL = os.getenv("LIVE_MODEL", "gpt-live-1")
LIVE_BACKEND_MODEL = os.getenv("LIVE_BACKEND_MODEL", "")  # blank = LiveKit's default backend
MODEL_NAME = LIVE_MODEL if ENGINE == "live" else REALTIME_MODEL
VOICE = os.getenv("VOICE", "marin")
CAPTION_MODEL = os.getenv("CAPTION_MODEL", "gpt-4o-mini")
TRANSCRIBE_MODEL = os.getenv("TRANSCRIBE_MODEL", "gpt-4o-transcribe")
SILENCE_SECONDS = float(os.getenv("SILENCE_SECONDS", "30"))
REP_WAIT_SECONDS = float(os.getenv("REP_WAIT_SECONDS", "15"))  # then Ana says "Max?" once, then carries on
MAX_MINUTES = float(os.getenv("MAX_MINUTES", "20"))
TIMEZONE = os.getenv("TIMEZONE", "America/Chicago")
PHONE_TOPIC = "hola"
REP_PREFIX = "[rep]"  # lines the rep sent from his phone: a tapped reply or his hold-to-talk button
CALLBACK_MAX_DAYS = 60


def now_local() -> datetime:
    return local_now(TIMEZONE)


# ---------------------------------------------------------------- phone messages

class PhoneBridge:
    """Sends small JSON messages to the rep's phone over the LiveKit data channel."""

    def __init__(self, ctx: JobContext | None):
        self.ctx = ctx

    async def send(self, kind: str, **data: Any) -> bool:
        payload = json.dumps({"type": kind, **data}, ensure_ascii=False)
        logger.info("to phone: %s (%d bytes)", kind, len(payload))  # never the content: it can hold names
        try:
            await self.ctx.room.local_participant.publish_data(payload, reliable=True, topic=PHONE_TOPIC)
            return True
        except Exception as e:  # console mode has no real room
            logger.debug("phone send skipped: %s", type(e).__name__)
            return False


class Captioner:
    """Turns each line of the conversation into an English caption for the rep."""

    def __init__(self) -> None:
        self.client = AsyncOpenAI()

    async def to_english(self, text: str) -> str:
        if looks_english(text):
            return text
        try:
            r = await self.client.chat.completions.create(
                model=CAPTION_MODEL,
                messages=[
                    {"role": "system", "content": "Translate to natural, short English for a sales rep "
                     "reading live captions. Keep names, numbers and prices exactly. Reply with the "
                     "translation only."},
                    {"role": "user", "content": text},
                ],
                max_tokens=200,
            )
            return (r.choices[0].message.content or text).strip()
        except Exception as e:
            logger.warning("caption translation failed: %s", e)
            return text


_EN = {"the", "and", "you", "is", "are", "tell", "her", "him", "ask", "we", "it", "to", "can", "what", "how",
       "she", "he", "with", "from", "that", "that's", "this", "have", "has", "if", "they", "them", "their",
       "yes", "yeah", "okay", "ok", "thanks", "thank", "explain", "of", "for", "my", "your", "do", "does",
       "don't", "need", "about", "all", "just", "so", "will", "please", "or", "in", "on", "at", "it's", "anything"}
_ES = {"el", "la", "los", "las", "que", "es", "y", "de", "por", "para", "usted", "sí", "si", "mi", "su",
       "cuánto", "cuanto", "en", "un", "una", "con", "del", "lo", "le", "se", "nos", "pero", "bien", "gracias",
       "está", "tiene", "tengo", "quiero", "aquí", "ahorita", "más", "muy", "ya", "también", "cómo", "qué", "porque"}


def looks_english(text: str) -> bool:
    words = re.findall(r"[a-záéíóúñ']+", text.lower())
    en = sum(w in _EN for w in words)
    es = sum(w in _ES for w in words)
    return en > es


def clean_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    return digits if len(digits) == 10 else ""


_NO_EMAIL = {"none", "no", "ninguno", "no tiene", "no tengo", "n/a"}


def clean_email(email: str) -> str | None:
    """The email, "" if they truly have none, or None if it doesn't look complete."""
    e = email.strip()
    if e.lower() in _NO_EMAIL:
        return ""
    return e if re.fullmatch(r"[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}", e) else None


def parse_callback(when_iso: str, now: datetime) -> datetime | str:
    """The callback time, or why it can't be used."""
    try:
        at = datetime.fromisoformat(when_iso.strip())
    except ValueError:
        return "Not saved: work out the exact date and time (like 2026-10-24T11:00) from what they said."
    if at.tzinfo is None:
        at = at.replace(tzinfo=now.tzinfo)
    if at < now + timedelta(minutes=5):
        return "Not saved: that time has already passed. Ask for a day and time coming up."
    if at > now + timedelta(days=CALLBACK_MAX_DAYS):
        return "Not saved: that's too far off. Ask for a day and time in the next few weeks."
    return at


def who_said(text: str, waiting_for_rep: bool) -> tuple[str, bool, bool]:
    """(clean text, is_rep, english). The rep is certain for a [rep] line from his phone, and likely
    for English that answers Ana's check-in. Other English could be a bilingual customer."""
    verified = text.startswith(REP_PREFIX)
    clean = text.removeprefix(REP_PREFIX).strip()
    english = looks_english(clean)
    return clean, verified or (english and waiting_for_rep), english


def offer_problem(text: str, base: set[float], rep_amounts: set[float], customer_amounts: set[float],
                  pairing: list[tuple[float, set[str]]]) -> tuple[str, str]:
    """("flag", why) when a line is surely wrong, ("judge", "") when only reading it can tell
    (it mentions the offer, or a number only the customer said), else ("ok", "")."""
    definite = expand_allowed(base | rep_amounts, set())
    with_customer = expand_allowed(base | rep_amounts, customer_amounts)
    unsourced = unexpected_amounts(text, with_customer)
    if unsourced:
        return "flag", f"{', '.join(f'${a:g}' for a in unsourced)} isn't in your facts"
    paired = payment_pairing_errors(text, pairing)
    if paired:
        return "flag", f"{', '.join(f'${a:g}' for a in paired)} is the price for a different way to pay"
    if worth_checking(text, unexpected_amounts(text, definite)):
        return "judge", ""
    return "ok", ""


# ---------------------------------------------------------------- the agent

class TeammateAgent(Agent):
    def __init__(self, playbook: Playbook, phone: PhoneBridge, *, call_id: str = "console",
                 user_id: str = "local", store=store_lead):
        super().__init__(instructions=playbook.instructions(tz=TIMEZONE))
        self.playbook = playbook
        self.phone = phone
        self.call_id = call_id
        self.user_id = user_id
        self.store = store  # async (record) -> bool; True only once it is really saved
        self.lead: dict[str, Any] = {}
        self.rep_heard_at = 0.0  # last time the rep answered (out loud or from his phone)
        self._waiting: asyncio.Task | None = None

    async def on_enter(self) -> None:
        self.session.generate_reply(
            instructions="Start now: say your first words exactly as written. After they answer, run the pitch."
        )

    # ---- waiting on the rep after a check-in

    @property
    def waiting_for_rep(self) -> bool:
        return bool(self._waiting and not self._waiting.done())

    def heard_rep(self) -> None:
        self.rep_heard_at = time.monotonic()

    def wait_for_rep(self) -> None:
        """After Ana asks the rep something: if he says nothing, she says his name once, then carries on."""
        if self._waiting and not self._waiting.done():
            self._waiting.cancel()
        self._waiting = asyncio.create_task(self._nudge_rep(time.monotonic()))

    async def _nudge_rep(self, asked_at: float) -> None:
        rep = self.playbook.rep_name
        steps = [
            f"{rep} hasn't answered you. Say his name once, in English: '{rep}?'",
            f"{rep} is busy. Turn back to the customer in Spanish, thank them for waiting, and carry on. "
            f"If they were waiting on an answer, say {rep} will answer it in a moment.",
        ]
        for i, step in enumerate(steps):
            await asyncio.sleep(REP_WAIT_SECONDS)
            if self.rep_heard_at > asked_at:
                return
            if i == 0:
                await self.phone.send("rep_nudge")  # the phone buzzes
            try:
                self.session.generate_reply(instructions=step)
            except RuntimeError as e:  # the call already ended
                logger.debug("nudge skipped: %s", e)
                return

    async def on_exit(self) -> None:
        if self._waiting and not self._waiting.done():
            self._waiting.cancel()

    # ---- tools

    @function_tool
    async def show_price(self, context: RunContext, plan_name: str, payment: str = "") -> str:
        """Show a plan's price on the phone screen and get the exact price to say. Call it every time you
        quote a price, with the way to pay when you talk about one.

        Args:
            plan_name: The plan name exactly as listed in your facts.
            payment: The way to pay you are quoting, for example "autopay checking" or "debit card". Blank for all.
        """
        plan = self.playbook.find_plan(plan_name)
        price = plan.lowest_price() if plan else None
        rep = self.playbook.rep_name
        if not plan or price is None:
            await self.phone.send("ask_rep", question=f"Price for plan '{plan_name}'?")
            return f"That plan is not in the facts. Tell the customer you'll confirm with {rep}."
        options = [{"how": o.how, "howEs": o.how_es, "monthly": o.price_monthly} for o in plan.price_options]
        ways = "; ".join(f"${o['monthly']:g} al mes {o['howEs'] or o['how']}" for o in options)
        if payment.strip() and plan.price_options:
            chosen = self.playbook.find_price_option(plan, payment)
            if not chosen:
                return (f"'{payment}' is not one of the ways to pay in your facts. Tell the customer the ways "
                        f"there are ({ways}). If they want '{payment}', call ask_rep.")
            await self.phone.send("price_card", plan=plan.name, monthly=chosen.price_monthly, speed=plan.speed,
                                  features=plan.features, options=options, chosen=chosen.how)
            return (f"{plan.name}, {chosen.how_es or chosen.how}: ${chosen.price_monthly:g} al mes. "
                    "Say exactly this price for this way to pay. Shown on screen.")
        await self.phone.send(
            "price_card", plan=plan.name, monthly=price, speed=plan.speed, features=plan.features, options=options
        )
        if len(options) > 1:
            return f"{plan.name}: {ways}. Shown on screen."
        return f"{plan.name}: ${price:g} al mes. Shown on screen."

    @function_tool
    async def save_lead(
        self, context: RunContext, full_name: str, phone: str, email: str, customer_confirmed: bool,
        payment: str = "", plan: str = "",
    ) -> str:
        """Save the sign-up. Only after you read the phone back digit by digit and spelled the email back,
        and the customer said it's right. Never pass a Social Security, ID, card or bank number here.

        Args:
            full_name: Customer's full name.
            phone: Customer's phone number, digits only if possible.
            email: Customer's email address, or "none" if they say they have no email.
            customer_confirmed: True only if the customer said the phone and email you read back are right.
            payment: How they'll pay if they said, for example "autopay checking" or "debit card". Blank if not yet.
            plan: The plan they chose. Blank if there is only one.
        """
        rep = self.playbook.rep_name
        problems = []
        name = " ".join(full_name.split())
        if len(re.findall(r"[^\W\d_]", name)) < 2:
            problems.append("ask for their full name")
        digits = clean_phone(phone)
        if not digits:
            problems.append("the phone number should have 10 digits")
        mail = clean_email(email)
        if mail is None:
            problems.append("the email doesn't look complete (or ask if they have none)")
        chosen = self.playbook.find_plan(plan or "")
        if not chosen and self.playbook.plans:
            problems.append("ask which plan they want")
        option = self.playbook.find_price_option(chosen, payment) if payment.strip() else None
        if payment.strip() and chosen and chosen.price_options and not option:
            ways = ", ".join(o.how_es or o.how for o in chosen.price_options)
            problems.append(f"'{payment}' isn't a way to pay in your facts ({ways}); ask which one, or ask {rep}")
        if problems:
            return "Not saved yet: " + "; ".join(problems) + "."
        if not customer_confirmed:
            return ("Not saved yet: read the phone number back digit by digit and spell the email back, then call "
                    "save_lead again once they say it's right.")
        fields = {
            "name": name, "phone": digits, "email": mail,
            "plan": chosen.name if chosen else plan.strip(),
            "payment": option.how if option else "",
            "monthly": option.price_monthly if option else None,  # unknown until they choose how to pay
        }
        ok = await self.store({"call_id": self.call_id, "user_id": self.user_id, "kind": "signup", **fields})
        if not ok:
            await self.phone.send("lead", status="not_saved", fields=fields)
            return (f"NOT saved: the save didn't go through. Don't tell the customer it's saved. Tell {rep} in "
                    f"English: '{rep}, the save didn't go through. Can you write down their info?' Then carry on.")
        first_save = not self.lead
        self.lead = fields
        await self.phone.send("lead", status="saved", fields=fields)
        if not first_save:
            return "Updated and saved. Carry on where you were."
        await self.phone.send("check_in", reason="sign-up saved")
        self.wait_for_rep()
        return (f"Saved. Now check in with {rep}: tell the customer in Spanish 'Perfecto, ya quedó. Un momentito, "
                f"déjeme hablar con {rep}.' Then ask {rep} in English: '{rep}, I've got their name, number and "
                "email. Anything else you want me to ask or explain?' Then wait for his answer. If they tell you "
                "how they'll pay later, call save_lead again with it.")

    @function_tool
    async def ask_rep(self, context: RunContext, question: str) -> str:
        """Ask the rep, out loud in English, when your facts don't answer a question or before you agree to
        something they don't cover. Never guess instead.

        Args:
            question: The customer's question, in short plain English.
        """
        await self.phone.send("ask_rep", question=question)
        self.wait_for_rep()
        rep = self.playbook.rep_name
        return (f"Tell the customer in Spanish: 'Buena pregunta. Déjeme confirmarlo con {rep}.' Then ask {rep} "
                f"in English, in one short line: '{rep}, {question}' Then wait. When he answers, tell the "
                "customer in Spanish, using exactly what he said.")

    @function_tool
    async def schedule_callback(
        self, context: RunContext, name: str, phone: str, when_spoken: str, when_iso: str, decision_maker: str
    ) -> str:
        """Save a go-back visit when a spouse, roommate or owner has to decide. Only for real interest, never
        for a stall, and only with a phone number and a specific day and time you confirmed with them.

        Args:
            name: The customer's name.
            phone: A phone number for the customer or the person who decides.
            when_spoken: The day and time as they said it, for example "el sábado a las 11".
            when_iso: The same day and time as a date, for example "2026-10-24T11:00", worked out from today's date.
            decision_maker: Who decides: spouse, roommate, owner, or other.
        """
        digits = clean_phone(phone)
        if not digits:
            return "Not saved: ask for a phone number with 10 digits."
        at = parse_callback(when_iso, now_local())
        if isinstance(at, str):
            return at
        record = {"call_id": self.call_id, "user_id": self.user_id, "kind": "callback", "name": name.strip(),
                  "phone": digits, "callback_at": at.isoformat(), "decision_maker": decision_maker.strip()}
        if not await self.store(record):
            rep = self.playbook.rep_name
            await self.phone.send("callback", status="not_saved", name=name.strip(), phone=digits,
                                  when=when_spoken.strip(), at=at.isoformat())
            return (f"NOT saved: the save didn't go through. Tell {rep} in English to write down the callback, "
                    "then repeat the day and time back to the customer.")
        await self.phone.send("callback", status="saved", name=name.strip(), phone=digits, when=when_spoken.strip(),
                              at=at.isoformat(), decision_maker=decision_maker.strip())
        return (f"Saved for {at.strftime('%A %B %d at %I:%M %p')}. Repeat the day and time back to them in Spanish, "
                "thank them, and say goodbye.")

    @function_tool
    async def move_on(self, context: RunContext, reason: str) -> str:
        """Tell the rep this door is done so they can go to the next one. Use it after a warm goodbye when
        there is no real need (no smart TV, no kids, no streaming), after a firm second no, or for a stall.

        Args:
            reason: A few words, for example "no TV, no need", "said no twice", "roommate stall".
        """
        await self.phone.send("move_on", reason=reason)
        return "The rep has been told. Say a warm goodbye if you haven't yet, then stop talking."


# ---------------------------------------------------------------- session wiring

def build_model(playbook: Playbook, engine: str | None = None):
    """ENGINE=realtime: gpt-realtime-2.1, one model listens, thinks and talks, taking turns.
    ENGINE=live: GPT-Live-1, full duplex (listens while it talks); tools run on a backend model."""
    if (engine or ENGINE) == "live":
        backend = ResponsesDelegationOptions(instructions=playbook.instructions(tz=TIMEZONE))
        if LIVE_BACKEND_MODEL:
            backend["model"] = LIVE_BACKEND_MODEL
        return openai.realtime.GPTLiveModel(
            model=LIVE_MODEL, voice=VOICE, delegation="responses", responses_options=backend
        )
    keywords = [w for w in [playbook.company_name, playbook.rep_name, playbook.assistant_name,
                            *[p.name for p in playbook.plans]] if w]
    return openai.realtime.RealtimeModel(
        model=REALTIME_MODEL,
        voice=VOICE,
        input_audio_transcription=AudioTranscription(
            model=TRANSCRIBE_MODEL, languages=["es", "en"], keywords=keywords
        ),
        input_audio_noise_reduction="far_field",  # phone on speaker, held at arm's length
        turn_detection=SemanticVad(
            type="semantic_vad", eagerness="auto", create_response=True, interrupt_response=True
        ),
        reasoning=RealtimeReasoning(effort=os.getenv("REASONING_EFFORT", "low")),
    )


def load_playbook(ctx: JobContext) -> tuple[Playbook, dict[str, Any]]:
    """The phone sends the playbook as job metadata. Console and dev fall back to a local file."""
    meta: dict[str, Any] = {}
    raw = getattr(ctx.job, "metadata", "") or ""
    if raw:
        try:
            meta = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("job metadata isn't JSON; using the local playbook file")
    if isinstance(meta.get("playbook"), dict):
        return Playbook.from_dict(meta["playbook"]), meta
    path = os.getenv("PLAYBOOK_FILE", str(HERE / "sample_playbook.json"))
    return Playbook.from_file(path), meta


server = AgentServer()


@server.rtc_session(agent_name=os.getenv("AGENT_NAME", "hola-teammate"))
async def entrypoint(ctx: JobContext) -> None:
    playbook, meta = load_playbook(ctx)
    phone = PhoneBridge(ctx)
    captions = Captioner()
    judge = OfferJudge()
    started = time.monotonic()
    tasks: set[asyncio.Task] = set()
    console = ctx.is_fake_job()

    today = now_local()
    base_amounts = playbook.allowed_amounts(now=today)
    pairing = playbook.pairing_options()
    facts = playbook.facts_text(today)
    rep_amounts: set[float] = set()        # amounts the rep said (from his phone, or answering a check-in)
    customer_amounts: set[float] = set()   # amounts anyone else said: fine to repeat, never our price
    rep_said: list[str] = []
    recent: deque[str] = deque(maxlen=8)
    corrections = {"count": 0}
    rep_identity = str(meta.get("rep_identity") or "")

    def spawn(coro) -> None:
        t = asyncio.create_task(coro)
        tasks.add(t)
        t.add_done_callback(tasks.discard)

    if not console:  # console mode runs without a LiveKit room
        await ctx.connect()
    room_name = getattr(ctx.room, "name", "") if not console else ""
    call_id = room_name or f"console-{int(time.time())}"
    user_id = str(meta.get("user_id") or "local")
    session = AgentSession(llm=build_model(playbook), user_away_timeout=SILENCE_SECONDS)
    agent = TeammateAgent(playbook, phone, call_id=call_id, user_id=user_id)

    async def caption(who: str, text: str, verified: bool = False) -> None:
        await phone.send("caption", who=who, text=text, en=await captions.to_english(text), verified=verified)

    async def check_offer(text: str, context: list[str]) -> None:
        verdict, problem = offer_problem(text, base_amounts, rep_amounts, customer_amounts, pairing)
        fix = ""
        if verdict == "judge":
            judged = await judge.check(text, facts, rep_said, context)
            if judged:
                problem, fix = judged["problem"], judged["fix_es"]
        if not problem:
            return
        await phone.send("flag", said=text, problem=problem)
        if corrections["count"] < 3:  # never loop on corrections
            corrections["count"] += 1
            session.generate_reply(
                instructions=(
                    f"What you just said doesn't match your facts: {problem}. In one short Spanish sentence, "
                    "correct yourself ('Perdón, me equivoqué...') using only your facts"
                    + (f', for example: "{fix}"' if fix else "")
                    + f". If you aren't sure of the right answer, say you'll confirm with {playbook.rep_name}."
                )
            )

    @session.on("conversation_item_added")
    def _on_item(ev) -> None:
        item = ev.item
        if not isinstance(item, ChatMessage):
            return
        text = (item.text_content or "").strip()
        if not text:
            return
        if item.role == "user":
            clean, is_rep, english = who_said(text, agent.waiting_for_rep)
            amounts = amounts_in_text(clean, money_only=False)
            if is_rep:
                rep_amounts.update(amounts)
                rep_said.append(clean)
                agent.heard_rep()
            else:
                customer_amounts.update(amounts)
            label = "Rep" if is_rep else "English speaker" if english else "Customer"
            recent.append(f"{label}: {clean}")
            spawn(caption("rep" if is_rep or english else "customer", clean, verified=is_rep))
        elif item.role == "assistant":
            spawn(caption("hola", text))
            spawn(check_offer(text, list(recent)))
            recent.append(f"Ana: {text}")

    def _on_data(packet) -> None:
        """The rep tapped a quick reply, or used his hold-to-talk button, on his phone."""
        if packet.topic != PHONE_TOPIC:
            return
        sender = getattr(packet.participant, "identity", None)
        if rep_identity and sender != rep_identity:
            logger.warning("ignored a phone message that didn't come from the rep")
            return
        try:
            msg = json.loads(packet.data.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return
        text = str(msg.get("text") or "").strip()
        if msg.get("type") == "rep_says" and text:
            agent.heard_rep()
            session.generate_reply(user_input=f"{REP_PREFIX} {text}")

    if not console:
        ctx.room.on("data_received", _on_data)

    ending = {"done": False}

    async def end(reason: str) -> None:
        if ending["done"]:
            return
        ending["done"] = True
        await phone.send("ended", reason=reason, seconds=round(time.monotonic() - started))
        session.shutdown()
        ctx.shutdown(reason=reason)

    @session.on("user_state_changed")
    def _on_user_state(ev) -> None:
        if ev.new_state == "away":  # nobody has spoken for SILENCE_SECONDS
            spawn(end("silence"))

    async def time_limit() -> None:
        await asyncio.sleep(MAX_MINUTES * 60)
        session.generate_reply(
            instructions=f"Wrap up politely in one sentence and say {playbook.rep_name} will take it from here."
        )
        await asyncio.sleep(12)
        await end("time_limit")

    async def record_usage() -> None:
        await log_session(user_id=user_id, room=call_id, seconds=round(time.monotonic() - started),
                          model=MODEL_NAME, lead_saved=bool(agent.lead))

    async def usage_every_minute() -> None:
        while True:
            await asyncio.sleep(60)
            await record_usage()

    ctx.add_shutdown_callback(record_usage)
    await session.start(agent=agent, room=ctx.room)
    if playbook.needs_review(today.date().isoformat()):
        spawn(phone.send("review_prices", reviewed_on=playbook.reviewed_on))
    spawn(time_limit())
    spawn(usage_every_minute())


if __name__ == "__main__":
    cli.run_app(server)
