/**
 * Teammate mode setup: what Ana is allowed to say, saved on the phone.
 *
 * toPlaybook() turns it into the playbook the agent reads (teammate-agent/playbook.py, same shape as
 * sample_playbook.json). The phone sends it to Ana when she joins the call.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@hola_teammate_settings';

export interface PriceOption {
  /** How they pay, in English, e.g. "Autopay from a checking account" */
  how: string;
  /** The same in Spanish, as Ana says it */
  howEs: string;
  priceMonthly: number;
}

export interface TeammatePlan {
  name: string;
  speed: string;
  priceMonthly: number;
  priceOptions: PriceOption[];
}

export interface Promo {
  descriptionEs: string;
  description: string;
  /** YYYY-MM-DD; Ana stops mentioning it after this day */
  expiresAt: string;
}

export interface Connection {
  /** LiveKit Cloud > Settings > Development token server ID (testing only) */
  tokenServerId: string;
  /** The start-live function URL, for real use with an access code */
  startUrl: string;
  accessCode: string;
}

export interface TeammateSettings {
  repName: string;
  companyName: string;
  assistantName: string;
  pitch: string;
  plans: TeammatePlan[];
  hasContract: boolean;
  installationFee: number;
  promos: Promo[];
  /** Answers to customer questions, by topic. Blank = Ana asks you. */
  facts: Record<string, Record<string, string>>;
  /** "tablet": they type their details on your tablet. "voice": Ana asks for them out loud. */
  signupBy: 'tablet' | 'voice';
  /** Your tap-to-answer buttons when Ana checks in */
  checkInReplies: string[];
  /** YYYY-MM-DD you last said prices and promos are right */
  reviewedOn: string;
  connection: Connection;
  deviceId: string;
}

/** The customer questions, by topic, with blanks for anything not known yet. */
export const FACT_TOPICS: Record<string, string[]> = {
  'Your offer': [
    'Price includes taxes and fees (yes / no, about $ extra / not sure)',
    'Price stays the same for (12 months / 24 months / always / not sure)',
    'Current promo and when it ends',
  ],
  'The rules': [
    'Contract (none / 12 months / 24 months)',
    'Cancellation fee',
    'Credit check (yes / no)',
    'Social Security number needed (yes / no)',
    "IDs accepted (matrícula, passport, ITIN, state ID, driver's license)",
    'Deposit (none / $)',
  ],
  'Install and paying': [
    'Install fee (free / $)',
    'Soonest install (same day / next day / within 3 days / within a week)',
    'How long the install takes',
    'Who must be home (an adult 18 or older)',
    'Drilling or new wires',
    'Autopay (required / optional / not offered)',
    'Autopay discount',
    'Ways to pay (card / debit / bank account / cash at a store / money order)',
    'First bill (when and how much)',
  ],
  Extras: [
    'Router and equipment included, and any equipment fee',
    'Data limit',
    'Spanish customer service number',
    'Number customers can call to check you are real',
    'Local store',
    'Help switching from their old company, or paying their old cancellation fee',
    "Renters: is the landlord's OK needed",
  ],
};

function blankFacts(): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const [topic, questions] of Object.entries(FACT_TOPICS)) {
    out[topic] = Object.fromEntries(questions.map((q) => [q, '']));
  }
  return out;
}

function newDeviceId(): string {
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  const part = (n: number) => Array.from({ length: n }, hex).join('');
  return `${part(8)}-${part(4)}-4${part(3)}-${part(4)}-${part(12)}`;
}

