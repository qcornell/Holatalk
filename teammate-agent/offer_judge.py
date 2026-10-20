"""The second price check: a model reads each line Ana says about the offer.

number_check.py catches amounts with no source and prices tied to the wrong way to pay. What it
can't tell from numbers alone is meaning: Ana repeating the customer's own bill is fine, Ana
agreeing to a price the customer suggested ("¿no era $30?" "Sí, $30") is not, and neither is a
definite answer the facts don't cover ("no hay depósito"). This reads the line against the facts.

It runs after Ana speaks, like the number check, and only flags. A flag shows on the rep's
screen and Ana corrects herself out loud.

The model and wording were picked with eval_judge.py (13 lines, 3 runs each, Oct 19, 2026):
gpt-5.6-luna and gpt-4.1 got all 39 right; gpt-4o-mini flagged Ana's correct pitch 6 times in 10
with the first wording and missed 6 of 18 wrong lines with this one. Re-run it after any change.
"""

from __future__ import annotations

import json
import logging
import os
import re
import unicodedata
from collections.abc import Iterable

from number_check import amounts_in_text, tokens

logger = logging.getLogger("hola-teammate.judge")

DEFAULT_MODEL = "gpt-5.6-luna"

# Words that mean a line is about the offer, so it gets checked even without a number.
_OFFER_STEMS = (
    "gratis", "free", "descuent", "discount", "contrat", "contract", "deposit", "credit", "instal",
    "cancel", "cargo", "fee", "cobr", "promo", "ofert", "impuest", "tax", "autom", "autopay",
    "debit", "cheque", "checking", "precio", "price", "mensual", "garantiz", "guarant",
)

SYSTEM = """You check ONE line that Ana, a Spanish-speaking sales assistant, just said at a customer's door, against the FACTS of the offer.
Judge ONLY the text under ANA'S LINE. The conversation before it is only there so you know what the customer said; never judge earlier lines.
Ana's line is WRONG only if it states, as part of OUR offer, something specific that FACTS and REP SAID don't support:
- a price, fee, deposit, discount or free item that isn't in FACTS, or a FACTS price tied to the wrong plan or the wrong way to pay;
- agreeing to a number the customer suggested that isn't in FACTS;
- a definite answer about a term FACTS don't cover (for example "no hay depósito" when FACTS say nothing about a deposit).
Everything else is fine: prices and terms exactly as in FACTS, the rep's pitch wording, repeating the customer's own numbers about their current service, savings math, questions, small talk, saying she will check with the rep.
If you are not sure, it is fine.
Reply with JSON only: {"ok": true} or {"ok": false, "quote": "<the exact wrong words, copied from ANA'S LINE>", "problem": "<short English>", "fix_es": "<one short Spanish correction using only FACTS>"}"""


def worth_checking(line: str, customer_only_amounts: Iterable[float]) -> bool:
    """Lines with a money amount, or offer words like "gratis" or "contrato", get read by the judge."""
    if list(customer_only_amounts) or amounts_in_text(line, money_only=True):
        return True
    toks = tokens(line)
    return any(t.startswith(stem) for t in toks for stem in _OFFER_STEMS)


def build_messages(line: str, facts: str, rep_said: list[str], recent: list[str]) -> list[dict]:
    rep_lines = "\n".join(f"- {r}" for r in rep_said) or "- nothing"
    context = "\n".join(recent) or "(start of call)"
    user = (
        f"FACTS:\n{facts}\n\n"
        f"REP SAID THIS CALL:\n{rep_lines}\n\n"
        f"EARLIER IN THE CONVERSATION (context only, do not judge):\n{context}\n\n"
        f"ANA'S LINE (judge only this):\n{line}"
    )
    return [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}]


def _norm(text: str) -> str:
    t = unicodedata.normalize("NFKD", text.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9$]+", " ", t).strip()


def parse_verdict(raw: str, line: str) -> dict | None:
    """{"ok": False, "problem": ..., "fix_es": ...} when the line is wrong, else None.
    A flag whose quoted words aren't actually in Ana's line is ignored: it's judging something else."""
    try:
        v = json.loads(raw)
    except (TypeError, ValueError):
        return None
    if not isinstance(v, dict) or v.get("ok") is not False:
        return None
    quote = str(v.get("quote") or "")
    if not quote or _norm(quote) not in _norm(line):
        return None
    return {"ok": False, "quote": quote, "problem": str(v.get("problem") or "doesn't match the facts"),
            "fix_es": str(v.get("fix_es") or "")}


def request_args(model: str, messages: list[dict]) -> dict:
    args: dict = {"model": model, "messages": messages, "response_format": {"type": "json_object"}}
    if model.startswith(("gpt-5", "o1", "o3", "o4")):  # reasoning models take different settings
        args["max_completion_tokens"] = 1200
        args["reasoning_effort"] = os.getenv("JUDGE_EFFORT") or "low"
    else:
        args["temperature"] = 0
        args["max_tokens"] = 200
    return args


class OfferJudge:
    def __init__(self, client=None, on_usage=None) -> None:
        if client is None:
            from openai import AsyncOpenAI
            client = AsyncOpenAI()
        self.client = client
        self.on_usage = on_usage  # (model, usage) -> None, for the cost meter

    async def check(self, line: str, facts: str, rep_said: list[str], recent: list[str]) -> dict | None:
        model = os.getenv("JUDGE_MODEL") or DEFAULT_MODEL  # read here so .env counts
        try:
            r = await self.client.chat.completions.create(
                **request_args(model, build_messages(line, facts, rep_said, recent))
            )
            if self.on_usage and getattr(r, "usage", None) is not None:
                self.on_usage(model, r.usage)
            return parse_verdict(r.choices[0].message.content or "", line)
        except Exception as e:  # a failed check never stops the call
            logger.warning("offer judge failed: %s", type(e).__name__)
            return None
