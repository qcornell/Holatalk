import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from readback import answer_kind, readback_problem, spoken_forms  # noqa: E402


def test_spoken_forms_handle_spelled_letters_and_digit_words():
    raw, mapped = spoken_forms("m-a-r-i-a arroba ejemplo punto com")
    assert "maria" in raw
    _, mapped = spoken_forms("nueve, siete, nueve, cinco, cinco, cinco, cero, uno, cuatro, dos")
    assert mapped == "9795550142"
    _, mapped = spoken_forms("eme, a, erre, i, a, uno, dos, arroba gmail")
    assert "maria12" in mapped
    _, mapped = spoken_forms("josé: jota, o, ese, e, doble ve")
    assert "josew" in mapped


def test_answers():
    for yes in ["Sí.", "Sí, está correcto.", "Yes.", "Yeah, that's right.", "Correcto", "Así es", "Mm-hmm", "Okay"]:
        assert answer_kind(yes) == "yes", yes
    for no in ["No.", "No, es con Q.", "Nope", "That's not right", "Está mal"]:
        assert answer_kind(no) == "no", no
    for neither in ["qc@gmail.com.", "QC.", "¿Cómo?"]:
        assert answer_kind(neither) == "", neither


def test_no_email_needs_only_the_phone():
    lines = [("ana", "Su número es 979 555 0142, ¿correcto?"), ("customer", "Sí.")]
    assert readback_problem(lines, "9795550142", "") == ""


def test_a_yes_after_a_no_counts():
    lines = [("ana", "Su correo es j u c arroba gmail punto com, ¿correcto? Y su número 9795550142."),
             ("customer", "No, es q c."),
             ("ana", "Perdón: q, c, arroba gmail punto com. ¿Ahora sí?"),
             ("customer", "Sí.")]
    assert readback_problem(lines, "9795550142", "qc@gmail.com") == ""
    # the rep saying "yes" isn't the customer confirming
    lines = [("ana", "Su número es 9795550142 y su correo q c arroba gmail. ¿Correcto?"), ("rep", "Yes.")]
    assert "haven't said yes" in readback_problem(lines, "9795550142", "qc@gmail.com")
