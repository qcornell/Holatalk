import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from playbook import Playbook  # noqa: E402

SAMPLE = Path(__file__).resolve().parents[1] / "sample_playbook.json"


def test_sample_loads():
    pb = Playbook.from_file(SAMPLE)
    assert pb.rep_name == "Quentin"
    assert pb.find_plan("internet").price_monthly == 35


def test_greeting_says_it_is_ai_and_fits_time_of_day():
    pb = Playbook.from_file(SAMPLE)
    assert pb.greeting(datetime(2026, 10, 19, 15, 0)) == (
        "¡Hola, buenas tardes! Soy Ana, la asistente virtual de Quentin. ¿Cómo está?"
    )
    assert "buenos días" in pb.greeting(datetime(2026, 10, 19, 11, 0))


def test_blank_answers_are_listed_as_unknown_not_invented():
    pb = Playbook.from_file(SAMPLE)
    text = pb.instructions(datetime(2026, 10, 19, 15, 0))
    unknown = text.split("# What you do NOT know")[1].split("# Hard rules")[0]
    assert "The rules: Deposit (none / $)" in unknown
    assert "Install fee (free / $)" not in unknown  # filled in, so known
    assert "Autopay (required / optional / not offered)" not in unknown


def test_rep_pitch_and_facts():
    pb = Playbook.from_file(SAMPLE)
    text = pb.instructions(datetime(2026, 10, 19, 15, 0))
    assert "por solo $35 al mes" in pb.pitch and "¿Ya tiene una tele inteligente?" in pb.pitch
    assert "Contract: no" in text and "Installation fee: $0" in text


def test_allowed_amounts_come_from_playbook():
    pb = Playbook.from_dict({
        "repName": "Quentin",
        "plans": [{"name": "Internet", "priceMonthly": 35}],
        "policies": {"installationFee": 0, "hasContract": False},
        "facts": {"Autopay and paying": {"Autopay discount": "$5 off each month"}},
    })
    assert {35.0, 0.0, 5.0} <= pb.allowed_amounts()
    assert "Contract: no" in pb.instructions(datetime(2026, 10, 19, 15, 0))


def test_expired_promos_are_left_out():
    pb = Playbook.from_dict({
        "repName": "Quentin",
        "promos": [
            {"descriptionEs": "Primer mes gratis", "expiresAt": "2026-10-01"},
            {"descriptionEs": "Instalación gratis", "expiresAt": "2026-12-31"},
        ],
    })
    text = pb.instructions(datetime(2026, 10, 19, 15, 0))
    assert "Primer mes gratis" not in text
    assert "Instalación gratis" in text
