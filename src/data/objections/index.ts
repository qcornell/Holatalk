/**
 * 📁 Objections Library — Loaded from JSON files
 * 
 * Each JSON file contains an array of objections for a category.
 * JSON structure per objection:
 *   id, category, triggers_es[], spanglish[], meaning_en,
 *   coaching_en, responses_es[], exit_now (bool), max_attempts (int)
 */

// Import JSON files
import brushOffData from './brush_off.json';
import priceData from './price.json';
import spouseData from './spouse_decision.json';
import installData from './install.json';
import trustData from './trust_scam.json';
import contractData from './contract.json';
import creditData from './credit_id.json';
import switchingData from './switching.json';

export interface ObjectionJSON {
  id: string;
  category: string;
  triggers_es: string[];
  spanglish: string[];
  meaning_en: string;
  coaching_en: string;
  responses_es: string[];
  exit_now: boolean;
  max_attempts: number;
}

/** Legacy interface kept for backward compat with conversation engine */
export interface Objection {
  id: string;
  category: string;
  triggers: string[];
  spanglish: string[];
  meaningEn: string;
  overcomeEn: string;
  overcomeEs: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'walk_away';
  exitNow: boolean;
  maxAttempts: number;
  allResponsesEs: string[];
}

/** Convert JSON format → legacy Objection */
function fromJSON(obj: ObjectionJSON): Objection {
  const difficulty: Objection['difficulty'] = obj.exit_now
    ? 'walk_away'
    : obj.max_attempts <= 1
    ? 'easy'
    : obj.max_attempts === 2
    ? 'medium'
    : 'hard';

  return {
    id: obj.id,
    category: obj.category,
    triggers: obj.triggers_es,
    spanglish: obj.spanglish,
    meaningEn: obj.meaning_en,
    overcomeEn: obj.coaching_en,
    overcomeEs: obj.responses_es[0] || '',
    difficulty,
    exitNow: obj.exit_now,
    maxAttempts: obj.max_attempts,
    allResponsesEs: obj.responses_es,
  };
}

// Build master list from all JSON files
const ALL_JSON: ObjectionJSON[] = [
  ...(brushOffData as ObjectionJSON[]),
  ...(priceData as ObjectionJSON[]),
  ...(spouseData as ObjectionJSON[]),
  ...(installData as ObjectionJSON[]),
  ...(trustData as ObjectionJSON[]),
  ...(contractData as ObjectionJSON[]),
  ...(creditData as ObjectionJSON[]),
  ...(switchingData as ObjectionJSON[]),
];

export const OBJECTIONS: Objection[] = ALL_JSON.map(fromJSON);

/** Look up objection by matching customer phrase */
export function findObjection(text: string): Objection | null {
  const lower = text.toLowerCase().trim();
  
  for (const obj of OBJECTIONS) {
    for (const trigger of obj.triggers) {
      if (lower.includes(trigger.toLowerCase())) return obj;
    }
    for (const sp of obj.spanglish) {
      if (lower.includes(sp.toLowerCase())) return obj;
    }
  }
  return null;
}
