# Hola Teammate agent

The server side of Teammate mode. It joins the rep's call, talks with the customer in Spanish on
OpenAI's **gpt-realtime-2.1**, and sends the rep's phone English captions, price cards, the sign-up
form and any flagged numbers.

- `agent.py`: the agent (LiveKit Agents 1.8)
- `playbook.py`: turns the rep's setup into Hola's instructions; blank answers become "ask the rep"
- `sales_skills.py`: Hola's built-in brush-off and objection handling (ships with the app)
- `number_check.py`: checks every amount Hola says against the playbook
- `sample_playbook.json`: your playbook, in the same 4 groups as the app setup: Your offer, The rules,
  Install and paying, Extras
- `usage.py`: logs minutes per rep to Supabase (optional)

## Try it on your PC (about 10 minutes)

Use headphones for this test, so Hola doesn't hear itself through your speakers.

1. Install Python 3.11 or newer from python.org. Tick "Add python.exe to PATH".
2. Open PowerShell in this folder and run:
   ```powershell
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   ```
3. Copy `.env.example` to `.env` and paste your OpenAI API key after `OPENAI_API_KEY=`.
4. Open `sample_playbook.json` and type your real answers between the empty quotes `""`
   (install fee, contract, autopay and so on). Anything you leave blank, Hola tells the customer
   it will check with you.
5. Start it:
   ```powershell
   python agent.py console
   ```
   Hola greets you in Spanish. Play the customer in Spanish, ask about price, install and autopay,
   then speak English as the rep ("tell her install is Saturday"). Try a wrong price on purpose
   ("¿no era $30?") to see the price check work.
6. Try the check-in: as the customer, say yes and give a name, number and email. Ana says
   "Un momentito, déjeme hablar con Max" and asks you in English if there's anything else. Answer
   as the rep, for example "ask if they have a Social Security number or a passport", "explain it's
   $35 with autopay from checking or $45 with debit", or "no, that's it, thank you". Stay quiet
   once to hear her say "Max?" and then carry on.

## Compare gpt-realtime-2.1 and GPT-Live-1

One line in `.env` picks the AI. Run the same pitch on both and keep the one that sounds more
like a real person:

| `.env` line | AI | How it talks |
| --- | --- | --- |
| `ENGINE=realtime` | gpt-realtime-2.1 | Takes turns. About $0.08 a minute |
| `ENGINE=live` | GPT-Live-1 | Listens while it talks ("ajá"), waits through pauses. About $0.06 a minute |

Change the line, save, and run `python agent.py console` again.

## What the phone receives

Messages arrive on the LiveKit data channel, topic `hola`, as JSON:

| `type` | When | Fields |
| --- | --- | --- |
| `caption` | after every line | `who` (customer, rep, hola), `text`, `en` |
| `price_card` | when Hola quotes a plan | `plan`, `monthly` (lowest), `speed`, `features`, `options` (`how`, `howEs`, `monthly`) |
| `lead` | after the sign-up details are confirmed, and again if the payment choice changes | `fields`: name, phone, email, plan, payment, monthly |
| `check_in` | right after the first `lead`: Ana is asking you "anything else?" | `reason` |
| `ask_rep` | when the playbook has no answer (Ana also asks you out loud) | `question` |
| `rep_nudge` | you didn't answer a check-in for 15 s (buzz the phone) | none |
| `flag` | when Hola says an amount it had no source for | `said`, `amounts` |
| `callback` | a spouse, roommate or owner must decide | `name`, `phone`, `when`, `decision_maker` |
| `move_on` | no real need, a firm no, or a stall | `reason` |
| `ended` | after 30 s of silence or the time limit | `reason`, `seconds` |

The phone can send the playbook as job metadata: `{"playbook": {...}, "user_id": "..."}`.

The phone can also send Ana a reply on the same topic, for when you'd rather tap than talk
(quick-reply buttons on the check-in screen): `{"type": "rep_says", "text": "No, that's it, thank you."}`.
Ana treats it exactly as if you'd said it. The buttons come from `checkInReplies` in the playbook.

## Ana's check-in with you

Like a real interpreter, Ana steps aside and talks to you in English, then goes back to the customer:

- After she saves the name, number and email: "Un momentito, déjeme hablar con Max." then
  "Max, I've got their name, number and email. Anything else you want me to ask or explain?"
- When the customer asks something your playbook doesn't answer, she asks you the question out loud.
- Your answer is for her, not a line to read out: "ask if they have an SSN or passport" makes her ask,
  then tell you the answer in English. "No, that's it" sends her back to the customer to wrap up.
- She may ask whether they have an SSN, ITIN, passport or other ID, but never asks them to say the
  number, or a card or bank number. Those go straight to you. Long numbers are hidden in server logs.

## Connect it to LiveKit (needed for the phone app)

1. Make a free project at cloud.livekit.io and copy its URL, API key and API secret into `.env`.
2. Run `python agent.py dev`. The agent waits for rooms that ask for `hola-teammate`.
3. Step 3 of the build plan adds the `start-live` function that puts the phone in a room with it.

## Tests

```powershell
python -m pytest -q tests
```
