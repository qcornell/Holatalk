"""Find money amounts in Spanish (or English) speech and check them against the playbook.

Hola speaks before anything can check it, so this runs on what it just said. Any amount
that isn't in the playbook, wasn't said by the customer or the rep, and isn't simple math on
those (a savings difference, a yearly total) gets flagged to the rep and corrected out loud.
"""

from __future__ import annotations

import re
import unicodedata

_UNITS = {
    "cero": 0, "un": 1, "uno": 1, "una": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5,
    "seis": 6, "siete": 7, "ocho": 8, "nueve": 9, "diez": 10, "once": 11, "doce": 12,
    "trece": 13, "catorce": 14, "quince": 15, "dieciseis": 16, "diecisiete": 17,
    "dieciocho": 18, "diecinueve": 19, "veinte": 20, "veintiun": 21, "veintiuno": 21,
    "veintiuna": 21, "veintidos": 22, "veintitres": 23, "veinticuatro": 24, "veinticinco": 25,
    "veintiseis": 26, "veintisiete": 27, "veintiocho": 28, "veintinueve": 29, "treinta": 30,
    "cuarenta": 40, "cincuenta": 50, "sesenta": 60, "setenta": 70, "ochenta": 80, "noventa": 90,
    "cien": 100, "ciento": 100, "doscientos": 200, "doscientas": 200, "trescientos": 300,
    "trescientas": 300, "cuatrocientos": 400, "cuatrocientas": 400, "quinientos": 500,
    "quinientas": 500, "seiscientos": 600, "seiscientas": 600, "setecientos": 700,
    "setecientas": 700, "ochocientos": 800, "ochocientas": 800, "novecientos": 900,
    "novecientas": 900,
    # English, for what the rep says ("tell her it's forty-five with debit")
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
    "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14,
    "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20,
    "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90,
}
_HUNDRED = {"hundred"}  # English multiplies ("two hundred"); Spanish "doscientos" is one word
_THOUSAND = {"mil", "thousand"}
_AND = {"y", "and"}
_MONEY_AFTER = {"dolar", "dolares", "dollar", "dollars", "bucks", "mensual", "mensuales"}
_PER = {"al", "por", "cada", "a", "per", "each", "every"}
_MONTH = {"mes", "month", "mensualidad"}

_TOKEN = re.compile(r"\$|\d[\d,]*(?:\.\d+)?|[a-zñ]+")


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in text if not unicodedata.combining(c))


def _digits(tok: str) -> float | None:
    raw = tok.replace(",", "")
    if not raw or len(raw.split(".")[0]) > 6:  # phone numbers, zip codes, long ids
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def _parse_words(toks: list[str], i: int) -> tuple[float, int] | None:
    """Parse a run of Spanish or English number words starting at toks[i]. Returns (value, next_index)."""
    if toks[i] not in _UNITS and toks[i] not in _THOUSAND and toks[i] not in _HUNDRED:
        return None
    total, current, j, seen = 0, 0, i, False
    while j < len(toks):
        t = toks[j]
        if t in _UNITS:
            current += _UNITS[t]
            seen = True
            j += 1
        elif t in _HUNDRED:
            current = (current or 1) * 100
            seen = True
            j += 1
        elif t in _THOUSAND:
            current = (current or 1) * 1000
            total += current
            current = 0
            seen = True
            j += 1
        elif t in _AND and seen and j + 1 < len(toks) and toks[j + 1] in _UNITS:
            j += 1
        else:
            break
    value = float(total + current)
    # "treinta y cinco con noventa y nueve" -> 35.99
    if j + 1 < len(toks) and toks[j] == "con" and toks[j + 1] in _UNITS:
        cents = _parse_words(toks, j + 1)
        if cents and cents[0] < 100:
            value += cents[0] / 100
            j = cents[1]
    return value, j


def amounts_in_text(text: str, money_only: bool = True) -> list[float]:
    """Amounts in the text. With money_only, only ones said as money ($35, 35 dólares, 35 al mes)."""
    toks = _TOKEN.findall(_norm(text))
    out: list[float] = []
    i = 0
    while i < len(toks):
        tok = toks[i]
        start = i
        if tok[0].isdigit():
            val, end = _digits(tok), i + 1
        else:
            parsed = _parse_words(toks, i)
            if not parsed:
                i += 1
                continue
            val, end = parsed
        i = max(end, i + 1)
        if val is None:
            continue
        if not money_only or _is_money(toks, start, end):
            out.append(round(val, 2))
    return out


def _is_money(toks: list[str], start: int, end: int) -> bool:
    if start > 0 and toks[start - 1] == "$":
        return True
    after = toks[end:end + 3]
    if after and after[0] in _MONEY_AFTER:
        return True
    if len(after) >= 2 and after[0] in _PER and after[1] in _MONTH:
        return True
    return False


def expand_allowed(base: set[float], customer_said: set[float]) -> set[float]:
    """What Hola may say: playbook amounts, amounts the customer or rep said, savings and yearly totals."""
    allowed = set(base) | set(customer_said)
    allowed |= {round(abs(c - b), 2) for c in customer_said for b in base}
    allowed |= {round(b * 12, 2) for b in base}
    return allowed


def unexpected_amounts(said_text: str, allowed: set[float]) -> list[float]:
    """Money amounts in what Hola said that it had no source for."""
    bad: list[float] = []
    for amt in amounts_in_text(said_text, money_only=True):
        if not any(abs(amt - a) < 0.011 for a in allowed):
            bad.append(amt)
    return bad
