"""Ana checking in with the rep, and the $35 autopay / $45 debit pricing."""

import asyncio
import os
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("OPENAI_API_KEY", "sk-test")

import agent  # noqa: E402
from number_check import amounts_in_text, expand_allowed, unexpected_amounts  # noqa: E402
from playbook import Playbook  # noqa: E402

PB = Playbook.from_file(Path(__file__).resolve().parents[1] / "sample_playbook.json")
TEXT = PB.instructions(datetime(2026, 10, 19, 15, 0))


class FakePhone:
    def __init__(self):
        self.sent = []

    async def send(self, kind, **data):
        self.sent.append((kind, data))


# ---- pricing

def test_both_prices_are_in_the_instructions():
    plans = TEXT.split("Plans:")[1].split("Policies:")[0]
    assert "Internet: $35 al mes" in plans
    assert "$35 al mes: Autopay from a checking account" in plans
    assert "$45 al mes: Debit card" in plans
    assert "How they pay changes the price" in TEXT


def test_45_and_the_10_difference_are_allowed():
    allowed = PB.allowed_amounts()
    assert {35.0, 45.0, 10.0} <= allowed
    assert unexpected_amounts("Son $45 al mes con tarjeta de débito, $10 más", allowed) == []
    assert unexpected_amounts("Son $40 al mes", allowed) == [40.0]


def test_payment_matches_the_right_option():
    plan = PB.find_plan("Internet")
    assert PB.find_price_option(plan, "autopay checking").price_monthly == 35
    assert PB.find_price_option(plan, "cuenta de cheques").price_monthly == 35
    assert PB.find_price_option(plan, "tarjeta de débito").price_monthly == 45
    assert PB.find_price_option(plan, "debit card").price_monthly == 45
    assert PB.find_price_option(plan, "") is None


def test_amounts_the_rep_says_in_english_are_heard():
    assert amounts_in_text("tell her it's forty-five with debit", money_only=False) == [45.0]
    assert amounts_in_text("thirty five dollars a month") == [35.0]
    assert amounts_in_text("a hundred and fifty dollars") == [150.0]
    assert amounts_in_text("two hundred dollars") == [200.0]
    # a deposit Max says out loud becomes allowed for Ana to repeat
    heard = set(amounts_in_text("Tell her the deposit is fifty dollars", money_only=False))
    assert unexpected_amounts("El depósito es de $50", expand_allowed(PB.allowed_amounts(), heard)) == []


# ---- the check-in

def test_instructions_explain_the_check_in():
    assert "# Checking in with Max" in TEXT
    assert "Un momentito, déjeme hablar con Max." in TEXT
    assert "Anything else you" in TEXT and "\"No, that's it\"" in TEXT
    assert '"[rep]"' in TEXT


def test_ana_may_ask_about_ids_but_never_takes_the_numbers():
    rules = TEXT.split("# Hard rules")[1]
    assert "You may ASK whether they have a Social Security number" in rules
    assert "Never ask them to say the number itself" in rules
    assert "Never ask for Social Security numbers" not in TEXT  # the old blanket rule is gone


class FakeStore:
    def __init__(self, ok=True):
        self.ok = ok
        self.rows = []

    async def __call__(self, record):
        self.rows.append(record)
        return self.ok


def make_agent(ok=True):
    phone, store = FakePhone(), FakeStore(ok)
    a = agent.TeammateAgent(PB, phone, call_id="room-1", user_id="max", store=store)
    a.wait_for_rep = lambda: None  # no timers in tests
    return a, phone, store


def test_save_lead_saves_first_then_checks_in_once():
    async def run():
        a, phone, store = make_agent()
        out = await a.save_lead(None, "María López", "(979) 555-0142", "maria@ejemplo.com", True,
                                payment="debit card")
        assert "Max, I've got their name, number and email" in out
        assert [k for k, _ in phone.sent] == ["lead", "check_in"]
        assert phone.sent[0][1]["status"] == "saved"
        assert phone.sent[0][1]["fields"]["monthly"] == 45
        assert "address" not in phone.sent[0][1]["fields"]
        assert store.rows[0]["call_id"] == "room-1" and store.rows[0]["kind"] == "signup"
        again = await a.save_lead(None, "María López", "9795550142", "maria@ejemplo.com", True,
                                  payment="autopay checking")
        assert again.startswith("Updated")
        assert [k for k, _ in phone.sent] == ["lead", "check_in", "lead"]
        assert phone.sent[2][1]["fields"]["monthly"] == 35
        assert len(store.rows) == 2 and store.rows[1]["call_id"] == "room-1"  # same row, updated
    asyncio.run(run())


