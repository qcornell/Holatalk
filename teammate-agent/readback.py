"""Checks that a sign-up was really read back and confirmed, from what was actually said.

The model's own "customer_confirmed: true" isn't enough: in a test call Ana spelled an email back, the
customer said "No", gave it again, and she saved the wrong one as confirmed. So save_lead also checks
the transcript: Ana read the phone back digit by digit and spelled the email back, and the customer
said yes afterwards (and didn't say no after their last yes).
"""

from __future__ import annotations

import re
import unicodedata

DIGIT_WORDS = {
    "cero": "0", "zero": "0", "uno": "1", "one": "1", "dos": "2", "two": "2", "tres": "3", "three": "3",
    "cuatro": "4", "four": "4", "cinco": "5", "five": "5", "seis": "6", "six": "6", "siete": "7",
    "seven": "7", "ocho": "8", "eight": "8", "nueve": "9", "nine": "9",
}
# letter names as they are spoken when spelling ("eme, a, erre" / "em, ay, ar")
LETTER_NAMES = {
    "be": "b", "ce": "c", "de": "d", "efe": "f", "ge": "g", "hache": "h", "jota": "j", "ka": "k",
    "ele": "l", "eme": "m", "ene": "n", "pe": "p", "cu": "q", "erre": "r", "ese": "s", "te": "t",
    "uve": "v", "ve": "v", "equis": "x", "ye": "y", "zeta": "z",
    "bee": "b", "cee": "c", "dee": "d", "gee": "g", "jay": "j", "kay": "k", "em": "m", "en": "n",
    "pee": "p", "cue": "q", "queue": "q", "ar": "r", "ess": "s", "tee": "t", "vee": "v", "ex": "x",
    "zee": "z", "zed": "z",
}

_YES = re.compile(
    r"^(?:s[ií]|yes|yeah|yep|yup|correct[oa]?|exact[oa]?|eso es|as[ií] es|est[aá] bien|todo bien|right|"
    r"that'?s right|that'?s it|ok(?:ay)?|perfect[oa]?|aj[aá]|claro|mm+[- ]?hmm|uh[- ]?huh|mhm)\b",
    re.I,
)
_NO = re.compile(r"^(?:no\b|nope|incorrect|wrong|est[aá] mal|that'?s not|that isn'?t)", re.I)


def _plain(text: str) -> str:
    t = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in t if not unicodedata.combining(c))


def spoken_forms(text: str) -> tuple[str, str]:
    """A read-back run together two ways: as written ("m-a-r-i-a arroba ejemplo" -> "mariaarrobaejemplo"),
    and with spoken digits and letter names turned into characters ("nueve, siete" -> "97",
    "eme, a" -> "ma")."""
    t = _plain(text)
    t = re.sub(r"\b(?:doble (?:ve|u|uve)|double (?:u|you))\b", " w ", t)
    t = re.sub(r"\bi griega\b", " y ", t)
    tokens = re.findall(r"[a-z0-9]+", t)
    raw = "".join(tokens)
    mapped = "".join(DIGIT_WORDS.get(w) or LETTER_NAMES.get(w) or w for w in tokens)
    return raw, mapped


def answer_kind(text: str) -> str:
    """"yes", "no" or "" for a customer's reply to a read-back."""
    t = text.strip().lstrip("¿¡\"'").strip()
    if _NO.match(t):
        return "no"
    if _YES.match(t):
        return "yes"
    return ""


def readback_problem(lines: list[tuple[str, str]], phone: str, email: str) -> str:
    """Why the sign-up isn't confirmed yet, or "" if it is. `lines` are (who, text) with who = "ana",
    "customer" or "rep". `phone` is 10 digits; `email` is "" when they have none."""
    local = re.sub(r"[^a-z0-9]", "", _plain(email.split("@")[0])) if email else ""
    last_read: dict[str, int] = {}
    for i, (who, text) in enumerate(lines):
        if who != "ana":
            continue
        raw, mapped = spoken_forms(text)
        if phone and phone in re.sub(r"\D", "", mapped):
            last_read["phone"] = i
        if local and (local in raw or local in mapped):
            last_read["email"] = i
    if "phone" not in last_read:
        return "read the phone number back digit by digit and ask if it's right. Then wait for their answer."
    if local and "email" not in last_read:
        return ("spell the email back letter by letter (exactly what you're saving) and ask if it's right. "
                "Then wait for their answer.")
    for item in ("email", "phone"):
        if item not in last_read:
            continue
        answers = [answer_kind(text) for who, text in lines[last_read[item] + 1:] if who == "customer"]
        answers = [a for a in answers if a]
        if answers and answers[-1] == "no":
            return (f"they said the {item} you read back isn't right. Use what they said after that, read it "
                    "back again, and wait for a yes.")
        if not answers:
            return f"they haven't said yes to the {item} you read back. Ask if it's right and wait for their answer."
    return ""
