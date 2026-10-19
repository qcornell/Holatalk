import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from number_check import amounts_in_text  # noqa: E402
from playbook import Playbook  # noqa: E402
from sales_skills import BRUSH_OFFS, sales_skills_text  # noqa: E402

PB = Playbook.from_file(Path(__file__).resolve().parents[1] / "sample_playbook.json")


def test_instructions_include_brush_off_handling():
    text = PB.instructions(datetime(2026, 10, 19, 15, 0))
    assert "¿ya tiene internet en casa?" in text
    assert "los datos del celular se acaban rápido" in text  # the hotspot answer
    assert "at most two friendly tries" in text
    assert "never pitch to anyone under 18" in text


def test_price_is_filled_from_the_playbook():
    text = PB.instructions(datetime(2026, 10, 19, 15, 0))
    assert "{price}" not in text and "$35 al mes" in text


def test_no_price_means_no_number_is_invented():
    text = sales_skills_text(rep="Max", company="", price="el precio")
    assert amounts_in_text(text) == []


def test_example_lines_never_contain_their_own_amounts():
    # every amount Hola says must come from the rep's facts, so the shipped lines carry none
    for _, _, reply in BRUSH_OFFS:
        assert amounts_in_text(reply.replace("{price}", "")) == []


def test_four_door_types_come_first():
    text = PB.instructions(datetime(2026, 10, 19, 15, 0))
    assert text.index("The 4 door types") < text.index("Common brush-offs")
    assert "¿Tiene alguna tele inteligente en casa" in text  # no-TV check before leaving
    assert "Y si fuera solo su decisión" in text  # roommate stall test
    assert "Never set a callback for a stall" in text


def test_door_type_lines_never_contain_their_own_amounts():
    from sales_skills import DOOR_TYPES
    for t in DOOR_TYPES:
        for step in t["steps"]:
            assert amounts_in_text(str(step).replace("{price}", "")) == []
