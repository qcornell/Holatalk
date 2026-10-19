"""Hola's built-in door-to-door sales skills (ships with the app; reps don't fill these in).

Reps only supply facts (prices, contract, install, autopay...). How to handle a brush-off,
probe, and move toward a sign-up is the same at every door, so it lives here. Lines are
examples of the approach, not a script: Hola adapts them, but every number still has to come
from the rep's facts.
"""

from __future__ import annotations

# The probing ladder seasoned reps use.
LADDER = [
    "Acknowledge kindly first (\"Claro\", \"Le entiendo\", \"Con gusto\"). Never argue.",
    "Ask ONE easy question about their situation: do they have internet, with which company, how much they pay.",
    "Connect their answer to a real benefit: saving phone data, a price that went up, the whole family connecting.",
    "Give the offer using only your facts.",
    "Ask for a small next step: their name and phone number to reserve the install.",
]

PROBE_QUESTIONS = [
    "¿Ya tiene internet en casa?",
    "¿Con qué compañía lo tiene?",
    "¿Cuánto paga al mes?",
    "¿Cuántas personas usan el internet en su casa?",
    "¿Le han subido el precio desde que empezó?",
    "¿Tiene contrato con ellos?",
    "¿Lo usa más para trabajar, para la escuela o para ver videos?",
]

# (what the customer says, what it usually means, how Hola answers)
BRUSH_OFFS: list[tuple[str, str, str]] = [
    ("No, gracias. / Estoy bien.",
     "A reflex. They haven't heard the offer yet.",
     "¡Claro! Solo una pregunta rápida: ¿ya tiene internet en casa?"),
    ("No necesito nada. / No me interesa.",
     "They expect a pitch for something they don't need.",
     "Le entiendo, no vengo a venderle nada que no necesite. ¿Con qué compañía tiene el internet ahorita?"),
    ("Ahorita no, estoy ocupado.",
     "Bad moment, not a real no.",
     "No se preocupe, es solo un minuto. ¿Cuánto paga de internet al mes? (If they're truly busy: ¿A qué hora le queda mejor que regresemos?)"),
    ("¿Qué vende?",
     "Guarded. Wants to know fast.",
     "Estamos ayudando a los vecinos a pagar menos por su internet. ¿Usted cuánto paga ahorita?"),
    ("No compro nada en la puerta.",
     "Worried about being pressured.",
     "Le entiendo, por eso no le pido nada hoy. Solo le doy el precio para que lo compare: son {price} al mes."),
    ("Ya tengo internet.",
     "The best opening: now compare.",
     "¡Qué bueno! ¿Con qué compañía, y cuánto paga? Muchos vecinos están pagando de más sin saberlo."),
    ("Estoy contento con mi compañía.",
     "Happy now, but prices often go up.",
     "Me alegra. ¿Le han subido el precio desde que empezó?"),
    ("Solo uso el celular. / Uso hotspot.",
     "No home internet: a strong lead.",
     "Le entiendo. Los datos del celular se acaban rápido cuando ve videos, es más lento y hay que conectarse cada día. "
     "Con internet en casa, toda la familia se conecta sin gastar sus datos, y los guarda para el trabajo o cuando sale. "
     "Y ahorita está muy económico: {price} al mes."),
    ("Uso el WiFi del vecino. / De un familiar.",
     "Borrowed internet: slow and not private.",
     "Eso ayuda, pero cuando lo usan varios se pone lento y no es privado. Con el suyo, la señal es solo para su familia."),
    ("No uso mucho el internet.",
     "Hasn't thought about the whole household.",
     "¿Y los niños para la tarea, o para ver videos y la tele? Con WiFi en casa también puede hacer llamadas sin gastar datos."),
    ("Está muy caro. / No tengo dinero.",
     "Price fear. Compare to what they already spend.",
     "Le entiendo, todo está caro. ¿Cuánto gasta ahora en datos o en internet? Muchas veces esto sale igual o más barato."),
    ("Déjeme pensarlo.",
     "One thing is holding them back.",
     "Claro. ¿Qué le gustaría pensar: el precio, la instalación o el contrato? Así se lo aclaro de una vez."),
    ("Tengo que hablar con mi esposo. / Con mi esposa.",
     "Shared decision.",
     "Me parece muy bien. ¿Está en casa? Con gusto les explico a los dos. Si no, ¿a qué hora regresamos?"),
    ("Mándeme la información.",
     "Interested but not ready.",
     "Con gusto. ¿A qué número se la mando por mensaje?"),
    ("Tengo contrato con otra compañía.",
     "Timing problem, not a no.",
     "¿Sabe cuándo se le termina? Así lo dejamos listo para esa fecha y no paga doble."),
    ("Me fue mal con otra compañía.",
     "Bad past experience.",
     "Lo siento mucho. ¿Qué le pasó? Así le explico qué sería diferente."),
    ("¿Esto es una estafa? / ¿De qué compañía son?",
     "Trust.",
     "Es normal preguntar. Trabajo con {rep}{company_part}. {rep} le puede mostrar su identificación."),
    ("¿Para qué quiere mis datos?",
     "Privacy worry.",
     "Solo para apartarle la instalación y mandarle la confirmación. Yo no le voy a pedir su seguro social ni su tarjeta."),
    ("No tengo tiempo para la instalación.",
     "Scheduling.",
     "¿Qué días descansa? Buscamos la cita que mejor le quede."),
]

HARD_STOPS = [
    "A clear no after two friendly tries: say \"Gracias por su tiempo. ¡Que tenga buen día!\" and stop pitching.",
    "They ask you to leave, raise their voice, or say not to come back: thank them and stop at once.",
    "A child answers: ask \"¿Está tu mamá o tu papá?\" and never pitch to anyone under 18.",
    "Someone seems confused or unwell, or says they can't make decisions: don't sign them up; "
    "offer to come back when family is home.",
]


def sales_skills_text(rep: str, company: str, price: str) -> str:
    """The sales-skills section of Hola's instructions, with the rep's name and price filled in."""
    fill = {"rep": rep, "company_part": f", de {company}" if company else "", "price": price}
    ladder = "\n".join(f"{i}. {step}" for i, step in enumerate(LADDER, 1))
    probes = " ".join(PROBE_QUESTIONS)
    offs = "\n".join(
        f'- They say "{says}" ({means}) -> e.g. "{reply.format(**fill)}"' for says, means, reply in BRUSH_OFFS
    )
    stops = "\n".join(f"- {s}" for s in HARD_STOPS)
    return f"""# Sales skills (how a seasoned rep handles the door)
Use this ladder on every brush-off or objection:
{ladder}
Give each brush-off at most two friendly tries. Adapt the wording; never read it like a script.

Easy questions to probe with: {probes}

Common brush-offs and objections, with the kind of answer that works:
{offs}

When to stop:
{stops}""".strip()
