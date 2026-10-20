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
from livekit.agents.metrics import RealtimeModelMetrics
from livekit.plugins import openai
from livekit.plugins.openai.realtime import ResponsesDelegationOptions
from openai import AsyncOpenAI
from openai.types.realtime import AudioTranscription, RealtimeReasoning
from openai.types.realtime.realtime_audio_input_turn_detection import SemanticVad

from costs import CostMeter
from leads import store_lead
from number_check import amounts_in_text, expand_allowed, payment_pairing_errors, unexpected_amounts
from offer_judge import OfferJudge, worth_checking
from playbook import Playbook, local_now
from readback import readback_problem
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
TRANSCRIBE_MODEL = os.getenv("TRANSCRIBE_MODEL", "gpt-transcribe")
SILENCE_SECONDS = float(os.getenv("SILENCE_SECONDS", "30"))
# after they say yes, they may type on the tablet in silence for a while; wait this long before hanging up
SIGNED_UP_SILENCE_SECONDS = float(os.getenv("SIGNED_UP_SILENCE_SECONDS", "180"))
REP_WAIT_SECONDS = float(os.getenv("REP_WAIT_SECONDS", "10"))  # after "Quentin, are you there?": then "Quentin?" once, then carries on
REP_TALK_SECONDS = float(os.getenv("REP_TALK_SECONDS", "25"))  # once he answers her, his English counts as him this long
MAX_MINUTES = float(os.getenv("MAX_MINUTES", "20"))
TIMEZONE = os.getenv("TIMEZONE", "America/Chicago")
PHONE_TOPIC = "hola"
REP_PREFIX = "[rep]"  # lines the rep sent from his phone: a tapped reply
REP_HOLD_GRACE = 3.0  # after he lets go of hold-to-talk, his last words may still be being transcribed
PLAYBOOK_WAIT_SECONDS = float(os.getenv("PLAYBOOK_WAIT_SECONDS", "8"))  # for the phone to send its setup
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

    def __init__(self, on_usage=None) -> None:
        self.client = AsyncOpenAI()
        self.on_usage = on_usage  # (model, usage) -> None, for the cost meter

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
            if self.on_usage and getattr(r, "usage", None) is not None:
                self.on_usage(CAPTION_MODEL, r.usage)
            return (r.choices[0].message.content or text).strip()
        except Exception as e:
            logger.warning("caption translation failed: %s", e)
            return text


_EN = {"the", "and", "you", "is", "are", "tell", "her", "him", "ask", "we", "it", "to", "can", "what", "how",
       "she", "he", "with", "from", "that", "that's", "this", "have", "has", "if", "they", "them", "their",
       "yes", "yeah", "okay", "ok", "thanks", "thank", "explain", "of", "for", "my", "your", "do", "does",
       "don't", "need", "about", "all", "just", "so", "will", "please", "or", "in", "on", "at", "it's", "anything",
       "i'm", "here", "go", "ahead", "yep", "yup", "what's", "up", "sure", "hey", "uh", "huh", "listening"}
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


def calls_rep(text: str, rep: str) -> bool:
    """True when Ana's line calls the rep over: "Quentin, are you there?" (or "Are you there, Quentin?")."""
    if not rep:
        return False
    name = re.escape(rep)
    there = r"(?:are\s+)?you\s+(?:still\s+)?there"
    return bool(re.search(rf"\b{name}\b\W{{0,4}}(?:hey\W+)?{there}|{there}\W{{0,4}}{name}\b", text, re.I))


