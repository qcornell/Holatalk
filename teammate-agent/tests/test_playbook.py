import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from playbook import Playbook  # noqa: E402

SAMPLE = Path(__file__).resolve().parents[1] / "sample_playbook.json"


def test_sample_loads():
    pb = Playbook.from_file(SAMPLE)
    assert pb.rep_name == "Max"
    assert pb.find_plan("internet").price_monthly == 35


def test_greeting_says_it_is_ai_and_fits_time_of_day():
    pb = Playbook.from_file(SAMPLE)
    assert pb.greeting(datetime(2026, 10, 19, 15, 0)) == (
        "¡Hola, buenas tardes! Soy Sofía, la asistente virtual de Max."
    )
    assert "buenos días" in pb.greeting(datetime(2026, 10, 19, 11, 0))


def test_blank_answers_are_listed_as_unknown_not_invented():
    pb = Playbook.from_file(SAMPLE)
    text = pb.instructions(datetime(2026, 10, 19, 15, 0))
    assert "Install and paying: Install fee (free / $)" in text  # listed under "What you do NOT know"
    assert "Contract: no" not in text  # no contract policy was given, so none is claimed


def test_allowed_amounts_come_from_playbook():
    pb = Playbook.from_dict({
        "repName": "Max",
        "plans": [{"name": "Internet", "priceMonthly": 35}],
        "policies": {"installationFee": 0, "hasContract": False},
        "facts": {"Autopay and paying": {"Autopay discount": "$5 off each month"}},
    })
    assert {35.0, 0.0, 5.0} <= pb.allowed_amounts()
    assert "Contract: no" in pb.instructions(datetime(2026, 10, 19, 15, 0))


def test_expired_promos_are_left_out():
    pb = Playbook.from_dict({
        "repName": "Max",
        "promos": [
            {"descriptionEs": "Primer mes gratis", "expiresAt": "2026-10-01"},
            {"descriptionEs": "Instalación gratis", "expiresAt": "2026-12-31"},
        ],
    })
    text = pb.instructions(datetime(2026, 10, 19, 15, 0))
    assert "Primer mes gratis" not in text
    assert "Instalación gratis" in text
