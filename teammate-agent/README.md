# Hola Teammate agent

The server side of Teammate mode. It joins the rep's call, talks with the customer in Spanish on
OpenAI's **gpt-realtime-2.1**, and sends the rep's phone English captions, price cards, the sign-up
form and any flagged numbers.

- `agent.py`: the agent (LiveKit Agents 1.8)
- `playbook.py`: turns the rep's setup into Hola's instructions; blank answers become "ask the rep"
- `number_check.py`: checks every amount Hola says against the playbook
- `sample_playbook.json`: your playbook. Same items as the "Customer questions" tab in the plan doc
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
4. Open `sample_playbook.json` and type your real answers into the blanks (install fee, contract,
   autopay and so on). Anything you leave blank, Hola tells the customer it will check with you.
5. Start it:
   ```powershell
   python agent.py console
   ```
   Hola greets you in Spanish. Play the customer in Spanish, ask about price, install and autopay,
   then speak English as the rep ("tell her install is Saturday"). Try a wrong price on purpose
   ("¿no era $30?") to see the price check work.

## What the phone receives

Messages arrive on the LiveKit data channel, topic `hola`, as JSON:

| `type` | When | Fields |
| --- | --- | --- |
| `caption` | after every line | `who` (customer, rep, hola), `text`, `en` |
| `price_card` | when Hola quotes a plan | `plan`, `monthly`, `speed`, `features` |
| `lead` | after the sign-up details are confirmed | `fields`: name, phone, email, address, plan |
| `ask_rep` | when the playbook has no answer | `question` |
| `flag` | when Hola says an amount it had no source for | `said`, `amounts` |
| `ended` | after 30 s of silence or the time limit | `reason`, `seconds` |

The phone can send the playbook as job metadata: `{"playbook": {...}, "user_id": "..."}`.

## Connect it to LiveKit (needed for the phone app)

1. Make a free project at cloud.livekit.io and copy its URL, API key and API secret into `.env`.
2. Run `python agent.py dev`. The agent waits for rooms that ask for `hola-teammate`.
3. Step 3 of the build plan adds the `start-live` function that puts the phone in a room with it.

## Tests

```powershell
python -m pytest -q tests
```
