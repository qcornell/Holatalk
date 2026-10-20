"""Hola's built-in door-to-door sales skills (ships with the app; reps don't fill these in).

Reps only supply facts (prices, contract, install, autopay...). How to handle a brush-off,
probe, and move toward a sign-up is the same at every door, so it lives here. Lines are
examples of the approach, not a script: Hola adapts them, but every number still has to come
from the rep's facts.
"""

from __future__ import annotations

# The 4 door types reps meet most (from Quentin, Oct 2026). Hola handles these first and best.
DOOR_TYPES: list[dict[str, object]] = [
    {
        "name": "Happy with their internet and their price",
        "signs": '"Ya tengo internet y estoy contento", "Pago poco", "Me funciona bien"',
        "steps": [
            'Respect it and get the facts: "¡Qué bueno que le funciona! ¿Con qué compañía está, y cuánto paga al mes?"',
            'If they pay more than your price, show the difference using their number: "Entonces con nosotros '
            'pagaría {price} al mes, unos [their price minus yours] menos cada mes."',
            'If they pay the same or less, look for what is hidden: "¿Ese precio ya incluye impuestos y el equipo?" '
            '"¿Es precio de promoción? ¿Sabe cuándo se le termina?" "¿Le han subido el precio desde que empezó?" '
            '"¿Tiene contrato con ellos?"',
            "Compare speed, price lock or contract only with your facts.",
            'Still happy after two tries: "Perfecto, me da gusto. Si algún día le suben el precio, aquí estamos." '
            "Then call move_on.",
        ],
    },
    {
        "name": "Thinks the phone hotspot is enough (very careful with money)",
        "signs": '"Uso el hotspot", "Tengo datos en el celular", "Es un gasto extra"',
        "steps": [
            'Agree with saving money, then ask ONE question and stop talking: "Tiene razón en cuidar su dinero. '
            'Oiga, ¿sus datos le alcanzan todo el mes, o se le acaban antes?"',
            'Ask the second question only after they answer: "¿Y cuántos en la casa se conectan a su celular?"',
            'Build value from what they told you, one point, in their words. Data runs out: "Entonces a fin de mes '
            'se queda sin datos justo cuando más los necesita, ¿verdad?" Family on it: "O sea que cuando los niños '
            'ven videos, se están gastando SUS datos." Wait for their yes.',
            'Paint the picture of the fix, still one point: "Con internet en la casa, los niños ven sus videos en la '
            'tele y usted guarda sus datos para el trabajo o cuando sale." Wait for a reaction.',
            'If they buy extra data or top-ups, ask how much: that money is part of what they already pay.',
            'Then the price, as the fix: "Y todo eso por {price} al mes." Then go straight to the assumed close '
            '(see "Closing" above): "Entonces, si le interesa, nomás ocupamos un buen nombre, número y correo, y se lo '
            'dejamos listo."',
        ],
    },
    {
        "name": "Doesn't need it (often no TV)",
        "signs": '"No lo necesito", "No veo televisión", "Solo uso el teléfono para llamar"',
        "steps": [
            'Qualify fast with one or two questions: "Le entiendo. ¿Tiene alguna tele inteligente en casa, o alguien '
            'que vea videos o películas?" "¿Hay niños que usen internet para la escuela?"',
            'No smart TV, no kids and no streaming: leave right away, no pitch: "Perfecto, entonces por ahora no le '
            'hace falta. ¡Gracias por su tiempo y que tenga buen día!" Then call move_on.',
            "If they do have a smart TV, kids or streaming: handle them like the hotspot type.",
        ],
    },
    {
        "name": "Needs to ask someone (spouse, roommate or owner)",
        "signs": '"Tengo que hablar con mi esposo", "Tengo que preguntarle a mi compañero", '
                 '"Tengo que preguntarle al dueño"',
        "steps": [
            'Spouse: "Me parece muy bien. ¿Está en casa ahorita? Con gusto les explico a los dos." Not home: get a '
            "phone number AND a specific day and time to come back, then call schedule_callback.",
            'Roommate (often a polite way to stall): test it first: "Claro. Y si fuera solo su decisión, ¿usted sí '
            'lo haría?" and "¿Quién paga el internet en la casa?" Clear yes: "¿Le podemos marcar ahorita? Así lo '
            'dejamos listo." or get the roommate\'s number and a time, then call schedule_callback. Vague answer '
            '("no sé", "tal vez"): ask once what is really holding them back; still vague, thank them and call '
            "move_on. Never set a callback for a stall.",
            "Owner or landlord: answer only from your facts about renters; if they don't cover it, call ask_rep. "
            "If the owner must agree, get the owner's number or a time to come back.",
            "Never set a callback without a phone number and a specific day and time.",
        ],
    },
]

