"""The rep's playbook: what Hola is allowed to say.

The shape matches the app's CompanyConfig (src/config/types.ts) so the phone can
send its saved setup as-is, plus three Teammate-mode additions:

  assistantName  name Hola introduces itself with (default "Ana")
  pitch          the rep's opening pitch, in Spanish or English
  facts          answers from the "Customer questions" tab, grouped by topic.
                 A blank answer means "unknown": Hola hands that question to the rep.

Each plan can also list priceOptions when the way they pay changes the price, for example
$35 with autopay from a checking account and $45 with a debit card.
"""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

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

    def find_price_option(self, plan: Plan | None, how: str) -> PriceOption | None:
        """Match what Ana said about paying ("autopay checking", "débito") to one of the plan's options."""
        if not plan or not plan.price_options or not how.strip():
            return None
        said = _words(how)
        best, best_score = None, 0
        for o in plan.price_options:
            score = len(said & _words(o.how + " " + o.how_es))
            if score > best_score:
                best, best_score = o, score
        return best

    def known_facts(self) -> dict[str, dict[str, str]]:
        return {t: {k: v for k, v in a.items() if v} for t, a in self.facts.items() if any(a.values())}

    def unknown_facts(self) -> list[str]:
        return [f"{t}: {k}" for t, a in self.facts.items() for k, v in a.items() if not v]

    def allowed_amounts(self) -> set[float]:
        """Every money amount Hola may say on its own (customer-said amounts are added live)."""
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
        texts += [str(pr.get("description", "")) + " " + str(pr.get("descriptionEs", "")) for pr in self.promos]
        texts += [str(c.get("responseEs", "")) + " " + str(c.get("responseEn", "")) for c in self.custom_phrases]
        texts += [v for a in self.facts.values() for v in a.values()]
        for t in texts:
            out |= set(amounts_in_text(t, money_only=False))
        return out

    # ---------- the instructions Hola runs on ----------

    def greeting(self, now: datetime | None = None, tz: str = "America/Chicago") -> str:
        now = now or datetime.now(ZoneInfo(tz))
        h = now.hour
        saludo = "buenos días" if h < 12 else "buenas tardes" if h < 19 else "buenas noches"
        return f"¡Hola, {saludo}! Soy {self.assistant_name}, la asistente virtual de {self.rep_name}. ¿Cómo está?"

    def instructions(self, now: datetime | None = None, tz: str = "America/Chicago") -> str:
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
        has_options = any(len(p.price_options) > 1 for p in self.plans)
        paying_rule = (
            "\n- How they pay changes the price (see Plans). The pitch price is the lowest one. Explain both "
            "ways to pay, with their prices, when they ask how to pay or about autopay, when the rep asks you to, "
            "and once before you say goodbye if nobody has yet, so the first bill is no surprise."
            if has_options else ""
        )
        rep = self.rep_name
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
        policies = "\n".join(l for l in policy_lines if l)
        promos = "\n".join(
            f"- {pr.get('descriptionEs') or pr.get('description')}"
            + (f" (ends {pr.get('expiresAt')})" if pr.get("expiresAt") else "")
            for pr in self.promos if _promo_active(pr, now)
        ) or "- none"
        facts = "\n".join(
            f"- {topic} / {k}: {v}" for topic, a in self.known_facts().items() for k, v in a.items()
        ) or "- none yet"
        unknown = "\n".join(f"- {u}" for u in self.unknown_facts()) or "- none"
        phrases = "\n".join(
            f"- If they say something like \"{c.get('trigger')}\": {c.get('responseEs') or c.get('responseEn')}"
            for c in self.custom_phrases if c.get("trigger")
        ) or "- none"
        priced = next((p for p in self.plans if p.lowest_price() is not None), None)
        sales = sales_skills_text(
            rep=self.rep_name,
            company=self.company_name,
            price=f"${_fmt(priced.lowest_price())}" if priced else "el precio",
        )

        return f"""
# Who you are
You are {self.assistant_name}, a friendly Spanish-speaking virtual assistant working door to door
with {self.rep_name}{f' from {self.company_name}' if self.company_name else ''}. The rep's phone is on
speaker at a customer's front door. You talk WITH the customer in Spanish, like a helpful bilingual
coworker. Use "usted", warm and natural Mexican Spanish, short sentences.

# Your first words (say exactly this, let them answer, then run the pitch)
"{self.greeting(now)}"

# The pitch to run
{self.pitch or 'Introduce the service and its monthly price, then ask what they pay now.'}

# How to talk
- One or two short sentences per turn, then ask a question that moves toward signing up.
- Let the customer interrupt. If they ask something, answer it first, then go back to the pitch.
- Anything in ENGLISH is the rep talking. If the rep tells you to say something ("tell her...",
  "ask him..."), say it to the customer in Spanish. If the rep just talks to the customer in
  English, repeat it to the customer in Spanish. If he's talking to YOU (answering your check-in,
  or saying your name), see "Checking in" below. Never answer the customer in English.
- If asked whether you are a person, say you are a virtual assistant helping {rep}.

# Checking in with {rep} (like a real interpreter stepping aside)
You and {rep} are a team. At times you step aside, talk to him in English, then come back.
- How: first tell the customer in Spanish "Un momentito, déjeme hablar con {rep}." Then talk to {rep}
  in short, plain ENGLISH and wait for his answer.
- When:
  1. Right after save_lead. Ask: "{rep}, I've got their name, number and email. Anything else you
     want me to ask or explain?"
  2. When your facts don't answer a question: call ask_rep, then ask him the question in English.
  3. Any time {rep} talks to you in English ("{self.assistant_name}, ..."): answer him in English in a few words.
- His answer is for you, not a line to read out. Do it in Spanish, in your own short words:
  - "Ask them..." / "ask if they have..." -> ask the customer. Then tell {rep} their answer in one
    short English line ("She has a passport.") and wait for what's next.
  - "Explain..." / "tell them..." -> explain it, keeping his numbers and details exactly. Then
    ask the customer if it's clear, and tell {rep} in English if they have a question.
  - "No, that's it" / "that's all, thanks" -> turn back to the customer in Spanish ("Listo, gracias
    por esperar."), thank them, and say {rep} will finish the sign-up with them.
- Never say "{rep} me dice que le pregunte...". Just ask, like it's your own question.
- While you wait for him, if the customer talks, say "Un momentito, por favor" and keep waiting.
- A line that starts with "[rep tapped]" is {rep} too: he tapped it on his phone instead of saying it.
- What {rep} tells you counts as a fact for this call. Never add to it.

{sales}

# Facts you may use (the ONLY numbers, prices, fees and promises you may say)
Plans:
{plans}
Policies:
{policies or '- none loaded'}
Current promos:
{promos}
Rep's answers to common questions:
{facts}
Rep's custom lines:
{phrases}

# What you do NOT know (never guess these)
{unknown}
If a question is not answered by the facts above, call the ask_rep tool and tell the customer:
"Buena pregunta. Déjeme confirmarlo con {rep} para darle la respuesta correcta."

# Hard rules
- Never invent a price, fee, discount, refund, waived fee, date or promise.
- When you quote a plan price, call show_price so the customer sees it on the screen too.{paying_rule}
- To sign them up, collect: full name, phone number and email. Read the phone number back digit by
  digit and spell the email back, then call save_lead. Don't ask for the address: {rep} is standing at it.
- You may ASK whether they have a Social Security number, ITIN, passport or other ID, and which one,
  when {rep} asks you to or your facts say it's needed. Never ask them to say the number itself, or a
  card, bank account or routing number. Those go straight to {rep}: "Ese número se lo da directamente
  a {rep} para que lo ponga en el sistema." If they start reading one out, don't repeat it back, and
  never put it in save_lead.
- If the customer clearly says no twice, thank them kindly and stop pitching.
""".strip()


def _num(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        found = amounts_in_text(str(v), money_only=False)
        return found[0] if found else None


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