/** Quentin's current offer, so the first test works right away. Everything is editable in setup. */
export function defaultSettings(repName = 'Quentin', companyName = ''): TeammateSettings {
  const facts = blankFacts();
  facts['The rules']['Contract (none / 12 months / 24 months)'] = 'None (sin contrato)';
  facts['Install and paying']['Install fee (free / $)'] = 'Free (instalación gratis)';
  facts['Install and paying']['Autopay (required / optional / not offered)'] =
    'Optional, but autopay from a checking account is what gets the $35 price';
  facts['Install and paying']['Autopay discount'] =
    '$35 a month with checking-account autopay instead of $45 with a debit card ($10 less)';
  facts['Install and paying']['Ways to pay (card / debit / bank account / cash at a store / money order)'] =
    'Autopay from a checking account (account and routing number) for $35 a month, or a debit card for $45 a month';
  return {
    repName,
    companyName,
    assistantName: 'Ana',
    pitch:
      'Ofrecemos internet aquí en el área por solo $35 al mes. Si le interesa, normalmente solo necesitamos su ' +
      'nombre, un número de teléfono y su correo, y se lo dejamos listo. La instalación es gratis y no hay ' +
      'contrato. ¿Ya tiene una tele inteligente?',
    plans: [
      {
        name: 'Internet',
        speed: '',
        priceMonthly: 35,
        priceOptions: [
          {
            how: 'Autopay from a checking account (account and routing number)',
            howEs: 'pago automático de su cuenta de cheques, con número de cuenta y de ruta',
            priceMonthly: 35,
          },
          { how: 'Debit card', howEs: 'con tarjeta de débito', priceMonthly: 45 },
        ],
      },
    ],
    hasContract: false,
    installationFee: 0,
    promos: [],
    facts,
    signupBy: 'tablet',
    checkInReplies: [
      'Have them enter their date of birth',
      'Have them enter their Social Security number',
      'Explain: $35 with autopay from checking, $45 with debit',
    ],
    reviewedOn: '',
    connection: {
      tokenServerId: process.env.EXPO_PUBLIC_LIVEKIT_TOKEN_SERVER_ID ?? '',
      startUrl: process.env.EXPO_PUBLIC_TEAMMATE_START_URL ?? '',
      accessCode: '',
    },
    deviceId: newDeviceId(),
  };
}

export async function loadTeammateSettings(): Promise<TeammateSettings | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<TeammateSettings>;
    const base = defaultSettings(saved.repName, saved.companyName);
    return {
      ...base,
      ...saved,
      facts: { ...base.facts, ...(saved.facts ?? {}) },
      connection: { ...base.connection, ...(saved.connection ?? {}) },
      deviceId: saved.deviceId || base.deviceId,
    };
  } catch (e) {
    console.warn('[teammate] settings load failed', e);
    return null;
  }
}

export async function saveTeammateSettings(s: TeammateSettings): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(s));
}

/** Today in the phone's time zone, as YYYY-MM-DD. */
export function today(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function needsDailyCheck(s: TeammateSettings, day = today()): boolean {
  return s.reviewedOn !== day;
}

/** Promos still running today (expired ones drop off on their own, like Ana's own check). */
export function activePromos(s: TeammateSettings, day = today()): Promo[] {
  return s.promos.filter((p) => p.descriptionEs.trim() && (!p.expiresAt || p.expiresAt >= day));
}

export function money(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

/** The lines the daily check shows: what Ana will tell customers today. */
export function offerSummary(s: TeammateSettings, day = today()): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  for (const plan of s.plans) {
    if (plan.priceOptions.length) {
      for (const o of plan.priceOptions) rows.push({ label: `${plan.name}, ${o.how}`, value: `${money(o.priceMonthly)}/mo` });
    } else {
      rows.push({ label: plan.name, value: `${money(plan.priceMonthly)}/mo` });
    }
  }
  rows.push({ label: 'Install', value: s.installationFee ? money(s.installationFee) : 'Free' });
  rows.push({ label: 'Contract', value: s.hasContract ? 'Yes' : 'None' });
  const promos = activePromos(s, day);
  rows.push({ label: 'Promos', value: promos.length ? String(promos.length) : 'None' });
  return rows;
}

/** The playbook Ana reads, in the agent's format (see teammate-agent/sample_playbook.json). */
export function toPlaybook(s: TeammateSettings): Record<string, unknown> {
  return {
    repName: s.repName.trim() || 'el representante',
    companyName: s.companyName.trim(),
    assistantName: s.assistantName.trim() || 'Ana',
    reviewedOn: s.reviewedOn,
    signupBy: s.signupBy,
    pitch: s.pitch.trim(),
    plans: s.plans.map((p) => ({
      name: p.name.trim() || 'Internet',
      speed: p.speed.trim(),
      priceMonthly: p.priceOptions.length ? Math.min(...p.priceOptions.map((o) => o.priceMonthly)) : p.priceMonthly,
      features: [],
      priceOptions: p.priceOptions
        .filter((o) => o.how.trim() && o.priceMonthly > 0)
        .map((o) => ({ how: o.how.trim(), howEs: o.howEs.trim(), priceMonthly: o.priceMonthly })),
    })),
    policies: { hasContract: s.hasContract, installationFee: s.installationFee },
    promos: s.promos
      .filter((p) => p.descriptionEs.trim())
      .map((p) => ({ descriptionEs: p.descriptionEs.trim(), description: p.description.trim(), ...(p.expiresAt ? { expiresAt: p.expiresAt } : {}) })),
    customPhrases: [],
    checkInReplies: s.checkInReplies.filter((r) => r.trim()),
    facts: s.facts,
  };
}