# How value sticks: the customer hears their own problem in their own words, one point at a time.
VALUE_RULES = [
    "Ask before you tell. One question about their situation, then STOP and let them answer. Never answer your own "
    "question or keep talking while they think.",
    "Build value from their answer, in their words: \"Usted me dijo que...\", \"O sea que...\". A benefit they "
    "didn't say they need doesn't stick.",
    "One value point per turn, never a list. Three benefits in one breath sound like a sales pitch and none sticks.",
    "Make it a picture they can see in their own house (the kids on the tablet while their data stays on their "
    "phone), not a feature (speed, technology).",
    "Check it landed: \"¿Le pasa eso?\", \"¿Verdad?\" Wait for the yes before the next point. Their yes is what "
    "makes it stick.",
    "Money in their terms: what they pay now (the bill, extra data, top-ups), and savings per year, not per month.",
    "The price comes last, as the fix for what they told you. Then close (below): don't ask whether they want it.",
    "After a soft no (\"no, está bien\"), ask ONE question and wait for the answer. Don't say goodbye in the same "
    "breath; that's a goodbye, not a question.",
]

# The assumed close (how Quentin closes): once the value lands, assume it. Never ask "do you want it?"
CLOSING = [
    "When they agree with the value, or just nod or go quiet, that's your moment: go straight to the assumed close.",
    "Never ask if they want it: no \"¿le interesa?\", \"¿vale la pena probarlo?\", \"¿quiere apartarlo?\", \"would "
    "you like to reserve it?\". Asking hands them an easy no.",
    "Close warm and sure, and move right into the details:",
    "  - \"Entonces, si le interesa, nomás ocupamos un buen nombre, número y correo, y se lo dejamos listo.\"",
    "  - \"Si le interesa, se lo podemos dejar listo hoy mismo. ¡Le va a encantar!\"",
    "  - \"Va a estar mucho más rápido en su tele y en todos sus aparatos.{ask_name_es}\"",
    "  In English mode: \"So if you're interested, we just need a good name, number and email and we'll get it set "
    "up for you.\" / \"We can get it set up for you today, you'll love it!\" / \"It'll be so much faster on your TV and "
    "devices.{ask_name_en}\"",
    "{after_close}",
    "If they hesitate or raise a concern, handle it with the ladder, then close again the same way.",
]
AFTER_CLOSE = {
    "voice": "Right after the close line, ask for the first detail (their full name) and keep going: number, then email.",
    "tablet": "Right after the close line, call ready_to_sign_up: they type their name, number and email on {rep}'s "
              "tablet. Don't ask for those out loud.",
}

# The probing ladder seasoned reps use.
LADDER = [
    "Acknowledge kindly first (\"Claro\", \"Le entiendo\", \"Con gusto\"). Never argue.",
    "Ask ONE easy question about their situation: do they have internet, with which company, how much they pay.",
    "Wait for the answer. Then connect it to ONE real benefit, in their words, and check it landed.",
    "Give the offer using only your facts.",
    "Assume the close (see Closing): go straight to getting their name, number and email.",
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
     "Le entiendo. ¿Sus datos le alcanzan todo el mes, o se le acaban antes? (Then wait, and build from their "
     "answer: los datos del celular se acaban rápido con los videos; con internet en casa la familia se conecta sin "
     "gastar sus datos, y usted los guarda para el trabajo.)"),
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
     "Solo para apartarle la instalación y mandarle la confirmación. Números como el seguro social o la cuenta "
     "del banco no me los dice a mí: si hacen falta, se los da directamente a {rep}."),
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


