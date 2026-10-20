import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("OPENAI_API_KEY", "sk-test")  # models need a key to be built, not to be tested

import agent  # noqa: E402
from playbook import Playbook  # noqa: E402

PB = Playbook.from_file(Path(__file__).resolve().parents[1] / "sample_playbook.json")


def test_realtime_engine_builds_gpt_realtime():
    m = agent.build_model(PB, engine="realtime")
    assert type(m).__name__ == "RealtimeModel"


def test_live_engine_builds_gpt_live():
    m = agent.build_model(PB, engine="live")
    assert type(m).__name__ == "GPTLiveModel"


def test_both_engines_get_the_same_tools():
    a = agent.TeammateAgent(PB, agent.PhoneBridge(ctx=None))
    names = sorted(t.info.name for t in a.tools)
    assert names == ["ask_rep", "move_on", "ready_to_sign_up", "schedule_callback", "show_price"]


def test_without_a_tablet_ana_takes_the_details_out_loud():
    voice = Playbook.from_dict({"repName": "Quentin", "signupBy": "voice",
                                "plans": [{"name": "Internet", "priceMonthly": 35}]})
    names = sorted(t.info.name for t in agent.TeammateAgent(voice, agent.PhoneBridge(ctx=None)).tools)
    assert names == ["ask_rep", "move_on", "save_lead", "schedule_callback", "show_price"]
    assert Playbook.from_dict({"repName": "Quentin"}).signup_by == "tablet"  # the default


def test_nothing_priced_means_no_price_card():
    church = Playbook.from_dict({"repName": "Quentin", "industry": "ministry", "plans": []})
    names = sorted(t.info.name for t in agent.TeammateAgent(church, agent.PhoneBridge(ctx=None)).tools)
    assert names == ["ask_rep", "move_on", "ready_to_sign_up", "schedule_callback"]


def test_plan_minutes_cap_the_call_with_a_short_grace():
    cap = agent.MAX_MINUTES * 60
    assert agent.call_seconds({}) == (cap, None)  # no plan limit (testing, owner)
    assert agent.call_seconds({"seconds_left": 10 * 60}) == (10 * 60 + agent.OUT_OF_MINUTES_GRACE, 600.0)
    assert agent.call_seconds({"seconds_left": cap + 5}) == (cap, None)  # plenty left: the usual cap
    assert agent.call_seconds({"seconds_left": 0}) == (agent.OUT_OF_MINUTES_GRACE, 0.0)
    assert agent.call_seconds({"seconds_left": "junk"}) == (cap, None)