def test_never_says_saved_when_the_save_fails():
    async def run():
        a, phone, _ = make_agent(ok=False)
        out = await a.save_lead(None, "María López", "9795550142", "maria@ejemplo.com", True)
        assert out.startswith("NOT saved") and "Don't tell the customer it's saved" in out
        assert phone.sent == [("lead", {"status": "not_saved", "fields": phone.sent[0][1]["fields"]})]
        assert a.lead == {}
    asyncio.run(run())


def test_save_lead_refuses_bad_or_unconfirmed_details():
    async def run():
        a, phone, store = make_agent()
        cases = [
            (("M", "9795550142", "maria@ejemplo.com", True), "full name"),
            (("María López", "555-0142", "maria@ejemplo.com", True), "10 digits"),
            (("María López", "9795550142", "maria@", True), "email"),
            (("María López", "9795550142", "maria@ejemplo.com", False), "read the phone number back"),
        ]
        for args, why in cases:
            out = await a.save_lead(None, *args)
            assert out.startswith("Not saved yet") and why in out, (args, out)
        out = await a.save_lead(None, "María López", "9795550142", "maria@ejemplo.com", True, payment="credit card")
        assert "isn't a way to pay" in out
        assert store.rows == [] and phone.sent == []
        # no email is fine when they truly have none; payment not chosen yet means no price
        out = await a.save_lead(None, "María López", "9795550142", "none", True)
        assert out.startswith("Saved")
        assert store.rows[0]["email"] == "" and store.rows[0]["monthly"] is None
    asyncio.run(run())


def test_callbacks_need_a_real_future_time():
    async def run():
        a, phone, store = make_agent()
        now = agent.now_local()
        soon = (now + agent.timedelta(days=2)).replace(hour=11, minute=0, second=0, microsecond=0)
        bad = [("sábado", "next saturday", "work out the exact date"),
               ("ayer", (now - agent.timedelta(days=1)).strftime("%Y-%m-%dT%H:%M"), "already passed"),
               ("en un año", (now + agent.timedelta(days=365)).strftime("%Y-%m-%dT%H:%M"), "too far")]
        for spoken, iso, why in bad:
            out = await a.schedule_callback(None, "José", "9795550199", spoken, iso, "spouse")
            assert why in out, out
        assert store.rows == []
        out = await a.schedule_callback(None, "José", "9795550199", "pasado mañana a las 11",
                                        soon.strftime("%Y-%m-%dT%H:%M"), "spouse")
        assert out.startswith("Saved for")
        assert store.rows[0]["kind"] == "callback" and store.rows[0]["callback_at"].startswith(soon.strftime("%Y-%m-%dT11:00"))
        assert phone.sent[-1][0] == "callback" and phone.sent[-1][1]["status"] == "saved"
    asyncio.run(run())


def test_ask_rep_is_asked_out_loud_in_english():
    async def run():
        phone = FakePhone()
        a = agent.TeammateAgent(PB, phone)
        a.wait_for_rep = lambda: None
        out = await a.ask_rep(None, "Is there a deposit?")
        assert "Then ask Max in English" in out and "'Max, Is there a deposit?'" in out
        assert phone.sent == [("ask_rep", {"question": "Is there a deposit?"})]
    asyncio.run(run())


def test_nudge_says_his_name_then_carries_on():
    said = []

    class FakeSession:
        def generate_reply(self, **kw):
            said.append(kw["instructions"])

    class QuietAgent(agent.TeammateAgent):
        session = FakeSession()

    async def run():
        agent.REP_WAIT_SECONDS = 0.01
        phone = FakePhone()
        a = QuietAgent(PB, phone)
        await a._nudge_rep(asked_at=agent.time.monotonic())
        assert said[0].endswith("'Max?'") and "carry on" in said[1]
        assert phone.sent == [("rep_nudge", {})]
        # once Max answers, Ana stops nudging
        said.clear()
        asked = agent.time.monotonic()
        a.heard_rep()
        await a._nudge_rep(asked_at=asked)
        assert said == []
    asyncio.run(run())


def test_rep_lines_are_recognized_as_english():
    for line in [
        "No, that's it, thank you.",
        "Ask if they have a Social Security number or a passport.",
        "Explain: $35 a month with autopay from a checking account, $45 with a debit card.",
        "Yeah ask her what time works",
    ]:
        assert agent.looks_english(line), line
    for line in ["Sí, tengo pasaporte.", "¿Y cuánto es con tarjeta?", "No, gracias, estoy bien."]:
        assert not agent.looks_english(line), line
