/**
 * Hola Intent Detection Engine — Types
 * 
 * Three alert levels:
 * 🟢 CLOSE_NOW  — Customer is ready to buy, shut up and close
 * 🟡 HOT_LEAD   — Customer is frustrated/interested, push harder  
 * 🔴 OBJECTION  — Customer pushing back, need coached rebuttal
 * 🔵 INFO       — Customer asking a question, provide answer
 * ⚪ NEUTRAL    — General conversation, just translate
 */

export type AlertLevel = 'CLOSE_NOW' | 'HOT_LEAD' | 'OBJECTION' | 'INFO' | 'NEUTRAL';

export interface Intent {
  id: string;
  name: string;
  alert: AlertLevel;
  /** Exact phrases that trigger this intent (lowercase, trimmed) */
  phrases: string[];
  /** Keyword fragments that partially match (for fuzzy/substring) */
  keywords: string[];
  /** Spanglish hybrid phrases */
  spanglish: string[];
  /** What to whisper to the rep in English */
  coachEn: string;
  /** Suggested response in Spanish for the rep to repeat */
  coachEs: string;
}

export interface DetectionResult {
  intent: Intent | null;
  confidence: 'exact' | 'phrase' | 'spanglish' | 'keyword' | 'none';
  alert: AlertLevel;
  /** ms it took to detect */
  latencyMs: number;
  /** The matched phrase/keyword that triggered it */
  matchedOn: string;
}
