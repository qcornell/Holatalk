import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from number_check import amounts_in_text, expand_allowed, unexpected_amounts  # noqa: E402


def test_digits_with_dollar_sign():
    assert amounts_in_text("Son $35 al mes") == [35.0]
    assert amounts_in_text("Cuesta $35.99") == [35.99]


def test_digits_with_money_words():
    assert amounts_in_text("Son 35 dólares") == [35.0]
    assert amounts_in_text("solo 35 al mes, sin contrato") == [35.0]
    assert amounts_in_text("1,200 dolares") == [1200.0]


def test_spanish_number_words():
    assert amounts_in_text("treinta y cinco dólares al mes") == [35.0]
    assert amounts_in_text("veinticinco dólares") == [25.0]
    assert amounts_in_text("ciento veinte dólares") == [120.0]
    assert amounts_in_text("mil quinientos dólares") == [1500.0]
    assert amounts_in_text("treinta y cinco con noventa y nueve dólares") == [35.99]


def test_ignores_non_money_numbers():
    # times, dates, counts and phone numbers are not prices
    assert amounts_in_text("Podemos ir el 25 de octubre a las 3") == []
    assert amounts_in_text("Tarda como dos horas") == []
    assert amounts_in_text("Su número es 9795550142") == []
    assert amounts_in_text("una cita mañana") == []


def test_flags_amount_not_in_playbook():
    allowed = expand_allowed({35.0}, set())
    assert unexpected_amounts("Son $35 al mes", allowed) == []
    assert unexpected_amounts("Son $30 al mes", allowed) == [30.0]


def test_savings_and_yearly_totals_are_allowed():
    allowed = expand_allowed({35.0}, {80.0})
    assert unexpected_amounts("Paga $80, así que ahorraría $45 al mes", allowed) == []
    assert unexpected_amounts("Son $420 al año... perdón, 420 dólares al año", allowed) == []
