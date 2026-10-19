/**
 * Hola Rep Memory System
 * 
 * Each rep gets a local memory store that learns over time.
 * Inspired by OpenClaw's memory/ folder approach.
 */

export interface RepMemory {
  /** Rep profile */
  profile: {
    name: string;
    company: string;
    territory: string;          // "Houston North", "Dallas West"
    preferredLanguage: 'en' | 'es' | 'bilingual';
    startDate: string;          // when they started using the app
  };

  /** Company config (the 10% customization) */
  config: {
    plans: PlanMemory[];
    policies: PolicyMemory;
    promos: PromoMemory[];
    customResponses: CustomResponse[];
  };

  /** Learned patterns from real interactions */
  patterns: {
    /** Most common objections this rep encounters (ranked) */
    topObjections: RankedPhrase[];
    /** Most common buying signals this rep gets */
    topBuyingSignals: RankedPhrase[];
    /** Phrases the rep says that work well (high close rate after) */
    winningPhrases: RankedPhrase[];
    /** Phrases that didn't match any intent — candidates for new intents */
    unmatchedPhrases: UnmatchedPhrase[];
  };

  /** Session stats */
  stats: {
    totalDoors: number;
    totalSales: number;
    closeRate: number;          // auto-calculated
    avgTimePerDoor: number;     // seconds
    bestHour: string;           // "10:00 AM" — when close rate is highest
    bestDay: string;            // "Tuesday"
    streakCurrent: number;      // consecutive sales
    streakBest: number;
  };

  /** Daily logs (like memory/YYYY-MM-DD.md) */
  dailyLogs: DailyLog[];
}

export interface PlanMemory {
  name: string;
  speed: string;
  priceMonthly: number;
  features: string[];
  /** Which plan this rep sells most — auto-learned */
  timesOffered: number;
  timesClosed: number;
}

export interface PolicyMemory {
  hasContract: boolean;
  contractLength?: string;
  earlyTerminationFee?: number;
  creditCheck: boolean;
  acceptedIds: string[];
  installationFee: number;
  /** Custom policy notes the rep adds over time */
  notes: string[];
}

export interface PromoMemory {
  description: string;
  descriptionEs: string;
  expiresAt?: string;
  /** Track if this promo actually helps close */
  timesMentioned: number;
  timesClosedAfter: number;
}

export interface CustomResponse {
  /** What triggers it (Spanish phrase or keyword) */
  trigger: string;
  /** English coaching for rep */
  responseEn: string;
  /** Spanish script */
  responseEs: string;
  /** Where it came from */
  source: 'manual' | 'learned' | 'document_upload';
  /** How often it's been used */
  timesUsed: number;
}

export interface RankedPhrase {
  phrase: string;
  count: number;
  lastHeard: string;           // ISO date
  intentId?: string;
}

export interface UnmatchedPhrase {
  phrase: string;
  count: number;
  lastHeard: string;
  /** If we eventually figure out what it means */
  resolvedIntent?: string;
}

export interface DailyLog {
  date: string;                // YYYY-MM-DD
  doorsKnocked: number;
  sales: number;
  topObjection: string;
  notes: string;               // auto-generated summary
  /** Individual interaction snapshots */
  interactions: InteractionLog[];
}

export interface InteractionLog {
  timestamp: string;
  /** What customer said (transcription) */
  customerSaid: string;
  /** What intent was detected */
  intentDetected: string | null;
  /** What the app coached */
  coachResponse: string;
  /** Did this door result in a sale? */
  outcome: 'sale' | 'callback' | 'rejected' | 'no_answer' | null;
  /** Duration of interaction in seconds */
  durationSec: number;
}
