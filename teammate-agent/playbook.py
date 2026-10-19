"""The rep's playbook: what Hola is allowed to say.

The shape matches the app's CompanyConfig (src/config/types.ts) so the phone can
send its saved setup as-is, plus three Teammate-mode additions:

  assistantName  name Hola introduces itself with (default "Sofía")
  pitch          the rep's opening pitch, in Spanish or English
  facts          answers from the "Customer questions" tab, grouped by topic.
                 A blank answer means "unknown": Hola hands that question to the rep.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from number_check import amounts_in_text
from sales_skills import sales_skills_text


@dataclass
class Plan:
    name: str
    speed: str = ""
    price_monthly: float | None = None
    features: list[str] = field(default_factory=list)


@dataclass
class Playbook:
    rep_name: str
    company_name: str
    assistant_name: str = "Sofía"
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
            )
            for p in d.get("plans", []) or []
        ]
        return cls(
            rep_name=str(d.get("repName") or "el representante"),
            company_name=str(d.get("companyName") or ""),
            assistant_name=str(d.get("assistantName") or "Sofía"),
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

    def known_facts(self) -> dict[str, dict[str, str]]:
        return {t: {k: v for k, v in a.items() if v} for t, a in self.facts.items() if any(a.values())}

    def unknown_facts(self) -> list[str]:
        return [f"{t}: {k}" for t, a in self.facts.items() for k, v in a.items() if not v]

    def allowed_amounts(self) -> set[float]:
        """Every money amount Hola may say on its own (customer-said amounts are added live)."""
        out: set[float] = set()
        for p in self.plans:
            if p.price_monthly is not None:
                out.add(p.price_monthly)
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
        return f"¡Hola, {saludo}! Soy {self.assistant_name}, la asistente virtual de {self.rep_name}."

    def instructions(self, now: datetime | None = None, tz: str = "America/Chicago") -> str:
        plans = "\n".join(
            f"- {p.name}: ${_fmt(p.price_monthly)} al mes"
            + (f", {p.speed}" if p.speed else "")
            + (f" ({', '.join(p.features)})" if p.features else "")
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
        priced = next((p for p in self.plans if p.price_monthly is not None), None)
        sales = sales_skills_text(
            rep=self.rep_name,
            company=self.company_name,
            price=f"${_fmt(priced.price_monthly)}" if priced else "el precio",
        )

        return f"""
# Who you are
You are {self.assistant_name}, a friendly Spanish-speaking virtual assistant working door to door
with {self.rep_name}{f' from {self.company_name}' if self.company_name else ''}. The rep's phone is on
speaker at a customer's front door. You talk WITH the customer in Spanish, like a helpful bilingual
coworker. Use "usted", warm and natural Mexican Spanish, short sentences.

# Your first words (say exactly this, then continue with the pitch)
"{self.greeting(now)}"

# The pitch to run
{self.pitch or 'Introduce the service and its monthly price, then ask what they pay now.'}

# How to talk
- One or two short sentences per turn, then ask a question that moves toward signing up.
- Let the customer interrupt. If they ask something, answer it first, then go back to the pitch.
- Anything in ENGLISH is the rep talking. If the rep tells you to say something ("tell her...",
  "ask him..."), say it to the customer in Spanish. If the rep just talks to the customer in
  English, repeat it to the customer in Spanish. Never answer the customer in English.
- If asked whether you are a person, say you are a virtual assistant helping {self.rep_name}.

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
"Buena pregunta. Déjeme confirmarlo con {self.rep_name} para darle la respuesta correcta."

# Hard rules
- Never invent a price, fee, discount, refund, waived fee, date or promise.
- When you quote a plan price, call show_price so the customer sees it on the screen too.
- To sign them up, collect: full name, phone number, email, service address, and the plan.
  Read the phone number back digit by digit and spell the email back. Then call save_lead.
- Never ask for Social Security numbers, card numbers or bank details. The rep handles that.
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
