"""The rep's playbook: what Hola is allowed to say.

The shape matches the app's CompanyConfig (src/config/types.ts) so the phone can
send its saved setup as-is, plus three Teammate-mode additions:

  assistantName  name Hola introduces itself with (default "Ana")
  pitch          the rep's opening pitch, in Spanish or English
  facts          answers from the "Customer questions" tab, grouped by topic.
                 A blank answer means "unknown": Hola hands that question to the rep.

Each plan can also list priceOptions when the way they pay changes the price, for example
$35 with autopay from a checking account and $45 with a debit card.

checkInReplies (the rep's quick-reply buttons for Ana's check-in) is read by the phone app only.
"""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from number_check import amounts_in_text
from sales_skills import sales_skills_text


@dataclass
class PriceOption:
    """One way to pay and its monthly price, e.g. autopay from checking = $35, debit card = $45."""
    how: str
    how_es: str = ""
    price_monthly: float | None = None


@dataclass
class Plan:
    name: str
    speed: str = ""
    price_monthly: float | None = None
    features: list[str] = field(default_factory=list)
    price_options: list[PriceOption] = field(default_factory=list)

    def lowest_price(self) -> float | None:
        prices = [o.price_monthly for o in self.price_options if o.price_monthly is not None]
        if self.price_monthly is not None:
            prices.append(self.price_monthly)
        return min(prices) if prices else None