# ---------------------------------------------------------------- other industries
# Internet (above) is the deepest set, built from Quentin's doors. The rest share the value rules,
# the stops and the common brush-offs, and add their own door types, questions and close.
# Lines are examples of the approach; no line carries its own amount or promise.

INDUSTRY_IDS = ("internet", "solar", "security", "pest", "roofing", "ministry", "fundraiser", "other")

PACKS: dict[str, dict[str, object]] = {
    "solar": {
        "goal": "Your goal is the next step your facts describe (an assessment, a visit or the sign-up). Only "
                "homeowners can go solar: a renter is a polite goodbye unless your facts say renters qualify.",
        "what_line": "Estamos ayudando a los vecinos a bajar lo que pagan de luz con paneles solares. ¿Usted cuánto "
                     "paga de luz al mes?",
        "picture": "the summer light bill that doesn't jump, money that stays with the family instead of the light company",
        "door_types": [
            ("Renter", '"Rento", "No es mía la casa", "El dueño no vive aquí"', [
                'Unless your facts say renters qualify, thank them and leave: "Ah, muchas gracias. Entonces por '
                'ahora no se preocupe. ¡Que tenga buen día!" Then call move_on.',
            ]),
            ("Thinks their bill is fine", '"No pago mucho de luz", "Estoy bien así"', [
                'Ask for the number: "¿Más o menos cuánto le llega de luz al mes? ¿Y en el verano?" Wait.',
                'Build from it, one point: "O sea que en el verano le llega mucho más, ¿verdad?" Wait for their yes.',
                "Then the fix, only from your facts (money down, monthly payment, savings), and the close.",
            ]),
            ("Heard solar pitches before", '"Ya me vinieron a ofrecer", "Eso es una estafa", "Mi vecino tuvo problemas"', [
                'Respect it: "Es normal desconfiar, hay muchas ofertas." Ask: "¿Qué fue lo que no le gustó?" Wait.',
                "Answer only from your facts. Anything they don't cover, call ask_rep.",
            ]),
        ],
        "probes": ["¿Usted es dueño de la casa?", "¿Más o menos cuánto paga de luz al mes?",
                   "¿Y en el verano, cuánto le llega?", "¿Con qué compañía tiene la luz?", "¿Cuántos años tiene el techo?"],
        "close_es": ["Entonces, si le interesa, nomás ocupamos un buen nombre y número, y le apartamos su cita.",
                     "Se lo podemos dejar apartado hoy mismo.{ask_name_es}"],
        "close_en": ["So if you're interested, we just need a good name and number and we'll set up your appointment.",
                     "We can get it set up for you today.{ask_name_en}"],
        "brush_offs": [
            ("Es muy caro.", "Thinks solar costs a lot up front.",
             "Le entiendo. Por eso le pregunto: ¿cuánto paga de luz ahorita? Así le comparo con lo que le podemos ofrecer."),
            ("¿Y si me mudo? / Mi techo está viejo.", "Worried about being stuck.",
             "Buena pregunta. (Answer from your facts; if they don't say, call ask_rep.)"),
        ],
    },
    "security": {
        "goal": "Your goal is a sign-up for the security plan in your facts.",
        "what_line": "Estamos ayudando a los vecinos a cuidar su casa con cámaras y alarma. ¿Ya tiene algo de seguridad?",
        "picture": "checking the front door from their phone at work, knowing when the kids get home",
        "door_types": [
            ("Feels safe already", '"Aquí es tranquilo", "Tengo perro", "Nunca ha pasado nada"', [
                'Agree, then ask ONE question: "¡Qué bueno! ¿Y cuando no hay nadie en casa, cómo sabe que todo está '
                'bien?" Wait.',
                'Build from their answer, one point (packages, the kids getting home, a trip): "O sea que si llega un '
                'paquete y usted está en el trabajo, no sabe quién se lo lleva, ¿verdad?" Wait for their yes.',
                "Then the price as the fix, and the close.",
            ]),
            ("Already has cameras", '"Ya tengo cámaras", "Tengo un timbre con cámara"', [
                'Ask: "¿Le avisan al celular, y alguien las vigila si pasa algo de noche?" Compare only with your '
                "facts. If theirs already does it all, thank them and call move_on.",
            ]),
            ("Renter", '"Rento"', ["Check your facts about renters. If they don't say, call ask_rep."]),
        ],
        "probes": ["¿Ya tiene alarma o cámaras en la casa?", "¿Se queda sola la casa durante el día?",
                   "¿Le han llegado a robar paquetes por aquí?", "¿Los niños llegan solos de la escuela?",
                   "¿Usted es dueño o renta?"],
        "close_es": ["Entonces, si le interesa, nomás ocupamos un buen nombre, número y correo, y se lo dejamos listo.",
                     "Se lo podemos dejar listo hoy mismo. ¡Va a estar más tranquilo!{ask_name_es}"],
        "close_en": ["So if you're interested, we just need a good name, number and email and we'll get it set up.",
                     "We can get it set up for you today. You'll have real peace of mind!{ask_name_en}"],
        "brush_offs": [
            ("Tengo perro.", "Feels safe already.", "¡Qué bueno! ¿Y cuando salen todos, quién cuida la casa?"),
            ("Aquí es tranquilo.", "Doesn't see a risk.", "Me da gusto. ¿Le ha tocado que se pierda algún paquete?"),
            ("Está muy caro.", "Price fear.",
             "Le entiendo. Son {price_phrase}. ¿Cuánto paga ahorita por algo de seguridad, aunque sea las cámaras?"),
        ],
    },
    "pest": {
        "goal": "Your goal is a sign-up for the pest plan in your facts (often the first visit).",
        "what_line": "Estamos dando servicio de control de plagas en el vecindario. ¿Ha visto cucarachas o hormigas en la casa?",
        "picture": "the kitchen at night with no roaches, the kids playing on the floor without ants",
        "door_types": [
            ("Does it themselves", '"Yo mismo fumigo", "Compro el spray"', [
                'Respect it, then ask: "¿Y le funciona, o regresan a las pocas semanas?" Wait.',
                'Build from it: "O sea que gasta en sprays y siguen saliendo, ¿verdad?" Then the price as the fix, '
                "and the close.",
            ]),
            ("No bugs", '"No tengo bichos", "Aquí no hay"', [
                'Ask once about outside: "¡Qué bueno! ¿Ni hormigas afuera, o arañas en el patio o la cochera?" Still '
                "none: thank them and call move_on.",
            ]),
            ("Worried about kids and pets", '"Tengo niños", "Tengo mascotas", "¿Es tóxico?"', [
                "Answer only from your Safety facts. If they don't say, call ask_rep. Never promise it's safe on your own.",
            ]),
        ],
        "probes": ["¿Ha visto cucarachas, hormigas o arañas en la casa?", "¿Dónde las ve más, en la cocina, el baño o afuera?",
                   "¿Ha usado algo para quitarlas?", "¿Tiene niños o mascotas?"],
        "close_es": ["Entonces, si le interesa, nomás ocupamos un buen nombre y número, y le apartamos la primera visita.",
                     "Se lo podemos dejar listo hoy mismo.{ask_name_es}"],
        "close_en": ["So if you're interested, we just need a good name and number and we'll book your first visit.",
                     "We can get it set up for you today.{ask_name_en}"],
        "brush_offs": [
            ("Yo mismo fumigo.", "Does it themselves.", "¡Qué bien que se encarga! ¿Y le funciona, o regresan a las pocas semanas?"),
            ("No tengo bichos.", "Doesn't see the problem.", "¡Qué bueno! ¿Ni hormigas afuera, o arañas en el patio?"),
            ("Está muy caro.", "Price fear.", "Le entiendo. ¿Cuánto gasta ahora en sprays y trampas? Muchas veces sale casi igual."),
        ],
    },
    "roofing": {
        "goal": "Your goal is to set up the roof inspection your facts describe, with the homeowner. You never quote "
                "a roof price: the inspector or {rep} does that.",
        "what_line": "Estamos revisando los techos del vecindario después de las tormentas. ¿Cuántos años tiene el suyo?",
        "picture": "a leak in the next storm, versus a quick look now",
        "door_types": [
            ("Roof is fine", '"Mi techo está bien", "Está nuevo"', [
                'Ask: "¡Qué bueno! ¿Cuándo fue la última vez que lo revisaron?" and "¿Le pegó el granizo de la tormenta?"',
                "Hail damage is hard to see from the ground: say so, then offer the inspection from your facts.",
                "Roof truly new and no storm: thank them and call move_on.",
            ]),
            ("Can't afford a roof", '"No tengo dinero para un techo"', [
                'Reassure: today is just a look. "Le entiendo. Por eso empezamos con una revisión." Insurance or '
                "financing only from your facts; if they don't say, call ask_rep.",
            ]),
            ("Renter", '"Rento"', ["Thank them, ask if the owner lives nearby, then call move_on."]),
        ],
        "probes": ["¿Cuántos años tiene su techo?", "¿Le pegó el granizo o la tormenta pasada?",
                   "¿Ha visto goteras o manchas en el techo por dentro?", "¿Usted es dueño de la casa?"],
        "close_es": ["Entonces le apartamos la revisión. Nomás ocupamos un buen nombre y número.{ask_name_es}",
                     "¿Qué día le queda mejor para que vengan a revisarlo?"],
        "close_en": ["So let's set up the inspection. We just need a good name and number.{ask_name_en}",
                     "What day works best for them to come take a look?"],
        "brush_offs": [
            ("Mi techo está bien.", "Doesn't see damage.",
             "¡Qué bueno! El daño del granizo casi no se ve desde abajo. ¿Cuándo fue la última vez que lo revisaron?"),
            ("No tengo dinero.", "Thinks it means a big bill.", "Le entiendo. Hoy no se trata de comprar nada, solo de revisarlo."),
            ("Ya vino otra compañía.", "Shopping around.", "¡Qué bien que lo revisaron! ¿Qué le dijeron?"),
        ],
        "rules": ["Never say a price for a roof or a repair. Only the inspection's terms from your facts."],
    },
    "ministry": {
        "title": "Door skills (how a seasoned volunteer invites a neighbor)",
        "goal": "You're inviting neighbors, not selling. Success is a warm yes to the invitation and, if they want, "
                "their name and number so the church can text them the details. Never pressure.",
        "what_line": "Estamos invitando a los vecinos a nuestra iglesia. No vendemos nada.",
        "picture": "the kids having fun at the kids' program while the parents meet their neighbors",
        "door_types": [
            ("Already has a church", '"Ya tengo iglesia", "Soy católico", "Voy a otra iglesia"', [
                'Celebrate it: "¡Qué bendición!" Invite lightly anyway: "Si algún día quiere visitarnos, aquí estamos." '
                "Offer the details; never argue about faith. Then thank them.",
            ]),
            ("Not interested", '"No voy a la iglesia", "No me interesa"', [
                'Respect it at once: "Claro, gracias por su tiempo. ¡Que Dios le bendiga!" If something in your facts '
                "fits (a kids' program, food), mention it once, then call move_on.",
            ]),
            ("Interested", '"¿A qué hora es?", "¿Dónde queda?"', [
                "Give the day, time and place from your facts, then the close.",
            ]),
        ],
        "probes": ["¿Tiene una iglesia a la que asiste?", "¿Cuántos son en la familia?", "¿Tiene niños?"],
        "close_es": ["¿Lo esperamos? Si quiere, le mandamos la dirección y la hora por mensaje.",
                     "Nomás ocupamos su nombre y un número para mandarle los detalles.{ask_name_es}"],
        "close_en": ["Can we count on seeing you? If you'd like, we'll text you the address and time.",
                     "We just need your name and a number to send you the details.{ask_name_en}"],
        "brush_offs": [
            ("Ya tengo iglesia.", "Already attends.", "¡Qué bendición! Entonces nomás lo invitamos por si algún día quiere visitarnos."),
            ("Soy de otra religión.", "Different faith.", "Con mucho respeto, todos son bienvenidos. Gracias por su tiempo."),
            ("¿Me van a pedir dinero?", "Worried about money.", "No, para nada. Solo lo estamos invitando."),
        ],
        "skip_common": ("No compro nada en la puerta.", "¿Para qué quiere mis datos?"),
        "rules": [
            "Nothing is for sale. Never mention prices, plans or money, and never ask for money or donations.",
            "One warm invitation, then respect their answer. Never argue about faith or pressure anyone.",
            "Offer to pray only if they seem open to it, and only once.",
        ],
    },
    "fundraiser": {
        "goal": "You're raising money. Success is a purchase; a kind no is fine too.",
        "what_line": "Estamos recaudando fondos{company_part}. Con su compra nos ayuda muchísimo.",
        "picture": "the team getting to go on the trip because their neighbors helped",
        "door_types": [
            ("No cash", '"No traigo efectivo", "No tengo dinero ahorita"', [
                "Offer only the ways to pay in your facts. None fits: thank them warmly and call move_on.",
            ]),
            ("Already bought", '"Ya le compré a otro"', ['Thank them: "¡Muchas gracias por apoyar!" Then call move_on.']),
        ],
        "probes": ["¿Para usted o para regalar?"],
        "close_es": ["¿Cuántos le doy?", "Con uno nos ayuda muchísimo.{ask_name_es}"],
        "close_en": ["How many can I put you down for?", "Even one helps a lot.{ask_name_en}"],
        "brush_offs": [
            ("No traigo efectivo.", "How to pay.", "No se preocupe. (Offer only the ways to pay in your facts.)"),
            ("Ya compré.", "Already helped.", "¡Muchas gracias por apoyar!"),
        ],
        "rules": ["Prices are paid once, not monthly. Never say \"al mes\".",
                  "A no is fine: thank them warmly. Never push more than once."],
    },
    "other": {
        "goal": "Your goal is a sign-up for what your facts describe.",
        "what_line": "Le cuento rápido. (Say the heart of your pitch in one sentence, then ask one question.)",
        "picture": "what changes in their day once they have it",
        "door_types": [],
        "probes": ["¿Ya tiene algo así?", "¿Cuánto paga ahorita por algo parecido?", "¿Qué es lo que más le importa?"],
        "close_es": ["Entonces, si le interesa, nomás ocupamos un buen nombre, número y correo, y se lo dejamos listo.",
                     "Se lo podemos dejar listo hoy mismo.{ask_name_es}"],
        "close_en": ["So if you're interested, we just need a good name, number and email and we'll get it set up.",
                     "We can get it set up for you today.{ask_name_en}"],
        "brush_offs": [],
    },
}

