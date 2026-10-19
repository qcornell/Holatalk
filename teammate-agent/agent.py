"""Hola Teammate agent: a Spanish-speaking AI teammate for door-to-door reps.

The rep's phone joins a LiveKit room on speakerphone. This agent joins the same room,
talks with the customer in Spanish on OpenAI's gpt-realtime-2.1 (or GPT-Live-1 with
ENGINE=live in .env), and sends the phone:
English captions, price cards, the sign-up form, and any flagged numbers.

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

from number_check import amounts_in_text, expand_allowed, unexpected_amounts
from playbook import Playbook
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
MAX_MINUTES = float(os.getenv("MAX_MINUTES", "20"))
TIMEZONE = os.getenv("TIMEZONE", "America/Chicago")
PHONE_TOPIC = "hola"


# ---------------------------------------------------------------- phone messages

class PhoneBridge:
    """Sends small JSON messages to the rep's phone over the LiveKit data channel."""

    def __init__(self, ctx: JobContext):
        self.ctx = ctx

    async def send(self, kind: str, **data: Any) -> None:
        payload = json.dumps({"type": kind, **data}, ensure_ascii=False)
        logger.info("to phone: %s", payload)
        try:
            await self.ctx.room.local_participant.publish_data(payload, reliable=True, topic=PHONE_TOPIC)
        except Exception as e:  # console mode has no real room
            logger.debug("phone send skipped: %s", e)


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


_EN = {"the", "and", "you", "is", "are", "tell", "her", "him", "ask", "we", "it", "to", "can", "what", "how", "she", "he"}
_ES = {"el", "la", "los", "las", "que", "es", "y", "de", "por", "para", "usted", "no", "sí", "si", "mi", "su", "cuánto", "cuanto"}


def looks_english(text: str) -> bool:
    words = re.findall(r"[a-záéíóúñ']+", text.lower())
    en = sum(w in _EN for w in words)
    es = sum(w in _ES for w in words)
    return en > es


# ---------------------------------------------------------------- the agent

class TeammateAgent(Agent):
    def __init__(self, playbook: Playbook, phone: PhoneBridge):
        super().__init__(instructions=playbook.instructions(tz=TIMEZONE))
        self.playbook = playbook
        self.phone = phone
        self.lead: dict[str, str] = {}

    async def on_enter(self) -> None:
        self.session.generate_reply(
            instructions="Start now: say your first words exactly as written, then begin the pitch."
        )

    @function_tool
    async def show_price(self, context: RunContext, plan_name: str) -> str:
        """Show a plan's monthly price on the phone screen. Call it every time you quote a plan price.

        Args:
            plan_name: The plan name exactly as listed in your facts.
        """
        plan = self.playbook.find_plan(plan_name)
        if not plan or plan.price_monthly is None:
            await self.phone.send("ask_rep", question=f"Price for plan '{plan_name}'?")
            return f"That plan is not in the facts. Tell the customer you'll confirm with {self.playbook.rep_name}."
        await self.phone.send(
            "price_card", plan=plan.name, monthly=plan.price_monthly, speed=plan.speed, features=plan.features
        )
        return f"{plan.name}: ${plan.price_monthly:g} al mes. Shown on screen."

    @function_tool
    async def save_lead(
        self, context: RunContext, full_name: str, phone: str, email: str, address: str, plan: str
    ) -> str:
        """Save the customer's sign-up details after reading the phone and email back to them.

        Args:
            full_name: Customer's full name.
            phone: Customer's phone number, digits only if possible.
            email: Customer's email address.
            address: Service address.
            plan: The plan they chose.
        """
        digits = re.sub(r"\D", "", phone)
        if len(digits) == 11 and digits.startswith("1"):
            digits = digits[1:]
        problems = []
        if len(digits) != 10:
            problems.append("the phone number should have 10 digits")
        if email and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}", email.strip()):
            problems.append("the email doesn't look complete")
        if problems:
            return "Not saved yet: " + " and ".join(problems) + ". Ask the customer to repeat it."
        self.lead = {"name": full_name.strip(), "phone": digits, "email": email.strip(),
                     "address": address.strip(), "plan": plan.strip()}
        await self.phone.send("lead", fields=self.lead)
        return (f"Saved. Thank the customer and tell them {self.playbook.rep_name} will finish "
                "the sign-up with them right now.")

    @function_tool
    async def ask_rep(self, context: RunContext, question: str) -> str:
        """Hand a question to the rep when your facts don't answer it. Never guess instead.

        Args:
            question: The customer's question, in the customer's words.
        """
        await self.phone.send("ask_rep", question=question)
        return (f"Sent to the rep. Tell the customer: 'Buena pregunta. Déjeme confirmarlo con "
                f"{self.playbook.rep_name} para darle la respuesta correcta.'")


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
    started = time.monotonic()
    tasks: set[asyncio.Task] = set()

    base_amounts = playbook.allowed_amounts()
    customer_amounts: set[float] = set()
    corrections = {"count": 0}

    def spawn(coro) -> None:
        t = asyncio.create_task(coro)
        tasks.add(t)
        t.add_done_callback(tasks.discard)

    if not ctx.is_fake_job():  # console mode runs without a LiveKit room
        await ctx.connect()
    session = AgentSession(llm=build_model(playbook), user_away_timeout=SILENCE_SECONDS)

    async def caption(who: str, text: str) -> None:
        await phone.send("caption", who=who, text=text, en=await captions.to_english(text))

    async def check_numbers(text: str) -> None:
        allowed = expand_allowed(base_amounts, customer_amounts)
        bad = unexpected_amounts(text, allowed)
        if not bad:
            return
        await phone.send("flag", said=text, amounts=bad)
        if corrections["count"] < 3:  # never loop on corrections
            corrections["count"] += 1
            session.generate_reply(
                instructions=(
                    f"You just said {', '.join(f'${a:g}' for a in bad)}, which is not in your facts. "
                    "In one short Spanish sentence, correct yourself ('Perdón, me equivoqué...') using only "
                    f"your facts. If you aren't sure of the right amount, say you'll confirm with {playbook.rep_name}."
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
            customer_amounts.update(amounts_in_text(text, money_only=False))
            spawn(caption("rep" if looks_english(text) else "customer", text))
        elif item.role == "assistant":
            spawn(caption("hola", text))
            spawn(check_numbers(text))

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

    async def on_shutdown() -> None:
        seconds = round(time.monotonic() - started)
        await log_session(
            user_id=str(meta.get("user_id") or "local"),
            room=getattr(ctx.room, "name", "") or "console",
            seconds=seconds,
            model=MODEL_NAME,
            lead_saved=bool(getattr(agent, "lead", None)),
        )

    agent = TeammateAgent(playbook, phone)
    ctx.add_shutdown_callback(on_shutdown)
    await session.start(agent=agent, room=ctx.room)
    spawn(time_limit())


if __name__ == "__main__":
    cli.run_app(server)