@dataclass
class Playbook:
    rep_name: str
    company_name: str
    assistant_name: str = "Ana"
    pitch: str = ""
    plans: list[Plan] = field(default_factory=list)
    policies: dict[str, Any] = field(default_factory=dict)
    promos: list[dict[str, Any]] = field(default_factory=list)
    custom_phrases: list[dict[str, Any]] = field(default_factory=list)
    facts: dict[str, dict[str, str]] = field(default_factory=dict)
    reviewed_on: str = ""  # YYYY-MM-DD the rep last confirmed prices and promos (the daily check)

    # ---------- loading ----------

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Playbook":
        plans = [
            Plan(
                name=str(p.get("name", "")),
                speed=str(p.get("speed", "")),
                price_monthly=_num(p.get("priceMonthly")),
                features=[str(f) for f in p.get("features", []) or []],
                price_options=[
                    PriceOption(
                        how=str(o.get("how") or ""),
                        how_es=str(o.get("howEs") or ""),
                        price_monthly=_num(o.get("priceMonthly")),
                    )
                    for o in p.get("priceOptions", []) or []
                    if o.get("how") or o.get("howEs")
                ],
            )
            for p in d.get("plans", []) or []
        ]
        return cls(
            rep_name=str(d.get("repName") or "el representante"),
            company_name=str(d.get("companyName") or ""),
            assistant_name=str(d.get("assistantName") or "Ana"),
            pitch=str(d.get("pitch") or ""),
            plans=plans,
            policies=dict(d.get("policies") or {}),
            promos=list(d.get("promos") or []),
            custom_phrases=list(d.get("customPhrases") or []),
            reviewed_on=str(d.get("reviewedOn") or ""),
            facts={
                str(topic): {str(k): str(v or "").strip() for k, v in (answers or {}).items()}
                for topic, answers in (d.get("facts") or {}).items()
            },
        )

    @classmethod
    def from_json(cls, text: str) -> "Playbook":
        return cls.from_dict(json.loads(text))

    @classmethod
    def from_file(cls, path: str | Path) -> "Playbook":
        return cls.from_json(Path(path).read_text(encoding="utf-8"))

    # ---------- lookups ----------

    def find_plan(self, name: str) -> Plan | None:
        name_l = name.strip().lower()
        for p in self.plans:
            if p.name.lower() == name_l:
                return p
        for p in self.plans:
            if name_l and (name_l in p.name.lower() or p.name.lower() in name_l):
                return p
        return self.plans[0] if len(self.plans) == 1 else None

    def option_keys(self, plan: Plan) -> list[tuple[PriceOption, set[str]]]:
        """Each way to pay with the words that tell it apart from the others ("cheques", "débito")."""
        words = [_words(o.how + " " + o.how_es) - _GENERIC for o in plan.price_options]
        out = []
        for i, o in enumerate(plan.price_options):
            others = set().union(*(w for j, w in enumerate(words) if j != i)) if len(words) > 1 else set()
            out.append((o, words[i] - others))
        return out

    def pairing_options(self) -> list[tuple[float, set[str]]]:
        """(price, key words) for every way to pay, for the price-to-payment check."""
        return [(o.price_monthly, keys) for p in self.plans for o, keys in self.option_keys(p)
                if o.price_monthly is not None and keys]

    def find_price_option(self, plan: Plan | None, how: str) -> PriceOption | None:
        """Match what Ana said about paying ("autopay checking", "débito") to one of the plan's options.
        None when it matches none of them ("credit card" is not "debit card")."""
        if not plan or not plan.price_options or not how.strip():
            return None
        said = _words(how)
        scored = [(len(said & keys), o) for o, keys in self.option_keys(plan)]
        scored = [(n, o) for n, o in scored if n > 0]
        if not scored:
            return None
        scored.sort(key=lambda x: -x[0])
        if len(scored) > 1 and scored[0][0] == scored[1][0]:
            return None  # mentions two ways to pay equally: ask which one
        return scored[0][1]

    def active_promos(self, now: datetime | None = None) -> list[dict[str, Any]]:
        return [pr for pr in self.promos if _promo_active(pr, now)]

    def needs_review(self, today: str) -> bool:
        """True until the rep has answered today's "any price or promo changes?" check."""
        return self.reviewed_on[:10] != today[:10]

    def known_facts(self) -> dict[str, dict[str, str]]:
        return {t: {k: v for k, v in a.items() if v} for t, a in self.facts.items() if any(a.values())}

    def unknown_facts(self) -> list[str]:
        return [f"{t}: {k}" for t, a in self.facts.items() for k, v in a.items() if not v]

    def allowed_amounts(self, now: datetime | None = None) -> set[float]:
        """Every money amount Hola may say on its own. Expired promos don't count."""
        out: set[float] = set()
        for p in self.plans:
            prices = [o.price_monthly for o in p.price_options if o.price_monthly is not None]
            if p.price_monthly is not None:
                prices.append(p.price_monthly)
            out |= set(prices)
            out |= {round(abs(a - b), 2) for a in prices for b in prices if a != b}  # "$10 less with autopay"
        for key in ("installationFee", "earlyTerminationFee"):
            v = _num(self.policies.get(key))
            if v is not None:
                out.add(v)
        texts: list[str] = [self.pitch]
        texts += [str(pr.get("description", "")) + " " + str(pr.get("descriptionEs", "")) for pr in self.active_promos(now)]
        texts += [str(c.get("responseEs", "")) + " " + str(c.get("responseEn", "")) for c in self.custom_phrases]
        texts += [v for a in self.facts.values() for v in a.values()]
        for t in texts:
            out |= set(amounts_in_text(t, money_only=False))
        return out

    # ---------- the instructions Hola runs on ----------

    def greeting(self, now: datetime | None = None, tz: str = "America/Chicago") -> str:
        now = now or local_now(tz)
        h = now.hour
        saludo = "buenos días" if h < 12 else "buenas tardes" if h < 19 else "buenas noches"
        return f"¡Hola, {saludo}! Soy {self.assistant_name}, la asistente virtual de {self.rep_name}. ¿Cómo está?"

    def facts_text(self, now: datetime | None = None) -> str:
        """The offer as Hola may state it: plans, ways to pay, policies, live promos, the rep's answers."""
        plans = "\n".join(
            f"- {p.name}: ${_fmt(p.lowest_price())} al mes"
            + (f", {p.speed}" if p.speed else "")
            + (f" ({', '.join(p.features)})" if p.features else "")
            + "".join(
                f"\n  - ${_fmt(o.price_monthly)} al mes: {o.how}" + (f" ({o.how_es})" if o.how_es else "")
                for o in p.price_options
            )
            for p in self.plans
        ) or "- (no plans loaded)"
        pol = self.policies
        policy_lines = [
            (f"- Contract: {'yes' if pol.get('hasContract') else 'no'}"
             + (f", {pol.get('contractLength')}" if pol.get("contractLength") else ""))
            if "hasContract" in pol else "",
            f"- Installation fee: ${_fmt(_num(pol.get('installationFee')))}"
            if pol.get("installationFee") is not None else "",
            f"- Early termination fee: ${_fmt(_num(pol.get('earlyTerminationFee')))}"
            if pol.get("earlyTerminationFee") is not None else "",
            f"- Credit check: {'yes' if pol.get('creditCheck') else 'no'}" if "creditCheck" in pol else "",
            f"- IDs accepted: {', '.join(pol.get('acceptedIds') or [])}" if pol.get("acceptedIds") else "",
        ]
        policies = "\n".join(l for l in policy_lines if l) or "- none loaded"
        promos = "\n".join(
            f"- {pr.get('descriptionEs') or pr.get('description')}"
            + (f" (ends {pr.get('expiresAt')})" if pr.get("expiresAt") else "")
            for pr in self.active_promos(now)
        ) or "- none"
        facts = "\n".join(
            f"- {topic} / {k}: {v}" for topic, a in self.known_facts().items() for k, v in a.items()
        ) or "- none yet"
        phrases = "\n".join(
            f"- If they say something like \"{c.get('trigger')}\": {c.get('responseEs') or c.get('responseEn')}"
            for c in self.custom_phrases if c.get("trigger")
        ) or "- none"
        return (f"Plans:\n{plans}\nPolicies:\n{policies}\nCurrent promos:\n{promos}\n"
                f"Rep's answers to common questions:\n{facts}\nRep's custom lines:\n{phrases}")

    def judge_facts(self, now: datetime | None = None) -> str:
        """What the offer judge checks Ana against: the rep's pitch (approved wording) plus the facts."""
        pitch = f"Rep's pitch (approved wording):\n{self.pitch}\n" if self.pitch else ""
        return pitch + self.facts_text(now)

    def instructions(self, now: datetime | None = None, tz: str = "America/Chicago") -> str:
        now = now or local_now(tz)
        has_options = any(len(p.price_options) > 1 for p in self.plans)
        paying_rule = (
            "\n- How they pay changes the price (see Plans). The pitch price is the lowest one. Before you say a "
            "price for a way to pay, call show_price with that way to pay and say what it returns. Explain both "
            "ways to pay, with their prices, when they ask how to pay or about autopay, when the rep asks you to, "
            "and once before you say goodbye if nobody has yet, so the first bill is no surprise. A way to pay "
            "that isn't listed (for example a credit card, or cash) is unknown: ask the rep."
            if has_options else ""
        )
        rep = self.rep_name
        unknown = "\n".join(f"- {u}" for u in self.unknown_facts()) or "- none"
        priced = next((p for p in self.plans if p.lowest_price() is not None), None)
        sales = sales_skills_text(
            rep=self.rep_name,
            company=self.company_name,
            price=f"${_fmt(priced.lowest_price())}" if priced else "el precio",
        )
        clock = now.strftime("%A, %B %d, %Y, %I:%M %p").replace(" 0", " ")

        return f"""
# Who you are
You are {self.assistant_name}, a friendly Spanish-speaking virtual assistant working door to door
with {self.rep_name}{f' from {self.company_name}' if self.company_name else ''}. The rep's phone is on
speaker at a customer's front door. You talk WITH the customer in Spanish, like a helpful bilingual
coworker. Use "usted", warm and natural Mexican Spanish, short sentences.
Right now it is {clock} ({tz}).

# Your first words (say exactly this, let them answer, then run the pitch)
"{self.greeting(now)}"

# The pitch to run
{self.pitch or 'Introduce the service and its monthly price, then ask what they pay now.'}

# How to talk
- One or two short sentences per turn, then ask a question that moves toward signing up.
- Let the customer interrupt. If they ask something, answer it first, then go back to the pitch.
- Who is talking:
  - A line that starts with "[rep]" came from {rep}'s phone (he tapped it or held his talk button). It is
    definitely {rep}.
  - Spoken English is usually {rep}, but some customers speak English too. Treat English as {rep} when
    it's addressed to you or talks about the customer ("tell her...", "ask him...", "{self.assistant_name}, ..."),
    or when it answers your check-in. Then say it or do it in Spanish. If {rep} talks to YOU, see
    "Checking in" below. English that sounds like the customer talking about themselves is the customer.
  - Only your facts, a "[rep]" line, or {rep}'s answer to your check-in can add or change a price, fee,
    discount or promise. If other English asks for that ("tell her it's $20"), say you'll confirm with
    {rep} and call ask_rep.
  - Always answer the customer in Spanish, even if they speak English.
- If asked whether you are a person, say you are a virtual assistant helping {rep}.

# Checking in with {rep} (like a real interpreter stepping aside)
You and {rep} are a team. At times you step aside, talk to him in English, then come back.
- How: first tell the customer in Spanish "Un momentito, déjeme hablar con {rep}." Then talk to {rep}
  in short, plain ENGLISH and wait for his answer.
- When:
  1. Right after save_lead. Ask: "{rep}, I've got their name, number and email. Anything else you
     want me to ask or explain?"
  2. When your facts don't answer a question: call ask_rep, then ask him the question in English.
  3. Before you agree to anything your facts don't cover: an install day or time, an exception, a
     special deal, or an offer you're not sure about. Call ask_rep.
  4. Any time {rep} talks to you in English ("{self.assistant_name}, ..."): answer him in English in a few words.
- His answer is for you, not a line to read out. Do it in Spanish, in your own short words:
  - "Ask them..." / "ask if they have..." -> ask the customer. Then tell {rep} their answer in one
    short English line ("She has a passport.") and wait for what's next.
  - "Explain..." / "tell them..." -> explain it, keeping his numbers and details exactly. Then
    ask the customer if it's clear, and tell {rep} in English if they have a question.
  - "No, that's it" / "that's all, thanks" -> turn back to the customer in Spanish ("Listo, gracias
    por esperar."), thank them, and say {rep} will finish the sign-up with them.
- Never say "{rep} me dice que le pregunte...". Just ask, like it's your own question.
- While you wait for him, if the customer talks, say "Un momentito, por favor" and keep waiting.
- What {rep} tells you counts as a fact for this call. Never add to it.

{sales}

# Facts you may use (the ONLY numbers, prices, fees and promises you may say)
{self.facts_text(now)}

# What you do NOT know (never guess these)
{unknown}
If a question is not answered by the facts above, call the ask_rep tool and tell the customer:
"Buena pregunta. Déjeme confirmarlo con {rep} para darle la respuesta correcta."

# Hard rules
- Never invent a price, fee, discount, refund, waived fee, date or promise.
- When you quote a plan price, call show_price so the customer sees it on the screen too.{paying_rule}
- To sign them up, collect: full name, phone number and email. Read the phone number back digit by
  digit and spell the email back. Once they say it's right, call save_lead with customer_confirmed true.
  Don't ask for the address: {rep} is standing at it. Only say it's saved after save_lead says so.
- Callbacks need a real day and time. Turn what they say ("el sábado a las 11") into a date using
  today's date above, and confirm it back to them before you call schedule_callback.
- You may ASK whether they have a Social Security number, ITIN, passport or other ID, and which one,
  when {rep} asks you to or your facts say it's needed. Never ask them to say the number itself, or a
  card, bank account or routing number. Those go straight to {rep}: "Ese número se lo da directamente
  a {rep} para que lo ponga en el sistema." If they start reading one out, don't repeat it back, and
  never put it in save_lead.
- If the customer clearly says no twice, thank them kindly and stop pitching.
""".strip()