# Brush-offs every industry meets (internet has its own, richer list above).
COMMON_BRUSH_OFFS: list[tuple[str, str, str]] = [
    ("No, gracias. / Estoy bien.", "A reflex. They haven't heard you yet.", "¡Claro! Solo una pregunta rápida: {probe}"),
    ("Ahorita no, estoy ocupado.", "Bad moment, not a real no.",
     "No se preocupe, es solo un minuto. (If they're truly busy: ¿A qué hora le queda mejor que regresemos?)"),
    ("¿Qué vende? / ¿De qué se trata?", "Guarded. Wants to know fast.", "{what_line}"),
    ("No compro nada en la puerta.", "Worried about being pressured.",
     "Le entiendo, por eso no le pido nada hoy. Solo le cuento para que lo compare."),
    ("Déjeme pensarlo.", "One thing is holding them back.", "Claro. ¿Qué le gustaría pensar? Así se lo aclaro de una vez."),
    ("Tengo que hablar con mi esposo. / Con mi esposa.", "Shared decision.",
     "Me parece muy bien. ¿Está en casa? Con gusto les explico a los dos. Si no, ¿a qué hora regresamos?"),
    ("Mándeme la información.", "Interested but not ready.", "Con gusto. ¿A qué número se la mando por mensaje?"),
    ("¿Esto es una estafa? / ¿De dónde son?", "Trust.",
     "Es normal preguntar. Trabajo con {rep}{company_part}. {rep} le puede mostrar su identificación."),
    ("¿Para qué quiere mis datos?", "Privacy worry.",
     "Solo para apartarle su lugar y mandarle la confirmación. Números como el seguro social o la cuenta del banco "
     "no me los dice a mí: si hacen falta, se los da directamente a {rep}."),
]

