/**
 * Teammate mode setup: what Ana is allowed to say, saved on the phone.
 *
 * toPlaybook() turns it into the playbook the agent reads (teammate-agent/playbook.py, same shape as
 * sample_playbook.json). The phone sends it to Ana when she joins the call.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { IndustryId, PricePer } from './industries';
import { industry as industryPack } from './industries';

const KEY = '@hola_teammate_settings';

export interface PriceOption {
  /** How they pay, in English, e.g. "Autopay from a checking account" */
  how: string;
  /** The same in Spanish, as Ana says it (optional: Ana translates it herself when blank) */
  howEs: string;
  priceMonthly: number;
}

export interface TeammatePlan {
  name: string;
  speed: string;
  /** The price (monthly, or one time when the industry's prices are one-time) */
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
  /** What the rep sells; sets Ana's approach and the questions below */
  industry: IndustryId;
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

/** The internet questions (kept for older callers; use factTopics(s) for the rep's own industry). */
export const FACT_TOPICS: Record<string, string[]> = industryPack('internet').factTopics;

/** The customer questions for this rep's industry. */
export function factTopics(s: Pick<TeammateSettings, 'industry'>): Record<string, string[]> {
  return industryPack(s.industry).factTopics;
}

export function pricePer(s: Pick<TeammateSettings, 'industry'>): PricePer {
  return industryPack(s.industry).per;
}

/** Blank answers for every question of an industry, keeping any answer already given to the same question. */
export function blankFacts(id: IndustryId, keep: Record<string, Record<string, string>> = {}): Record<string, Record<string, string>> {
  const old: Record<string, string> = {};
  for (const answers of Object.values(keep)) for (const [q, a] of Object.entries(answers ?? {})) if (a) old[q] = a;
  const out: Record<string, Record<string, string>> = {};
  for (const [topic, questions] of Object.entries(industryPack(id).factTopics)) {
    out[topic] = Object.fromEntries(questions.map((q) => [q, keep[topic]?.[q] ?? old[q] ?? '']));
  }
  return out;
}

function newDeviceId(): string {
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  const part = (n: number) => Array.from({ length: n }, hex).join('');
  return `${part(8)}-${part(4)}-4${part(3)}-${part(4)}-${part(12)}`;
}

/** A new rep's starting point for an industry: no prices yet, every question blank. */
export function defaultSettings(repName = '', companyName = '', id: IndustryId = 'internet'): TeammateSettings {
  const pack = industryPack(id);
  return {
    industry: pack.id,
    repName,
    companyName,
    assistantName: 'Ana',
    pitch: '',
    plans: pack.per === 'none' ? [] : [{ name: pack.planName, speed: '', priceMonthly: 0, priceOptions: [] }],
    hasContract: false,
    installationFee: 0,
    promos: [],
    facts: blankFacts(pack.id),
    signupBy: 'tablet',
    checkInReplies: [...pack.checkInReplies],
    reviewedOn: '',
    connection: {
      tokenServerId: process.env.EXPO_PUBLIC_LIVEKIT_TOKEN_SERVER_ID ?? '',
      startUrl: process.env.EXPO_PUBLIC_TEAMMATE_START_URL ?? '',
      accessCode: '',
    },
    deviceId: newDeviceId(),
  };
}

/** Switch industries: new questions and quick replies, the same name, company and connection. */
export function withIndustry(s: TeammateSettings, id: IndustryId): TeammateSettings {
  if (s.industry === id) return s;
  const pack = industryPack(id);
  const fresh = defaultSettings(s.repName, s.companyName, id);
  return {
    ...s,
    industry: id,
    plans: fresh.plans,
    pitch: '',
    facts: blankFacts(id, s.facts),
    checkInReplies: [...pack.checkInReplies],
    hasContract: pack.hasInstall ? s.hasContract : false,
    installationFee: pack.hasInstall ? s.installationFee : 0,
    promos: [],
  };
}

export async function loadTeammateSettings(): Promise<TeammateSettings | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<TeammateSettings>;
    const base = defaultSettings(saved.repName, saved.companyName, industryPack(saved.industry).id);
    return {
      ...base,
      ...saved,
      industry: base.industry,
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

/** The prices as short chips ("$35 autopay", "$45 debit card"), for the home screen. */
export function priceChips(s: TeammateSettings): string[] {
  const per = pricePer(s);
  if (per === 'none') return [];
  const suffix = per === 'month' ? '' : ' each';
  const out: string[] = [];
  for (const plan of s.plans) {
    if (plan.priceOptions.length) {
      for (const o of plan.priceOptions) {
        if (o.priceMonthly > 0) out.push(`${money(o.priceMonthly)} ${shortHow(o.how)}`.trim());
      }
    } else if (plan.priceMonthly > 0) {
      out.push(`${money(plan.priceMonthly)}${per === 'month' ? '/mo' : suffix}`);
    }
  }
  if (industryPack(s.industry).hasInstall) {
    out.push(s.installationFee ? `${money(s.installationFee)} install` : 'Free install');
    out.push(s.hasContract ? 'Contract' : 'No contract');
  }
  return out;
}

function shortHow(how: string): string {
  const h = how.toLowerCase();
  if (h.includes('autopay') || h.includes('checking')) return 'autopay';
  if (h.includes('debit')) return 'debit';
  if (h.includes('credit')) return 'credit card';
  if (h.includes('cash')) return 'cash';
  return how.split(/[,(]/)[0].trim().toLowerCase();
}

/** The lines the daily check shows: what Ana will tell customers today. */
export function offerSummary(s: TeammateSettings, day = today()): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const per = pricePer(s);
  if (per === 'none') {
    // an invitation: what, when and where
    const invite = s.facts['Your invitation'] ?? {};
    rows.push({ label: 'When', value: invite['Event or service, day and time']?.trim() || 'Not set' });
    rows.push({ label: 'Where', value: invite['Address']?.trim() || 'Not set' });
    return rows;
  }
  const unit = per === 'month' ? '/mo' : '';
  for (const plan of s.plans) {
    if (plan.priceOptions.length) {
      for (const o of plan.priceOptions) rows.push({ label: `${plan.name}, ${o.how}`, value: `${money(o.priceMonthly)}${unit}` });
    } else if (plan.priceMonthly > 0) {
      rows.push({ label: plan.name, value: `${money(plan.priceMonthly)}${unit}` });
    } else {
      rows.push({ label: plan.name, value: 'You quote it' });
    }
  }
  if (industryPack(s.industry).hasInstall) {
    rows.push({ label: 'Install', value: s.installationFee ? money(s.installationFee) : 'Free' });
    rows.push({ label: 'Contract', value: s.hasContract ? 'Yes' : 'None' });
  }
  const promos = activePromos(s, day);
  rows.push({ label: 'Promos', value: promos.length ? String(promos.length) : 'None' });
  return rows;
}

/** How many customer questions have an answer, out of how many. */
export function factsAnswered(s: TeammateSettings): { answered: number; total: number } {
  let answered = 0;
  let total = 0;
  for (const [topic, questions] of Object.entries(factTopics(s))) {
    for (const q of questions) {
      total += 1;
      if ((s.facts[topic]?.[q] ?? '').trim()) answered += 1;
    }
  }
  return { answered, total };
}

/** Ready to go out: a name, an opening line, and a price when the industry needs one. */
export function isReady(s: TeammateSettings): boolean {
  const pack = industryPack(s.industry);
  if (!s.repName.trim() || !s.pitch.trim()) return false;
  if (!pack.priceRequired) return true;
  const plan = s.plans[0];
  if (!plan) return false;
  return plan.priceOptions.length ? plan.priceOptions.every((o) => o.priceMonthly > 0) : plan.priceMonthly > 0;
}

/** The playbook Ana reads, in the agent's format (see teammate-agent/sample_playbook.json). */
export function toPlaybook(s: TeammateSettings): Record<string, unknown> {
  const per = pricePer(s);
  return {
    industry: s.industry,
    repName: s.repName.trim() || 'el representante',
    companyName: s.companyName.trim(),
    assistantName: s.assistantName.trim() || 'Ana',
    reviewedOn: s.reviewedOn,
    signupBy: s.signupBy,
    pitch: s.pitch.trim(),
    plans:
      per === 'none'
        ? []
        : s.plans.map((p) => {
            const options = p.priceOptions
              .filter((o) => o.how.trim() && o.priceMonthly > 0)
              .map((o) => ({ how: o.how.trim(), howEs: o.howEs.trim(), priceMonthly: o.priceMonthly }));
            const lowest = options.length ? Math.min(...options.map((o) => o.priceMonthly)) : p.priceMonthly;
            return {
              name: p.name.trim() || industryPack(s.industry).planName,
              speed: p.speed.trim(),
              priceMonthly: lowest > 0 ? lowest : null,
              per,
              features: [],
              priceOptions: options,
            };
          }),
    policies: industryPack(s.industry).hasInstall ? { hasContract: s.hasContract, installationFee: s.installationFee } : {},
    promos: s.promos
      .filter((p) => p.descriptionEs.trim())
      .map((p) => ({ descriptionEs: p.descriptionEs.trim(), description: p.description.trim(), ...(p.expiresAt ? { expiresAt: p.expiresAt } : {}) })),
    customPhrases: [],
    checkInReplies: s.checkInReplies.filter((r) => r.trim()),
    facts: s.facts,
  };
}
