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
6. Try the sign-up: as the customer, say yes. Ana tells them you'll hand them the tablet for their
   name, number and email, then "Quentin, are you there?" and waits. Say "yeah" and she asks you to
   hand them the tablet. Then, as the rep, try "ask her to enter her date of birth" or "have her put
   her Social": she tells the customer in Spanish to type it on the tablet, never out loud. Stay
   quiet once to hear her say "Quentin?" and then carry on.
   No tablet? Set `"signupBy": "voice"` in the playbook and Ana takes the name, number and email out
   loud, reads them back, and won't save until the customer says yes.

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
| `signup_ready` | they said yes: hand them the tablet (tablet mode; again if the payment choice changes) | `plan`, `payment`, `monthly` |
| `check_in` | right after the first `lead`: Ana is asking you "anything else?" (voice mode) | `reason` |
| `ask_rep` | when the playbook has no answer (Ana also asks you out loud) | `question` |
| `calling_rep` | Ana just said "Quentin, are you there?" because she needs you (buzz the phone) | none |
| `rep_nudge` | you didn't answer for 10 s after "are you there?", so she said your name again (buzz again) | none |
| `flag` | when something Hola said doesn't match the facts (she corrects herself out loud) | `said`, `problem` |
| `callback` | a spouse, roommate or owner must decide | `status`, `name`, `phone`, `when` (as said), `at` (date and time), `decision_maker` |
| `review_prices` | the playbook wasn't checked today (the daily price check) | `reviewed_on` |
| `move_on` | no real need, a firm no, or a stall | `reason` |
| `ended` | after 30 s of silence (3 min once they've said yes and may be typing on your tablet) or the time limit | `reason`, `seconds`, `cost_usd` |
| `hello` | Ana just joined and wants the playbook (repeats each second until it comes) | none |

What the phone sends, same topic:

| `type` | When | Fields |
| --- | --- | --- |
| `playbook` | answering `hello` | `playbook` (the rep's setup, like `sample_playbook.json`), `user_id` |
| `rep_says` | the rep tapped a quick reply | `text` |
| `rep_hold` | the rep pressed (`true`) or let go of (`false`) "Hold to jump in" | `down` |

Ana waits up to `PLAYBOOK_WAIT_SECONDS` (8) for the playbook, then falls back to `PLAYBOOK_FILE`. The
start-live function can also put the playbook in the job metadata instead:
`{"playbook": {...}, "user_id": "...", "rep_identity": "..."}`. `rep_identity` is the phone's LiveKit
identity (or whoever sent the playbook); messages from anyone else in the room are ignored.

Quick replies and anything said while "Hold to jump in" is down (plus 3 s after, while it's
transcribed) are certain to be the rep.

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

- Every time she turns to you, she tells the customer in Spanish first, then calls you in English:
  "Quentin, are you there?" Your phone buzzes. She waits for your "yeah" before asking, so you never
  miss a question buried in Spanish. If you don't answer in 10 s she says "Quentin?" once, then
  goes back to the customer.
- After she saves the name, number and email: "Un momentito, déjeme hablar con Quentin." then
  "Quentin, are you there?" and, once you answer, "I've got their name, number and email. Anything
  else you want me to ask or explain?"
- When the customer asks something your playbook doesn't answer, she asks you the question out loud.
- Your answer is for her, not a line to read out: "ask if they have an SSN or passport" makes her ask,
  then call you back ("Quentin, are you there?") and tell you the answer in English. "No, that's it" sends her back to the customer to wrap up.
- She may ask whether they have an SSN, ITIN, passport or other ID, but never asks them to say the
  number, or a card or bank number. Those go straight to you.
- She also checks in before agreeing to anything your facts don't cover (an install time, an exception).

## Use it from the iPhone app

1. Make a free project at cloud.livekit.io. Under Settings > Keys, copy the URL, API key and API
   secret into `.env` (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`).
2. Under Settings, turn on **Development token server** and copy its ID. In the app, open Call Ana >
   Edit Ana's setup > Connection and paste it. (Testing only: anyone with the ID can start calls on
   your keys, so keep it to yourself.)
3. Double-click `start-ana-for-iphone.bat` (runs `python agent.py start`). Ana waits for calls from
   the phone while that window is open; the PC must stay on and online.
4. In the app: Call Ana > Go live. The phone joins a room, Ana joins, asks for the playbook, and greets.

For real use, deploy `supabase/functions/start-live` (an access code and a monthly minutes cap) and
put its URL and your code in Connection instead of the token server ID:

```powershell
supabase functions deploy start-live --no-verify-jwt
supabase secrets set LIVEKIT_URL=wss://... LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=... TEAMMATE_ACCESS_CODES=pick-a-code
```

## Tests

```powershell
python -m pytest -q tests
```