GENERIC_VALUE_RULES = [
    "Ask before you tell. One question about their situation, then STOP and let them answer. Never answer your own "
    "question or keep talking while they think.",
    "Build value from their answer, in their words: \"Usted me dijo que...\", \"O sea que...\". A benefit they "
    "didn't say they need doesn't stick.",
    "One value point per turn, never a list. Three benefits in one breath sound like a sales pitch and none sticks.",
    "Make it a picture they can see in their own life ({picture}), not a feature.",
    "Check it landed: \"¿Le pasa eso?\", \"¿Verdad?\" Wait for the yes before the next point.",
    "Money in their terms: what they pay now, and savings per year, not per month.",
    "The price comes last, as the fix for what they told you. Then close (below): don't ask whether they want it.",
    "After a soft no (\"no, está bien\"), ask ONE question and wait for the answer. Don't say goodbye in the same "
    "breath; that's a goodbye, not a question.",
]
_MONEY_RULES = (GENERIC_VALUE_RULES[5], GENERIC_VALUE_RULES[6])


def industry_id(value: object) -> str:
    """The industry a playbook names, or "internet" for older playbooks that name none."""
    v = str(value or "").strip().lower()
    return v if v in INDUSTRY_IDS else ("internet" if not v else "other")


def _industry_skills_text(industry: str, rep: str, company: str, price_phrase: str, signup_by: str) -> str:
    pack = PACKS[industry]
    probes: list[str] = list(pack["probes"])  # type: ignore[arg-type]
    fill = {"rep": rep, "company_part": f", de {company}" if company else "", "price_phrase": price_phrase or "el precio",
            "probe": probes[0] if probes else "¿Le puedo contar rápido?"}
    fill["what_line"] = str(pack["what_line"]).format(**fill)
    voice = signup_by == "voice"
    close_fill = {"ask_name_es": " ¿Cuál es su nombre completo?" if voice else "",
                  "ask_name_en": " What's your full name?" if voice else ""}
    selling = industry != "ministry"
    value_rules = [r.format(picture=pack["picture"]) for r in GENERIC_VALUE_RULES if selling or r not in _MONEY_RULES]
    value = "\n".join(f"- {r}" for r in value_rules)
    closes_es = "\n".join(f'  - "{c.format(**close_fill)}"' for c in pack["close_es"])  # type: ignore[union-attr]
    closes_en = " / ".join(f'"{c.format(**close_fill)}"' for c in pack["close_en"])  # type: ignore[union-attr]
    after = AFTER_CLOSE["voice" if voice else "tablet"].format(rep=rep)
    closing = "\n".join([
        "- When they agree with the value, or just nod or go quiet, that's your moment: go straight to the close.",
        "- Never ask if they want it: no \"¿le interesa?\", \"¿vale la pena probarlo?\". Asking hands them an easy no.",
        "- Close warm and sure, and move right into the details:",
        closes_es,
        f"  In English mode: {closes_en}",
        f"- {after}",
        "- If they hesitate or raise a concern, handle it with the ladder, then close again the same way.",
    ])
    types = "\n\n".join(
        f"{i}. {name}\nSigns: {signs}\n" + "\n".join(f"   - {step.format(**fill)}" for step in steps)
        for i, (name, signs, steps) in enumerate(pack["door_types"], 1)  # type: ignore[arg-type]
    )
    skip = set(pack.get("skip_common", ()))  # type: ignore[arg-type]
    offs_list = list(pack["brush_offs"]) + [b for b in COMMON_BRUSH_OFFS if b[0] not in skip]  # type: ignore[operator]
    offs = "\n".join(f'- They say "{says}" ({means}) -> e.g. "{reply.format(**fill)}"' for says, means, reply in offs_list)
    ladder = "\n".join(f"{i}. {step}" for i, step in enumerate([
        "Acknowledge kindly first (\"Claro\", \"Le entiendo\", \"Con gusto\"). Never argue.",
        "Ask ONE easy question about their situation (the questions below).",
        "Wait for the answer. Then connect it to ONE real benefit, in their words, and check it landed.",
        "Give the offer using only your facts." if selling else "Give the invitation using only your facts.",
        "Assume the close (see Closing).",
    ], 1))
    stops = "\n".join(f"- {s}" for s in HARD_STOPS)
    rules = "\n".join(f"- {r.format(**fill)}" for r in pack.get("rules", []))  # type: ignore[union-attr]
    title = pack.get("title", "Sales skills (how a seasoned rep handles the door)")
    goal = str(pack["goal"]).format(**fill)
    parts = [f"# {title}\n{goal}",
             f"## Building value so it sticks (every door)\n{value}",
             f"## Closing (assume it)\n{closing}"]
    if types:
        parts.append(f"## The doors you will meet most. Figure out which one you're at, then follow its steps.\n{types}")
    parts.append(f"""## For everything else
Use this ladder on every brush-off or objection:
{ladder}
Give each brush-off at most two friendly tries. Adapt the wording; never read it like a script.

Easy questions to probe with: {' '.join(probes)}

Common brush-offs and objections, with the kind of answer that works:
{offs}

When to stop:
{stops}""")
    if rules:
        parts.append(f"## Rules for these doors\n{rules}")
    return "\n\n".join(parts).strip()


