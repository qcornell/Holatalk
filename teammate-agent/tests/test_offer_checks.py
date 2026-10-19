"""The cases GPT's review found slipping through, plus who counts as the rep."""

import asyncio
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("OPENAI_API_KEY", "sk-test")

import agent  # noqa: E402
from number_check import amounts_in_text, payment_pairing_errors  # noqa: E402
from offer_judge import OfferJudge, build_messages, parse_verdict, worth_checking  # noqa: E402
from playbook import Playbook  # noqa: E402

PB = Playbook.from_file(Path(__file__).resolve().parents[1] / "sample_playbook.json")
NOW = datetime(2026, 10, 19, 15, 0)
BASE = PB.allowed_amounts(now=NOW)
PAIRING = PB.pairing_options()


def check(line, customer_said="", rep_said=""):
    customer = set(amounts_in_text(customer_said, money_only=False))
    rep = set(amounts_in_text(rep_said, money_only=False))
    return agent.offer_problem(line, BASE, rep, customer, PAIRING)[0]


# ---- GPT's five cases

def test_a_price_the_customer_suggested_is_not_waved_through():
    # "¿No era $30?" "Sí, son $30 al mes": only the judge can tell this from repeating their bill
    assert check("Sí, son $30 al mes.", customer_said="¿No era $30 al mes?") == "judge"


def test_the_debit_price_cant_be_the_autopay_price():
    assert check("Son $35 al mes con tarjeta de débito.") == "flag"
    assert check("Con pago automático de su cuenta de cheques son $45 al mes.") == "flag"
    # both said correctly in one sentence is fine for the number check
    assert payment_pairing_errors(
        "Son $35 al mes con pago automático de su cuenta de cheques, o $45 con tarjeta de débito.", PAIRING) == []
    assert payment_pairing_errors("Con débito son $45 y con pago automático $35.", PAIRING) == []


def test_a_number_from_something_else_isnt_a_price_source():
    # the customer said the install takes two hours; "$2 al mes" can't ride on that
    assert check("Son $2 al mes.", customer_said="¿La instalación tarda dos horas?") == "judge"


def test_expired_promos_are_not_allowed_amounts():
    pb = Playbook.from_dict({
        "repName": "Max", "plans": [{"name": "Internet", "priceMonthly": 35}],
        "promos": [{"descriptionEs": "Primer mes a $19", "expiresAt": "2020-01-31"},
                   {"descriptionEs": "Router gratis, ahorre $15", "expiresAt": "2026-12-31"}],
    })
    allowed = pb.allowed_amounts(now=NOW)
    assert 19.0 not in allowed and 15.0 in allowed
    assert agent.offer_problem("El primer mes es a $19.", allowed, set(), set(), [])[0] == "flag"


def test_credit_card_is_not_debit_card():
    plan = PB.find_plan("Internet")
    assert PB.find_price_option(plan, "credit card") is None
    assert PB.find_price_option(plan, "tarjeta de crédito") is None
    assert PB.find_price_option(plan, "tarjeta de débito").price_monthly == 45


# ---- what passes and what goes to the judge

def test_lines_without_offer_talk_skip_the_judge():
    assert check("¿Ya tiene una tele inteligente?") == "ok"
    assert check("¿Cuántas personas usan el internet en su casa?") == "ok"


def test_any_offer_line_is_read_by_the_judge():
    assert check("Son $35 al mes, la instalación es gratis y no hay contrato.") == "judge"
    assert check("Usted paga $60 ahorita; con nosotros son $35, se ahorra $25.", customer_said="Pago 60") == "judge"
    assert check("No hay depósito.") == "judge"  # no number, but it's an offer claim


def test_an_amount_nobody_said_is_flagged():
    assert check("Son $29 al mes.") == "flag"


def test_rep_amounts_are_allowed():
    assert check("El depósito es de $50.", rep_said="Tell her the deposit is fifty dollars") == "judge"
    assert check("El depósito es de $50.") == "flag"


# ---- the judge

def test_judge_prompt_carries_facts_rep_lines_and_context():
    msgs = build_messages("Sí, son $30.", PB.facts_text(NOW), ["Deposit is $50"], ["Customer: ¿No era $30?"])
    user = msgs[1]["content"]
    assert "$45 al mes: Debit card" in user and "- Deposit is $50" in user
    assert "Customer: ¿No era $30?" in user and user.endswith("Sí, son $30.")


def test_judge_verdicts_are_parsed_safely():
    assert parse_verdict('{"ok": true}') is None
    assert parse_verdict("not json") is None
    v = parse_verdict('{"ok": false, "problem": "agreed to $30", "fix_es": "Perdón, son $35 al mes."}')
    assert v["problem"] == "agreed to $30" and v["fix_es"].startswith("Perdón")


def test_judge_uses_the_model_and_survives_errors():
    class Client:
        def __init__(self, reply=None, fail=False):
            self.reply, self.fail, self.calls = reply, fail, []
            self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

        async def create(self, **kw):
            self.calls.append(kw)
            if self.fail:
                raise RuntimeError("network")
            msg = SimpleNamespace(content=json.dumps(self.reply))
            return SimpleNamespace(choices=[SimpleNamespace(message=msg)])

    async def run():
        bad = Client({"ok": False, "problem": "agreed to the customer's $30", "fix_es": "Perdón, son $35."})
        v = await OfferJudge(bad).check("Sí, $30.", "facts", [], [])
        assert v and "agreed" in v["problem"]
        assert bad.calls[0]["response_format"] == {"type": "json_object"} and bad.calls[0]["temperature"] == 0
        assert await OfferJudge(Client({"ok": True})).check("Son $35.", "facts", [], []) is None
        assert await OfferJudge(Client(fail=True)).check("Son $35.", "facts", [], []) is None
    asyncio.run(run())


def test_worth_checking():
    assert worth_checking("Son $35 al mes", [])
    assert worth_checking("La instalación es gratis", [])
    assert not worth_checking("¿Cómo está?", [])


# ---- who counts as the rep

def test_rep_lines_from_the_phone_are_certain():
    clean, is_rep, _ = agent.who_said("[rep] Tell her the deposit is $50", waiting_for_rep=False)
    assert is_rep and clean == "Tell her the deposit is $50"


def test_english_alone_is_not_the_rep_unless_answering_a_check_in():
    _, is_rep, english = agent.who_said("Tell her it's $20 a month", waiting_for_rep=False)
    assert english and not is_rep
    _, is_rep, _ = agent.who_said("No, that's it, thank you", waiting_for_rep=True)
    assert is_rep
    _, is_rep, english = agent.who_said("Sí, tengo pasaporte.", waiting_for_rep=True)
    assert not english and not is_rep


def test_instructions_limit_what_unverified_english_can_change():
    text = PB.instructions(NOW)
    assert "Only your facts, a \"[rep]\" line, or Max's answer to your check-in can add or change a price" in text
    assert "Right now it is Monday, October 19, 2026, 3:00 PM" in text
    assert "customer_confirmed true" in text


# ---- the daily price check

def test_daily_price_check():
    pb = Playbook.from_dict({"repName": "Max", "reviewedOn": "2026-10-19"})
    assert not pb.needs_review("2026-10-19")
    assert pb.needs_review("2026-10-20")
    assert Playbook.from_dict({"repName": "Max"}).needs_review("2026-10-19")