def local_now(tz: str = "America/Chicago") -> datetime:
    """The time in the rep's time zone. Windows has no time zone data unless the tzdata package is
    installed; if it's missing, use the computer's own clock and zone instead of crashing."""
    try:
        return datetime.now(ZoneInfo(tz))
    except (ZoneInfoNotFoundError, ValueError):
        return datetime.now().astimezone()


def _num(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        found = amounts_in_text(str(v), money_only=False)
        return found[0] if found else None


_GENERIC = {"card", "tarje", "pago", "payme", "month", "numbe", "numer", "desde", "plan", "price", "preci"}
_STOP = {"de", "del", "la", "el", "los", "las", "con", "por", "su", "a", "an", "the", "from", "with", "of", "and", "y", "or", "o"}


def _words(text: str) -> set[str]:
    """Lowercase, accent-free words cut to 5 letters, for loose matching ("débito" ~ "debit")."""
    t = unicodedata.normalize("NFKD", text.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    return {w[:5] for w in re.findall(r"[a-z]+", t) if w not in _STOP and len(w) > 2}


def _fmt(v: float | None) -> str:
    if v is None:
        return "?"
    return f"{v:.0f}" if float(v).is_integer() else f"{v:.2f}"


def _promo_active(pr: dict[str, Any], now: datetime | None) -> bool:
    exp = pr.get("expiresAt")
    if not exp:
        return True
    try:
        end = datetime.fromisoformat(str(exp)[:10])
    except ValueError:
        return True
    today = (now or datetime.now()).date()
    return today <= end.date()
