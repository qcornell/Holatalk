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
    # a deposit Quentin says out loud becomes allowed for Ana to repeat
    heard = set(amounts_in_text("Tell her the deposit is fifty dollars", money_only=False))
    assert unexpected_amounts("El depósito es de $50", expand_allowed(PB.allowed_amounts(), heard)) == []


# ---- the check-in

def test_instructions_explain_the_check_in():
    assert "# Checking in with Quentin" in TEXT
    assert "Un momentito, déjeme hablar con Quentin." in TEXT
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


READ_BACK = [
    ("ana", "Su número es nueve, siete, nueve, cinco, cinco, cinco, cero, uno, cuatro, dos. ¿Está correcto?"),
    ("customer", "Sí."),
    ("ana", "Y su correo es m-a-r-i-a arroba ejemplo punto com. ¿Está correcto?"),
    ("customer", "Sí, está correcto."),
]


def make_agent(ok=True, lines=READ_BACK):
    phone, store = FakePhone(), FakeStore(ok)
    a = agent.TeammateAgent(PB, phone, call_id="room-1", user_id="quentin", store=store)
    a.wait_for_rep = lambda: None  # no timers in tests
    for who, text in lines:
        a.heard(who, text)
    return a, phone, store


def test_save_lead_saves_first_then_checks_in_once():
    async def run():
        a, phone, store = make_agent()
        out = await a.save_lead(None, "María López", "(979) 555-0142", "maria@ejemplo.com", True,
                                     payment="debit card")
        assert '"Perfecto, ya quedó. Un momentito, déjeme hablar con Quentin. Quentin, are you there?"' in out
        assert out.index("are you there") < out.index("I've got their name, number and email")
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
        a.lines.clear()
        a.heard("ana", "Su número es 979 555 0142. ¿Está correcto?")
        a.heard("customer", "Sí, así es.")
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
        assert '"Buena pregunta. Déjeme confirmarlo con Quentin. Quentin, are you there?"' in out
        assert out.index("are you there") < out.index('"Is there a deposit?"')
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
        assert said[0].endswith("'Quentin?'") and "carry on" in said[1]
        assert phone.sent == [("rep_nudge", {})]
        # once Quentin answers, Ana stops nudging
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
        "I'm here.", "Go ahead.", "Yep", "Yeah, what's up?",
    ]:
        assert agent.looks_english(line), line
    for line in ["Sí, tengo pasaporte.", "¿Y cuánto es con tarjeta?", "No, gracias, estoy bien."]:
        assert not agent.looks_english(line), line


# ---- calling Quentin over before talking to him

def test_instructions_call_him_over_every_time():
    section = " ".join(TEXT.split("# Checking in with Quentin")[1].split("# ")[0].split())
    assert "EVERY time you turn from the customer" in section
    assert ('Say it in one go: "Un momentito, déjeme hablar con Quentin. Quentin, are you there?" Then stop '
            "talking and wait. Don't ask him anything yet.") in section
    assert 'the next short English reply ("yeah", "go ahead", "I\'m here") is Quentin answering you' in " ".join(TEXT.split())
    assert "skip \"are you there?\"" in section  # not when he just spoke to her


def test_calls_rep_spots_are_you_there():
    yes = ["Quentin, are you there?", "Un momentito. Quentin, are you there?", "Hey Quentin, you there?",
           "Quentin, are you still there?", "Are you there, Quentin?", "QUENTIN ARE YOU THERE"]
    no = ["Quentin?", "Déjeme hablar con Quentin.", "Are you there?", "Quentin will be right there."]
    for line in yes:
        assert agent.calls_rep(line, "Quentin"), line
    for line in no:
        assert not agent.calls_rep(line, "Quentin"), line


def test_the_wait_starts_when_she_says_are_you_there():
    said = []

    class FakeSession:
        def generate_reply(self, **kw):
            said.append(kw["instructions"])

    class QuietAgent(agent.TeammateAgent):
        session = FakeSession()

    async def run():
        agent.REP_WAIT_SECONDS = 0.05
        phone = FakePhone()
        a = QuietAgent(PB, phone)
        assert not a.waiting_for_rep
        assert a.ana_said("Un momentito, déjeme hablar con Quentin. Quentin, are you there?")
        assert a.waiting_for_rep
        # he answers "yeah": no nudge, and his next English line still counts as him
        a.heard_rep()
        await asyncio.sleep(0.12)
        assert said == [] and a.waiting_for_rep
        assert agent.who_said("No deposit, tell her no deposit.", a.waiting_for_rep)[1]
        # back with the customer: her Spanish doesn't start a new wait
        assert not a.ana_said("No hay depósito.")
        a._talk_until = 0
        assert not a.waiting_for_rep

        # he doesn't answer: "Quentin?" once (phone buzzes again), then she carries on, no loop
        a.rep_heard_at = 0
        a.ana_said("Quentin, are you there?")
        await asyncio.sleep(0.07)
        assert said[-1].endswith("'Quentin?'") and phone.sent == [("rep_nudge", {})]
        a.ana_said("Quentin, are you still there?")  # her nudge line doesn't restart the clock
        await asyncio.sleep(0.07)
        assert "carry on" in said[-1] and len(said) == 2
        assert not a.waiting_for_rep
    asyncio.run(run())