def who_said(text: str, waiting_for_rep: bool, holding: bool = False) -> tuple[str, bool, bool]:
    """(clean text, is_rep, english). The rep is certain for a [rep] line from his phone or speech
    while he holds his talk button, and likely for English that answers Ana's check-in. Other English
    could be a bilingual customer."""
    verified = text.startswith(REP_PREFIX) or holding
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
        # one way to sign up: they type it on the rep's tablet, or Ana takes it out loud
        skip = "save_lead" if playbook.signup_by == "tablet" else "ready_to_sign_up"
        self._tools = [t for t in self._tools if getattr(getattr(t, "info", None), "name", "") != skip]
        self.playbook = playbook
        self.phone = phone
        self.call_id = call_id
        self.user_id = user_id
        self.store = store  # async (record) -> bool; True only once it is really saved
        self.lead: dict[str, Any] = {}
        self.rep_heard_at = 0.0  # last time the rep answered (out loud or from his phone)
        self._waiting: asyncio.Task | None = None  # Ana called the rep and is waiting for him to answer
        self._nudged = False      # she already said his name a second time
        self._talk_until = 0.0    # he answered her: his English counts as him until then
        self._last_question = ""  # the last question shown on his phone
        self.lines: deque[tuple[str, str]] = deque(maxlen=60)  # (who, text): "ana", "customer" or "rep"
        self._held_until = 0.0  # he's holding his talk button (or just let go)

    def rep_hold(self, down: bool) -> None:
        """His hold-to-talk button: what's heard while it's down (and just after) is surely him."""
        self._held_until = float("inf") if down else time.monotonic() + REP_HOLD_GRACE

    @property
    def rep_holding(self) -> bool:
        return time.monotonic() < self._held_until

    def heard(self, who: str, text: str) -> None:
        """A finished line of the conversation, as transcribed."""
        self.lines.append((who, text))

    def speaking_english(self) -> bool:
        """Ana's last line to the customer (not one calling the rep) was in English."""
        rep = self.playbook.rep_name.lower()
        for who, text in reversed(self.lines):
            if who == "ana" and not (rep and rep in text.lower()):
                return looks_english(text)
        return False

    async def on_enter(self) -> None:
        self.session.generate_reply(
            instructions="Start now: say your first words exactly as written. After they answer, run the pitch."
        )

    # ---- calling the rep over ("Quentin, are you there?") and waiting for him

    @property
    def _calling(self) -> bool:
        return bool(self._waiting and not self._waiting.done())

    @property
    def waiting_for_rep(self) -> bool:
        """Ana has called the rep over, or is in the middle of talking with him."""
        return self._calling or time.monotonic() < self._talk_until

    def heard_rep(self) -> None:
        now = time.monotonic()
        if self.waiting_for_rep:  # he answered her: keep listening for his next line too
            self._talk_until = now + REP_TALK_SECONDS
        self.rep_heard_at = now
        if self._calling:
            self._waiting.cancel()
            self._waiting = None

    def wait_for_rep(self) -> None:
        """Ana is calling the rep. Start the clock (again) from now: if he says nothing, she says his name
        once more, then turns back to the customer."""
        if self._calling:
            if self._nudged:
                return  # she already said his name twice; let her carry on
            self._waiting.cancel()
        self._nudged = False
        self._waiting = asyncio.create_task(self._nudge_rep(time.monotonic()))

    def ana_said(self, text: str) -> bool:
        """Ana finished a line. True when it called the rep over ("Quentin, are you there?"). The wait is
        timed from the end of her line, so he gets the full time to answer."""
        called = calls_rep(text, self.playbook.rep_name)
        if called and time.monotonic() - self.rep_heard_at < 3:
            return called  # he's already answering
        if called or self._calling:
            self.wait_for_rep()
        return called

    async def _nudge_rep(self, asked_at: float) -> None:
        rep = self.playbook.rep_name
        steps = [
            f"{rep} hasn't answered you. Say his name once more, in English: '{rep}?'",
            f"{rep} is busy. Turn back to the customer in Spanish, thank them for waiting, and carry on. "
            f"If they were waiting on an answer, say {rep} will answer it in a moment. When he answers, go back to it.",
        ]
        for i, step in enumerate(steps):
            await asyncio.sleep(REP_WAIT_SECONDS)
            if self.rep_heard_at > asked_at:
                return
            if i == 0:
                self._nudged = True
                await self.phone.send("rep_nudge")  # the phone buzzes again
            try:
                self.session.generate_reply(instructions=step)
            except RuntimeError as e:  # the call already ended
                logger.debug("nudge skipped: %s", e)
                return

    def _call_over(self, before: str, to_customer: tuple[str, str], then: str) -> str:
        """Ana turns from the customer to the rep: a line for the customer (Spanish, or English if they
        switched), then his name in English, because he can't tell when her Spanish is meant for him. Then
        she waits for him. `then` is what she does once he answers. (Having the app force the line with
        generate_reply tested worse: she ignored it. One exact line in the tool result works.)"""
        rep = self.playbook.rep_name
        line = to_customer[1] if self.speaking_english() else to_customer[0]
        self.wait_for_rep()
        return (f'{before}Say exactly this now, all of it, then stop and wait: "{line} {rep}, are you there?" '
                f"Don't say anything else to {rep} yet. Only after {rep} answers you (a short English reply like "
                f"\"yeah\", \"go ahead\" or \"I'm here\" is {rep}): {then}")

    async def on_exit(self) -> None:
        if self._calling:
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
    async def ready_to_sign_up(self, context: RunContext, plan: str = "", payment: str = "") -> str:
        """They said yes to your close (or didn't say no). Hand off to the rep's tablet, where they type their
        own full name, phone number and email. As you call it, say only "¡Perfecto!" ("Perfect!" in English);
        it gives you the rest. Don't ask for those details out loud.

        Args:
            plan: The plan they chose. Blank if there is only one.
            payment: How they'll pay if they said, for example "autopay checking" or "debit card". Blank if not yet.
        """
        rep = self.playbook.rep_name
        chosen = self.playbook.find_plan(plan or "")
        if not chosen and len(self.playbook.plans) > 1:
            return "Not yet: ask which plan they want, then call ready_to_sign_up again."
        chosen = chosen or (self.playbook.plans[0] if self.playbook.plans else None)
        option = self.playbook.find_price_option(chosen, payment) if payment.strip() and chosen else None
        if payment.strip() and chosen and chosen.price_options and not option:
            ways = ", ".join(o.how_es or o.how for o in chosen.price_options)
            return f"'{payment}' isn't a way to pay in your facts ({ways}). Ask which one, or ask {rep}."
        fields = {"plan": chosen.name if chosen else plan.strip(), "payment": option.how if option else "",
                  "monthly": option.price_monthly if option else None}
        first = not self.lead
        self.lead = fields
        # the tablet holds their details; this row is only the rep's own count of sign-ups
        if not await self.store({"call_id": self.call_id, "user_id": self.user_id, "kind": "signup", **fields}):
            logger.warning("couldn't record the sign-up (the tablet still has their details)")
        await self.phone.send("signup_ready", **fields)  # the phone buzzes: hand them the tablet
        if not first:
            return "Noted. Carry on where you were."
        return self._call_over(
            "",
            (f"Ahorita {rep} le pasa la tableta para que ponga su nombre completo, su número y su correo.",
             f"{rep} will hand you the tablet so you can type in your full name, number and email."),
            "say in English: \"They're in! Can you hand them the tablet for their name, number and email?\" "
            f"Then, while they type, stay quiet; help if they ask something. When {rep} asks you to have them enter "
            "something else (date of birth, Social Security number, ID), tell them to type it on the tablet. If "
            "they tell you how they'll pay, call ready_to_sign_up again with it.")

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
        same = self.lead and self.lead["phone"] == digits and self.lead["email"] == mail
        if not same:  # check the transcript too, not just her word for it
            problem = await self._readback_problem(digits, mail)
            if problem:
                return f"Not saved yet: {problem}"
        fields = {
            "name": name, "phone": digits, "email": mail,
            "plan": chosen.name if chosen else plan.strip(),
            "payment": option.how if option else "",
            "monthly": option.price_monthly if option else None,  # unknown until they choose how to pay
        }
        ok = await self.store({"call_id": self.call_id, "user_id": self.user_id, "kind": "signup", **fields})
        if not ok:
            await self.phone.send("lead", status="not_saved", fields=fields)
            return self._call_over(
                "NOT saved: the save didn't go through. Don't tell the customer it's saved. ",
                ("Un momentito, por favor.", "One moment, please."),
                "say in English: \"The save didn't go through. Can you write down their info?\" Then carry on.")
        first_save = not self.lead
        self.lead = fields
        await self.phone.send("lead", status="saved", fields=fields)
        if not first_save:
            return "Updated and saved. Carry on where you were."
        await self.phone.send("check_in", reason="sign-up saved")
        return self._call_over(
            f"Saved. Now you're checking in with {rep}. ",
            (f"Perfecto, ya quedó. Un momentito, déjeme hablar con {rep}.",
             f"Perfect, you're all set. One moment, let me check with {rep}."),
            "say in English: \"I've got their name, number and email. Anything else you want me to ask or "
            "explain?\" Then wait for his answer. If they tell you how they'll pay later, call save_lead again with it.")

    async def _readback_problem(self, phone: str, email: str) -> str:
        problem = readback_problem(list(self.lines), phone, email)
        for _ in range(6):  # their "sí" may still be being transcribed
            if not problem.startswith("they haven't said yes"):
                break
            await asyncio.sleep(0.25)
            problem = readback_problem(list(self.lines), phone, email)
        return problem

    @function_tool
    async def ask_rep(self, context: RunContext, question: str) -> str:
        """Ask the rep, out loud in English, when your facts don't answer a question or before you agree to
        something they don't cover. Never guess instead.

        Args:
            question: What you'll ask him, in a few plain English words, for example "Is there a deposit?"
                or "Can they get installed Saturday?"
        """
        rep = self.playbook.rep_name
        if self.speaking_english():
            then_answer = ("When he answers, turn back to the customer and give them his answer in your own words, "
                           "keeping his numbers and details exactly. Then carry on.")
        else:
            then_answer = ("When he answers, turn back to the customer and give them his answer in Spanish, keeping "
                           "his numbers and details exactly (translate it; don't repeat his English or say "
                           "\"él dijo\"). Then carry on.")
        if self._calling:  # she already called him over and he hasn't answered yet
            return f'You already called {rep}. Wait. When he answers, ask him in English: "{question}" and stop.'
        if question != self._last_question:
            await self.phone.send("ask_rep", question=question)
            self._last_question = question
        if time.monotonic() < self._talk_until:  # he answered her call and is listening
            self._talk_until = time.monotonic() + REP_TALK_SECONDS
            return (f'{rep} is listening now, so don\'t call him again. Ask him in English: "{question}" and stop. '
                    f"Say nothing to the customer while you wait. {then_answer}")
        return self._call_over(
            "",
            (f"Buena pregunta. Déjeme confirmarlo con {rep}.", f"Good question. Let me check with {rep}."),
            f'ask him in English: "{question}" and stop. Say nothing to the customer while you wait. (If he '
            f"already answered it, don't ask again.) {then_answer}")

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
            await self.phone.send("callback", status="not_saved", name=name.strip(), phone=digits,
                                  when=when_spoken.strip(), at=at.isoformat())
            return self._call_over(
                "NOT saved: the save didn't go through. ",
                ("Un momentito, por favor.", "One moment, please."),
                "say in English: \"The callback didn't save. Can you write it down?\" Then repeat the day and time "
                "back to the customer.")
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
    return openai.realtime.RealtimeModel(
        model=REALTIME_MODEL,
        voice=VOICE,
        input_audio_transcription=transcription_settings(playbook, TRANSCRIBE_MODEL),
        input_audio_noise_reduction="far_field",  # phone on speaker, held at arm's length
        turn_detection=SemanticVad(
            type="semantic_vad", eagerness="auto", create_response=True, interrupt_response=True
        ),
        reasoning=RealtimeReasoning(effort=os.getenv("REASONING_EFFORT", "low")),
    )


