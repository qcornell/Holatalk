import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from number_check import amounts_in_text  # noqa: E402
from playbook import Playbook  # noqa: E402
from sales_skills import COMMON_BRUSH_OFFS, INDUSTRY_IDS, PACKS, industry_id  # noqa: E402

NOON = datetime(2026, 10, 19, 12, 0)


def pb(industry: str, **extra) -> Playbook:
    d = {"repName": "Quentin", "companyName": "Acme", "industry": industry, "pitch": "Hola.",
         "plans": [{"name": "Plan", "priceMonthly": 49}]}
    d.update(extra)
    return Playbook.from_dict(d)


def test_older_playbooks_are_internet():
    assert Playbook.from_dict({"repName": "Quentin"}).industry == "internet"
    assert industry_id("Solar") == "solar"
    assert industry_id("bakery") == "other"


def test_every_industry_builds_instructions_without_leftover_holes():
    for ind in INDUSTRY_IDS:
        text = pb(ind).instructions(NOON)
        assert "{" not in text.split("# Facts you may use")[0].replace("{rep}", ""), ind
        assert "never pitch to anyone under 18" in text, ind


def test_other_industries_never_talk_about_internet():
    for ind in INDUSTRY_IDS:
        if ind == "internet":
            continue
        skills = pb(ind).instructions(NOON).split("# Facts you may use")[0].lower()
        for word in ("internet", "hotspot", "tele inteligente", "wifi"):
            assert word not in skills, (ind, word)


def test_industry_lines_never_carry_their_own_amounts():
    for ind, pack in PACKS.items():
        lines = list(pack["close_es"]) + list(pack["close_en"]) + [str(pack["what_line"]), str(pack["goal"])]
        lines += [r for _, _, r in pack["brush_offs"]]
        lines += [s for _, _, steps in pack["door_types"] for s in steps]
        for line in lines:
            assert amounts_in_text(line.replace("{price_phrase}", "")) == [], (ind, line)
    for _, _, reply in COMMON_BRUSH_OFFS:
        assert amounts_in_text(reply) == []


def test_solar_skills_qualify_homeowners():
    text = pb("solar").instructions(NOON)
    assert "¿Usted es dueño de la casa?" in text
    assert "Renter" in text


def test_ministry_never_sells():
    church = pb("ministry", plans=[])
    text = church.instructions(NOON)
    assert "Nothing is for sale" in text
    assert "never ask for money" in text.lower()
    assert "show_price" not in text
    assert "No compro nada en la puerta" not in text
    assert "- none: nothing is for sale" in text


def test_one_time_prices_are_not_monthly():
    sale = pb("fundraiser", plans=[{"name": "Cookies", "priceMonthly": 5, "per": "once"}])
    facts = sale.facts_text(NOON)
    assert "Cookies: $5" in facts and "al mes" not in facts
    assert sale.plans[0].per == "once"


def test_no_set_price_means_the_rep_quotes_it():
    roof = pb("roofing", plans=[{"name": "Roof inspection", "priceMonthly": None, "per": "once"}])
    text = roof.instructions(NOON)
    assert "no set price (Quentin quotes it)" in text
    assert "There is no set price in your facts" in text
    assert "Never say a price for a roof" in text