def test_asking_again_after_he_answers_does_not_call_him_over_twice():
    class FakeSession:
        def generate_reply(self, **kw):
            pass

    class QuietAgent(agent.TeammateAgent):
        session = FakeSession()

    async def run():
        agent.REP_WAIT_SECONDS = 5
        phone = FakePhone()
        a = QuietAgent(PB, phone)
        first = await a.ask_rep(None, "Is there a deposit?")
        assert "are you there?" in first and a.waiting_for_rep
        # before he answers, a second call just waits
        assert (await a.ask_rep(None, "Is there a deposit?")).startswith("You already called Quentin")
        a.heard_rep()  # "yeah"
        again = await a.ask_rep(None, "Is there a deposit?")
        assert "Quentin is listening now" in again and "are you there" not in again
        assert 'Ask him in English: "Is there a deposit?" and stop' in again
        assert phone.sent == [("ask_rep", {"question": "Is there a deposit?"})]  # shown on his phone once
        a._talk_until = 0
        # a new question later calls him over again
        later = await a.ask_rep(None, "Can they get installed Saturday?")
        assert "are you there?" in later and phone.sent[-1][1]["question"] == "Can they get installed Saturday?"
        await a.on_exit()
    asyncio.run(run())



def test_never_saves_what_the_customer_said_was_wrong():
    """From a real test call: she spelled the email back, the customer said no and gave it again, and
    she saved the wrong one as confirmed."""
    call = [
        ("ana", "For the phone number, I have 9 7 9, 5 9 5, 6 3 3 0. Is that correct?"),
        ("customer", "Yes."),
        ("ana", "I heard j u c, at gmail dot com. Is that exactly right?"),
        ("customer", "No."),
        ("customer", "qc@gmail.com."),
        ("customer", "QC."),
    ]

    async def run():
        a, phone, store = make_agent(lines=call)
        out = await a.save_lead(None, "Mary Smith", "9795956330", "juc@gmail.com", True)
        assert out.startswith("Not saved yet: they said the email you read back isn't right")
        assert store.rows == [] and phone.sent == []
        # the fixed email still has to be spelled back and get a yes
        out = await a.save_lead(None, "Mary Smith", "9795956330", "qc@gmail.com", True)
        assert "spell the email back letter by letter" in out and store.rows == []
        a.heard("ana", "Okay: q, c, at gmail dot com. Is that right?")
        a.heard("customer", "Yeah, that's right.")
        out = await a.save_lead(None, "Mary Smith", "9795956330", "qc@gmail.com", True)
        assert out.startswith("Saved") and store.rows[0]["email"] == "qc@gmail.com"
    asyncio.run(run())


def test_read_back_must_be_the_real_number_and_get_an_answer():
    async def run():
        # she read back only 8 digits and moved on: not confirmed
        a, _, store = make_agent(lines=[("ana", "Thanks. I got 9 7 9, 5 6 3, 3 0. Now your email?"),
                                        ("customer", "qc@gmail.com")])
        out = await a.save_lead(None, "Mary Smith", "9795956330", "qc@gmail.com", True)
        assert "read the phone number back digit by digit" in out and store.rows == []
        # read back but no answer yet
        a.heard("ana", "Su número es 9 7 9 5 9 5 6 3 3 0 y su correo es cu, ce, arroba gmail punto com. ¿Está bien?")
        out = await a.save_lead(None, "Mary Smith", "9795956330", "qc@gmail.com", True)
        assert "haven't said yes" in out and store.rows == []
        a.heard("customer", "Sí, todo bien.")
        assert (await a.save_lead(None, "Mary Smith", "9795956330", "qc@gmail.com", True)).startswith("Saved")
    asyncio.run(run())


def test_call_over_lines_follow_the_customers_language():
    async def run():
        a, _, _ = make_agent()
        a.heard("ana", "Great. We offer internet in the area for $35 a month. Do you have a smart TV?")
        out = await a.ask_rep(None, "Is there a deposit?")
        assert '"Good question. Let me check with Quentin. Quentin, are you there?"' in out
        assert "in your own words" in out and "Spanish" not in out
        a.heard("ana", "Claro, la instalación es gratis. ¿Ya tiene tele inteligente?")
        a._talk_until = 0
        out = await a.ask_rep(None, "Can they get installed Saturday?")
        assert '"Buena pregunta. Déjeme confirmarlo con Quentin. Quentin, are you there?"' in out
    asyncio.run(run())