def transcription_settings(playbook: Playbook, model: str) -> AudioTranscription:
    """How the customer's and rep's speech is written down. gpt-transcribe and gpt-live-transcribe
    take a language list and keywords; older models (gpt-4o-transcribe) take a prompt instead, and
    reject the others (that was the "'languages' parameter is not supported" error)."""
    keywords = [w for w in [playbook.company_name, playbook.rep_name, playbook.assistant_name,
                            *[p.name for p in playbook.plans]] if w]
    if model in ("gpt-transcribe", "gpt-live-transcribe"):
        return AudioTranscription(model=model, languages=["es", "en"], keywords=keywords)
    prompt = "Spanish and English at a customer's front door, about a sales offer."
    if keywords:
        prompt += " Names: " + ", ".join(keywords) + "."
    return AudioTranscription(model=model, prompt=prompt)


def job_metadata(ctx: JobContext) -> dict[str, Any]:
    raw = getattr(ctx.job, "metadata", "") or ""
    if not raw:
        return {}
    try:
        meta = json.loads(raw)
        return meta if isinstance(meta, dict) else {}
    except json.JSONDecodeError:
        logger.warning("job metadata isn't JSON; ignoring it")
        return {}


def local_playbook() -> Playbook:
    return Playbook.from_file(os.getenv("PLAYBOOK_FILE", str(HERE / "sample_playbook.json")))