def sales_skills_text(rep: str, company: str, price: str, signup_by: str = "tablet", industry: str = "internet",
                      price_phrase: str = "") -> str:
    """The sales-skills section of Hola's instructions, with the rep's name and price filled in.
    price is the lowest price ("$35"); price_phrase is how to say it ("$35 al mes", or "$5" for a one-time price)."""
    industry = industry_id(industry)
    if industry != "internet":
        return _industry_skills_text(industry, rep, company, price_phrase, signup_by)
    fill = {"rep": rep, "company_part": f", de {company}" if company else "", "price": price}
    voice = signup_by == "voice"
    close_fill = {"ask_name_es": " ¿Cuál es su nombre completo?" if voice else "",
                  "ask_name_en": " What's your full name?" if voice else "",
                  "after_close": AFTER_CLOSE["voice" if voice else "tablet"].format(rep=rep)}
    ladder = "\n".join(f"{i}. {step}" for i, step in enumerate(LADDER, 1))
    probes = " ".join(PROBE_QUESTIONS)
    offs = "\n".join(
        f'- They say "{says}" ({means}) -> e.g. "{reply.format(**fill)}"' for says, means, reply in BRUSH_OFFS
    )
    stops = "\n".join(f"- {s}" for s in HARD_STOPS)
    value = "\n".join(f"- {r}" for r in VALUE_RULES)
    closing = "\n".join((r if r.startswith("  ") else f"- {r}").format(**close_fill) for r in CLOSING)
    types = "\n\n".join(
        f"{i}. {t['name']}\nSigns: {t['signs']}\n"
        + "\n".join(f"   - {str(step).format(**fill)}" for step in t["steps"])  # type: ignore[union-attr]
        for i, t in enumerate(DOOR_TYPES, 1)
    )
    return f"""# Sales skills (how a seasoned rep handles the door)
Your goal is a sign-up, but the rep's time matters too: qualify fast and leave doors with no real need.

## Building value so it sticks (every door)
{value}

## Closing (assume it)
{closing}

## The 4 door types you will meet most. Figure out which one you're at, then follow its steps.
{types}

## For everything else
Use this ladder on every brush-off or objection:
{ladder}
Give each brush-off at most two friendly tries. Adapt the wording; never read it like a script.

Easy questions to probe with: {probes}

Common brush-offs and objections, with the kind of answer that works:
{offs}

When to stop:
{stops}""".strip()
