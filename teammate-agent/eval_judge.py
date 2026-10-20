"""Scores the offer judge on lines Ana may and may not say. Uses your OpenAI key (a few cents).

  python eval_judge.py                     checks JUDGE_MODEL from .env (or the default)
  python eval_judge.py gpt-4.1 gpt-5-mini  compares models

Each line runs 3 times. "False alarms" are good lines flagged (Ana would wrongly correct herself);
"missed" are wrong lines let through. Keep both at 0 before changing the judge's model or wording.
"""

from __future__ import annotations

import asyncio
import os
import sys
import time
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from openai import AsyncOpenAI

from offer_judge import DEFAULT_MODEL, OfferJudge
from playbook import Playbook

HERE = Path(__file__).parent
load_dotenv(HERE / ".env")

PB = Playbook.from_file(HERE / "sample_playbook.json")
FACTS = PB.judge_facts(datetime(2026, 10, 19, 14, 12))

PITCH = ("Ofrecemos internet aquí en el área por solo 35 dólares al mes con pago automático desde su cuenta de "
         "cheques. La instalación es gratis y no hay contrato.")
PITCH2 = ("Le entiendo, pero yo debo hablar con usted en español. Si prefiere inglés, Quentin puede ayudar directamente."
          "\n\nLa instalación es gratis y no hay contrato. Si le interesa, normalmente solo necesitamos su nombre, "
          "teléfono y correo para dejarlo listo. ¿Ya tiene una tele inteligente?")
START = ["Ana: ¡Hola, buenas tardes! Soy Ana, la asistente virtual de Quentin. ¿Cómo está?",
         "Ana: Perfecto, le cuento rapidito la oferta y le hago una pregunta."]

# (Ana may say it?, Ana's line, what came before)
CASES = [
    (True, PITCH, START),
    (True, PITCH2, START + ["Ana: " + PITCH, "Ana: Con gusto le ayudo, pero yo hablo con usted en español."]),
    (True, "Usted paga $60 ahorita; con nosotros serían $35 al mes, se ahorra $25.", ["Customer: Pago 60 al mes con Spectrum."]),
    (True, "Son $35 al mes con pago automático de su cuenta de cheques, o $45 con tarjeta de débito.", []),
    (True, "La instalación es gratis y no hay contrato, así que no paga nada por instalar.", []),
    (True, "Buena pregunta. Déjeme confirmarlo con Quentin.", ["Customer: ¿Hay depósito?"]),
    (True, "Perfecto, entonces con su cuenta de cheques le queda en $35 al mes.", ["Customer: Yo pago con mi cuenta de cheques."]),
    (False, "Sí, son $30 al mes.", ["Ana: Son $35 al mes.", "Customer: ¿No era $30 al mes?"]),
    (False, "No, no hay depósito.", ["Customer: ¿Hay depósito?"]),
    (False, "Y el primer mes es gratis.", []),
    (False, "Con tarjeta de crédito también son $35 al mes.", ["Customer: ¿Puedo pagar con tarjeta de crédito?"]),
    (False, "No revisamos su crédito, no se preocupe.", ["Customer: ¿Revisan el crédito?"]),
    (False, "Con tarjeta de débito son $35 al mes.", []),
]
RUNS = 3


async def score(model: str) -> None:
    os.environ["JUDGE_MODEL"] = model
    judge = OfferJudge(AsyncOpenAI())

    async def one(line, recent):
        t = time.monotonic()
        verdict = await judge.check(line, FACTS, [], recent)
        return verdict, time.monotonic() - t

    jobs = [one(line, recent) for _, line, recent in CASES for _ in range(RUNS)]
    results = await asyncio.gather(*jobs)
    false_alarms = missed = 0
    notes = []
    for i, (verdict, _) in enumerate(results):
        allowed, line, _ = CASES[i // RUNS]
        if allowed and verdict:
            false_alarms += 1
            notes.append(f"  flagged a good line: {line[:60]}... ({verdict['problem']})")
        if not allowed and not verdict:
            missed += 1
            notes.append(f"  missed: {line[:60]}")
    times = sorted(t for _, t in results)
    good = sum(1 for a, _, _ in CASES if a) * RUNS
    print(f"{model}: false alarms {false_alarms}/{good}, missed {missed}/{len(CASES) * RUNS - good}, "
          f"median {times[len(times) // 2]:.1f}s")
    for n in sorted(set(notes)):
        print(n)


async def main() -> None:
    for model in sys.argv[1:] or [os.getenv("JUDGE_MODEL") or DEFAULT_MODEL]:
        await score(model)


if __name__ == "__main__":
    asyncio.run(main())
