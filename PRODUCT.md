# Hola — Product Architecture

## Overview
Real-time sales assistant for door-to-door reps selling to Spanish-speaking customers.
Not a translator — a **sales copilot** with intent detection + coached responses.

## App States

### 1. SLEEP MODE (default — battery saver)
- Screen off / minimal
- ONLY listening for wake word **"Hola"**
- Ultra-low power: tiny keyword detector, no Whisper model loaded
- Green dot indicator = sleeping but ready

### 2. ACTIVE MODE (triggered by "Hola")
- Whisper model hot, full VAD listening
- Intent detection running on every utterance
- Coach card showing recommended responses
- Two output modes:
  - 🎧 **Ear mode** (default) — rep hears coaching in earpiece, repeats to customer
  - 🔊 **Speaker mode** — tap button, phone speaks Spanish directly to customer (fallback)

### 3. Auto-sleep after 60s of no speech → back to sleep mode

## Output Modes

### 🎧 Ear Mode (Primary)
- Customer speaks Spanish → app detects intent → whispers English coaching + Spanish script in rep's ear
- Rep repeats the Spanish phrase naturally
- Feels like rep actually speaks Spanish

### 🔊 Speaker Mode (Fallback)
- Rep taps speaker button when off-track or stuck
- Phone speaks the coached Spanish response out loud through speaker
- Customer hears it directly from the device
- Good safety net — "let me have my assistant explain"

## Wake Flow
```
SLEEP → hears "Hola" → 
  App says in ear: "Soy [Rep Name] de [Company]" →
  Rep repeats to customer →
  ACTIVE MODE → listening for customer response →
  Detect intent → Coach response → Rep repeats or Speaker plays
```

## Customization Architecture (B2B SaaS)

### 90% Pre-loaded (ships with app)
- Full Spanish phrase corpus (objections, questions, buying signals)
- Intent detection engine
- Spanglish patterns
- VAD / wake word detection
- UI / UX

### 10% Customizable (per-company setup)

#### Option A: Simple Form (Primary — "If you can use ChatGPT, you can use Hola")
Onboarding wizard:
1. **Rep name** → "Quentin" → generates "Soy Quentin de..."
2. **Company name** → "Optimum" → inserted into all scripts
3. **Plans & Prices** → simple table input:
   | Plan Name | Speed | Price/mo |
   |-----------|-------|----------|
   | Basic     | 300mb | $39.99   |
   | Plus      | 500mb | $59.99   |
   | Ultra     | 1gig  | $79.99   |
4. **Contract?** → Yes/No toggle
5. **Credit check?** → Yes/No toggle
6. **Accepted IDs** → checkboxes (Matrícula, ITIN, Passport, State ID, etc.)
7. **Installation fee** → $0 / amount
8. **Special promos** → free text field

System auto-generates all coached responses from this data.

#### Option B: Document Upload (Power users / enterprise)
- Upload PDF/doc with plan details, pricing sheet, scripts
- Lightweight AI (local or OpenAI) extracts:
  - Plan names, speeds, prices
  - Contract terms
  - Promo details
  - Company policies
- Auto-populates the same fields as Option A
- Rep reviews + confirms before going live

### Config Storage
```typescript
interface CompanyConfig {
  repName: string;
  companyName: string;
  plans: {
    name: string;
    speed: string;
    priceMonthly: number;
    features?: string[];
  }[];
  policies: {
    hasContract: boolean;
    contractLength?: string;
    earlyTerminationFee?: number;
    creditCheck: boolean;
    acceptedIds: string[];
    installationFee: number;
  };
  promos: {
    description: string;
    expiresAt?: string;
  }[];
  customPhrases?: {
    trigger: string;
    responseEn: string;
    responseEs: string;
  }[];
}
```

All coached responses template from this config:
- "No hay contrato" vs "El contrato es de {contractLength}"  
- "Aceptamos {acceptedIds.join(', ')}"
- "El plan de {speed} está a ${priceMonthly} al mes"

## Pricing Model (Future)
- **Hola Free** — 1 rep, 3 intents, basic coaching
- **Hola Pro** ($10-20/mo per rep) — All intents, speaker mode, custom config
- **Hola Enterprise** — API, doc upload, multi-team, analytics dashboard

## Tech Stack
- Expo / React Native
- Whisper C++ (on-device STT — no network needed)
- Custom intent engine (pure JS, <2ms detection)
- Config stored locally (AsyncStorage) + optional cloud sync
- Future: lightweight local LLM for dynamic responses
