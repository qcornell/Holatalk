"""The second price check: a small, fast model reads each line Ana says about the offer.

number_check.py catches amounts with no source and prices tied to the wrong way to pay. What it
can't tell from numbers alone is meaning: Ana repeating the customer's own bill is fine, Ana
agreeing to a price the customer suggested ("¿no era $30?" "Sí, $30") is not. This reads the
whole line against the facts and says which it is.

It runs after Ana speaks, like the number check, and only flags. A flag shows on the rep's
screen and Ana corrects herself out loud.
"""

from __future__ import annotations

import json
import logging
import os
from collections.abc import Iterable

from number_check import amounts_in_text, tokens

logger = logging.getLogger("hola-teammate.judge")


# Words that mean a line is about the offer, so it gets checked even without a number.
_OFFER_STEMS = (
    "gratis", "free", "descuent", "discount", "contrat", "contract", "deposit", "credit", "instal",
    "cancel", "cargo", "fee", "cobr", "promo", "ofert", "impuest", "tax", "autom", "autopay",
    "debit", "cheque", "checking", "precio", "price", "mensual", "garantiz", "guarant",
)

SYSTEM = """You check one line that Ana, a Spanish-speaking sales assistant, just said out loud at a customer's door.
FACTS are the only offer terms she may state. REP SAID lists what the sales rep told her during this call; it counts as fact.
She MAY: repeat what the customer said about their own current service or bill, do simple math with those numbers (savings, yearly totals), ask questions, and say she will confirm something with the rep.
Flag the line ONLY if it states a price, fee, discount, payment condition, contract term, install promise or eligibility rule for OUR offer that is not in FACTS or REP SAID, or that contradicts them. Examples: the wrong price for a way to pay; agreeing to a price the customer suggested; a fee, deposit or discount that isn't in FACTS.
Reply with JSON only: {"ok": true} or {"ok": false, "problem": "<short English>", "fix_es": "<one short Spanish sentence that corrects it using only FACTS>"}"""


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
        f"RECENT CONVERSATION:\n{context}\n\n"
        f"ANA'S LINE:\n{line}"
    )
    return [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}]


def parse_verdict(raw: str) -> dict | None:
    """{"ok": False, "problem": ..., "fix_es": ...} when the line is wrong, else None."""
    try:
        v = json.loads(raw)
    except (TypeError, ValueError):
        return None
    if not isinstance(v, dict) or v.get("ok") is not False:
        return None
    return {"ok": False, "problem": str(v.get("problem") or "doesn't match the facts"),
            "fix_es": str(v.get("fix_es") or "")}


class OfferJudge:
    def __init__(self, client=None) -> None:
        if client is None:
            from openai import AsyncOpenAI
            client = AsyncOpenAI()
        self.client = client

    async def check(self, line: str, facts: str, rep_said: list[str], recent: list[str]) -> dict | None:
        try:
            r = await self.client.chat.completions.create(
                model=os.getenv("JUDGE_MODEL") or "gpt-4o-mini",  # read here so .env counts
                messages=build_messages(line, facts, rep_said, recent),
                response_format={"type": "json_object"},
                temperature=0,
                max_tokens=160,
            )
            return parse_verdict(r.choices[0].message.content or "")
        except Exception as e:  # a failed check never stops the call
            logger.warning("offer judge failed: %s", e)
            return None
