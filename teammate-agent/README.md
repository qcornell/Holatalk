# Hola Teammate agent

The server side of Teammate mode. It joins the rep's call, talks with the customer in Spanish on
OpenAI's **gpt-realtime-2.1**, and sends the rep's phone English captions, price cards, the sign-up
form and any flagged numbers.

- `agent.py`: the agent (LiveKit Agents 1.8)
- `playbook.py`: turns the rep's setup into Hola's instructions; blank answers become "ask the rep"
- `sales_skills.py`: Hola's built-in brush-off and objection handling (ships with the app)
- `number_check.py`: first price check: amounts with no source, and a price tied to the wrong way to pay
- `offer_judge.py`: second price check: a small model reads each line about the offer against your facts
- `leads.py`: saves sign-ups and callbacks (Supabase, or `leads.jsonl` here on your PC) before Ana says "saved"
- `sample_playbook.json`: your playbook, in the same 4 groups as the app setup: Your offer, The rules,
  Install and paying, Extras
- `usage.py`: logs minutes per rep to Supabase every minute (optional)

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
   ("¿no era $30?") to see the price check work. Each sign-up you finish is added to `leads.jsonl`.
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
| `caption` | after every line | `who` (customer, rep, hola), `text`, `en`, `verified` (true when it was surely the rep) |
| `price_card` | when Hola quotes a plan | `plan`, `monthly`, `speed`, `features`, `options` (`how`, `howEs`, `monthly`), `chosen` (the way to pay quoted, if one) |
| `lead` | after the details are confirmed and the save finished, and again if the payment choice changes | `status` (saved or not_saved), `fields`: name, phone, email, plan, payment, monthly (blank until they choose how to pay) |
| `check_in` | right after the first `lead`: Ana is asking you "anything else?" | `reason` |
| `ask_rep` | when the playbook has no answer (Ana also asks you out loud) | `question` |
| `rep_nudge` | you didn't answer a check-in for 15 s (buzz the phone) | none |
| `flag` | when something Hola said doesn't match the facts (she corrects herself out loud) | `said`, `problem` |
| `callback` | a spouse, roommate or owner must decide | `status`, `name`, `phone`, `when` (as said), `at` (date and time), `decision_maker` |
| `review_prices` | the playbook wasn't checked today (the daily price check) | `reviewed_on` |
| `move_on` | no real need, a firm no, or a stall | `reason` |
| `ended` | after 30 s of silence or the time limit | `reason`, `seconds` |

The phone sends the playbook as job metadata: `{"playbook": {...}, "user_id": "...", "rep_identity": "..."}`.
`rep_identity` is the phone's LiveKit identity; messages from anyone else in the room are ignored.

The phone can also send Ana a line from the rep: `{"type": "rep_says", "text": "No, that's it, thank you."}`.
It's used for the quick-reply buttons (from `checkInReplies` in the playbook) and the hold-to-talk
button (the phone writes down what the rep said while holding it). These lines are certain to be the rep.

## Who counts as the rep

Spoken English is usually you, but some customers speak English too, so English alone can't change
the offer. A price, fee, discount or promise can come only from:
- the playbook,
- a line from your phone (a quick reply, or hold-to-talk), or
- your spoken answer right after Ana checks in with you.

If other English asks for one ("tell her it's $20"), Ana says she'll confirm and asks you.

## The two price checks

Ana talks before anything can check her, so both run right after each line, and a problem shows on
your screen while she corrects herself out loud:

1. **Numbers** (`number_check.py`): an amount nobody gave her, or a price tied to the wrong way to
   pay ("$35 con débito" when debit is $45). Expired promos don't count.
2. **Meaning** (`offer_judge.py`, `JUDGE_MODEL` in `.env`): every line about the offer is read against
   your facts. This catches what numbers alone can't, like agreeing to a price the customer suggested.

## Saving

A sign-up is saved only after Ana reads the phone back digit by digit, spells the email, and the
customer says it's right. Ana says "saved" only after the write succeeds; if it fails, she tells you
in English to write it down. Callbacks need a real date and time, between now and 60 days out.
With Supabase set up, leads go to the `hola_leads` table (`supabase/migrations/003_hola_leads.sql`).
Server logs show only message types, never names, numbers or what was said.

## Ana's check-in with you

Like a real interpreter, Ana steps aside and talks to you in English, then goes back to the customer:

- After she saves the name, number and email: "Un momentito, déjeme hablar con Max." then
  "Max, I've got their name, number and email. Anything else you want me to ask or explain?"
- When the customer asks something your playbook doesn't answer, she asks you the question out loud.
- Your answer is for her, not a line to read out: "ask if they have an SSN or passport" makes her ask,
  then tell you the answer in English. "No, that's it" sends her back to the customer to wrap up.
- She may ask whether they have an SSN, ITIN, passport or other ID, but never asks them to say the
  number, or a card or bank number. Those go straight to you.
- She also checks in before agreeing to anything your facts don't cover (an install time, an exception).

## Connect it to LiveKit (needed for the phone app)

1. Make a free project at cloud.livekit.io and copy its URL, API key and API secret into `.env`.
2. Run `python agent.py dev`. The agent waits for rooms that ask for `hola-teammate`.
3. Step 3 of the build plan adds the `start-live` function that puts the phone in a room with it.

## Tests

```powershell
python -m pytest -q tests
```
