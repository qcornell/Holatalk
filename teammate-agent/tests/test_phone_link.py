"""How the iPhone app talks to Ana: it sends its setup when she joins, and hold-to-talk marks the rep."""

import asyncio
import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("OPENAI_API_KEY", "sk-test")

import agent  # noqa: E402
from playbook import Playbook  # noqa: E402

PB = Playbook.from_file(Path(__file__).resolve().parents[1] / "sample_playbook.json")


class FakeRoom:
    def __init__(self):
        self.handlers = []

    def on(self, event, fn):
        self.handlers.append(fn)

    def off(self, event, fn):
        self.handlers.remove(fn)


class AnsweringPhone:
    """Plays the iPhone: answers Ana's "hello" with its playbook, like the app does."""

    def __init__(self, room, playbook):
        self.room, self.playbook, self.sent = room, playbook, []

    async def send(self, kind, **data):
        self.sent.append(kind)
        if kind == "hello" and self.playbook is not None:
            msg = {"type": "playbook", "playbook": self.playbook, "user_id": "device-123"}
            packet = SimpleNamespace(topic="hola", data=json.dumps(msg).encode(),
                                     participant=SimpleNamespace(identity="rep-phone"))
            for fn in list(self.room.handlers):
                fn(packet)
        return True


def fake_ctx(room, metadata=""):
    return SimpleNamespace(room=room, job=SimpleNamespace(metadata=metadata))


def test_the_phone_sends_ana_its_setup_when_she_joins():
    async def run():
        room = FakeRoom()
        mine = {"repName": "Lupe", "signupBy": "voice", "plans": [{"name": "Internet", "priceMonthly": 40}]}
        phone = AnsweringPhone(room, mine)
        playbook, meta = await agent.load_playbook(fake_ctx(room), phone, console=False)
        assert playbook.rep_name == "Lupe" and playbook.signup_by == "voice"
        assert meta["rep_identity"] == "rep-phone" and meta["user_id"] == "device-123"
        assert phone.sent == ["hello"] and room.handlers == []  # stopped listening once it came
    asyncio.run(run())


def test_without_the_phone_ana_uses_the_local_file():
    async def run():
        agent.PLAYBOOK_WAIT_SECONDS = 0.01
        room = FakeRoom()
        playbook, meta = await agent.load_playbook(fake_ctx(room), AnsweringPhone(room, None), console=False)
        assert playbook.rep_name == "Quentin" and meta == {}
        # console mode never waits for a phone
        playbook, _ = await agent.load_playbook(fake_ctx(room), AnsweringPhone(room, None), console=True)
        assert playbook.rep_name == "Quentin"
    asyncio.run(run())


def test_metadata_from_the_start_live_function_wins():
    async def run():
        room = FakeRoom()
        meta = json.dumps({"playbook": {"repName": "Ray"}, "user_id": "u1", "rep_identity": "rep-u1"})
        playbook, got = await agent.load_playbook(fake_ctx(room, meta), AnsweringPhone(room, {"repName": "X"}),
                                                  console=False)
        assert playbook.rep_name == "Ray" and got["rep_identity"] == "rep-u1"
    asyncio.run(run())


def test_holding_the_talk_button_marks_his_words_as_his():
    a = agent.TeammateAgent(PB, agent.PhoneBridge(ctx=None))
    assert not a.rep_holding
    _, is_rep, _ = agent.who_said("Tell her the deposit is $50", waiting_for_rep=False, holding=a.rep_holding)
    assert not is_rep  # plain English isn't trusted to change the offer
    a.rep_hold(True)
    _, is_rep, _ = agent.who_said("Tell her the deposit is $50", waiting_for_rep=False, holding=a.rep_holding)
    assert is_rep
    a.rep_hold(False)
    assert a.rep_holding  # his last words may still be being transcribed
    a._held_until = 0
    assert not a.rep_holding