async def playbook_from_phone(ctx: JobContext, phone: PhoneBridge) -> tuple[dict[str, Any], str] | None:
    """Ask the rep's phone for its setup ("hello"), and wait for {"type": "playbook"}. Returns the message
    and who sent it, or None if nothing came (an old app, or a test room)."""
    got: asyncio.Future = asyncio.get_running_loop().create_future()

    def on_data(packet) -> None:
        if packet.topic != PHONE_TOPIC or got.done():
            return
        try:
            msg = json.loads(packet.data.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return
        if msg.get("type") == "playbook" and isinstance(msg.get("playbook"), dict):
            got.set_result((msg, str(getattr(packet.participant, "identity", "") or "")))

    ctx.room.on("data_received", on_data)
    try:
        deadline = time.monotonic() + PLAYBOOK_WAIT_SECONDS
        while time.monotonic() < deadline:
            await phone.send("hello")  # the phone answers with its playbook
            try:
                return await asyncio.wait_for(asyncio.shield(got), timeout=1.0)
            except asyncio.TimeoutError:
                continue
        return None
    finally:
        ctx.room.off("data_received", on_data)


async def load_playbook(ctx: JobContext, phone: PhoneBridge, console: bool) -> tuple[Playbook, dict[str, Any]]:
    """Where Ana's setup comes from: job metadata (the start-live function), else the phone sends it when
    Ana joins, else the local file (console mode and tests). Returns it with the call's metadata."""
    meta = job_metadata(ctx)
    if isinstance(meta.get("playbook"), dict):
        return Playbook.from_dict(meta["playbook"]), meta
    if not console:
        sent = await playbook_from_phone(ctx, phone)
        if sent:
            msg, sender = sent
            meta = {**meta, "user_id": meta.get("user_id") or str(msg.get("user_id") or "")}
            meta.setdefault("rep_identity", sender)
            logger.info("playbook from the phone (%d bytes)", len(json.dumps(msg["playbook"])))
            return Playbook.from_dict(msg["playbook"]), meta
        logger.warning("the phone didn't send a playbook; using the local file")
    return local_playbook(), meta


server = AgentServer()


@server.rtc_session(agent_name=os.getenv("AGENT_NAME", "hola-teammate"))
async def entrypoint(ctx: JobContext) -> None:
    console = ctx.is_fake_job()
    phone = PhoneBridge(ctx)
    if not console:  # console mode runs without a LiveKit room
        await ctx.connect()
    playbook, meta = await load_playbook(ctx, phone, console)
    meter = CostMeter(voice_model=MODEL_NAME, transcribe_model="" if ENGINE == "live" else TRANSCRIBE_MODEL)
    # building these clients takes ~0.5 s; keep it off the audio loop
    captions = await asyncio.to_thread(Captioner, lambda m, u: meter.add_chat("captions", m, u))
    judge = await asyncio.to_thread(OfferJudge, None, lambda m, u: meter.add_chat("price checks", m, u))
    started = time.monotonic()
    tasks: set[asyncio.Task] = set()

    today = now_local()
    base_amounts = playbook.allowed_amounts(now=today)
    pairing = playbook.pairing_options()
    facts = playbook.judge_facts(today)
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
        logger.info("flagged (%s): %s", verdict, problem)  # what was wrong, not who said what
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
            clean, is_rep, english = who_said(text, agent.waiting_for_rep, agent.rep_holding)
            amounts = amounts_in_text(clean, money_only=False)
            if is_rep:
                rep_amounts.update(amounts)
                rep_said.append(clean)
                agent.heard_rep()
            else:
                customer_amounts.update(amounts)
            label = "Rep" if is_rep else "English speaker" if english else "Customer"
            recent.append(f"{label}: {clean}")
            agent.heard("rep" if is_rep else "customer", clean)
            spawn(caption("rep" if is_rep or english else "customer", clean, verified=is_rep))
        elif item.role == "assistant":
            if agent.ana_said(text):  # "Quentin, are you there?": buzz his phone
                spawn(phone.send("calling_rep"))
            spawn(caption("hola", text))
            spawn(check_offer(text, list(recent)))
            recent.append(f"Ana: {text}")
            agent.heard("ana", text)

    def _on_data(packet) -> None:
        """The rep tapped a quick reply, or pressed or let go of his hold-to-talk button, on his phone."""
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
        elif msg.get("type") == "rep_hold":
            agent.rep_hold(bool(msg.get("down")))
        elif msg.get("type") == "playbook":
            pass  # already loaded; the phone may answer a late "hello" twice

    if not console:
        ctx.room.on("data_received", _on_data)

    ending = {"done": False}

    async def end(reason: str) -> None:
        if ending["done"]:
            return
        ending["done"] = True
        seconds = time.monotonic() - started
        known = sum(v for v in meter.breakdown(seconds).values() if v is not None)
        await phone.send("ended", reason=reason, seconds=round(seconds), cost_usd=round(known, 4))
        session.shutdown()
        ctx.shutdown(reason=reason)

    quiet = {"since": 0.0}

    async def end_if_still_quiet(since: float) -> None:
        await asyncio.sleep(max(0.0, SIGNED_UP_SILENCE_SECONDS - SILENCE_SECONDS))
        if quiet["since"] == since:  # nobody spoke again
            await end("silence")

    @session.on("user_state_changed")
    def _on_user_state(ev) -> None:
        if ev.new_state != "away":  # someone is talking again
            quiet["since"] = 0.0
            return
        # nobody has spoken for SILENCE_SECONDS
        if not agent.lead:
            spawn(end("silence"))
            return
        quiet["since"] = time.monotonic()  # signed up: they may be typing on the tablet
        spawn(end_if_still_quiet(quiet["since"]))

    async def time_limit() -> None:
        await asyncio.sleep(MAX_MINUTES * 60)
        session.generate_reply(
            instructions=f"Wrap up politely in one sentence and say {playbook.rep_name} will take it from here."
        )
        await asyncio.sleep(12)
        await end("time_limit")

    @session.on("metrics_collected")
    def _on_metrics(ev) -> None:
        if isinstance(ev.metrics, RealtimeModelMetrics):
            meter.add_realtime(ev.metrics)

    async def record_usage() -> None:
        await log_session(user_id=user_id, room=call_id, seconds=round(time.monotonic() - started),
                          model=MODEL_NAME, lead_saved=bool(agent.lead))

    async def usage_every_minute() -> None:
        while True:
            await asyncio.sleep(60)
            logger.info("cost so far: %s", meter.summary(time.monotonic() - started))
            await record_usage()

    async def final_report() -> None:
        logger.info("CALL COST: %s", meter.summary(time.monotonic() - started))
        await record_usage()

    ctx.add_shutdown_callback(final_report)
    await session.start(agent=agent, room=ctx.room)
    if playbook.needs_review(today.date().isoformat()):
        spawn(phone.send("review_prices", reviewed_on=playbook.reviewed_on))
    spawn(time_limit())
    spawn(usage_every_minute())


if __name__ == "__main__":
    cli.run_app(server)
