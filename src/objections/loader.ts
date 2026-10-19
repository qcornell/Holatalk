/**
 * Objection JSON loader
 * Reads JSON files from /objections/ folder.
 */

export interface ObjectionData {
  intent: string;
  spanish_variations: string[];
  rep_response_chunks_es: string[];
  rep_response_en_summary: string;
  is_hard_stop: boolean;
  max_attempts: number;
}

// In production, these would be dynamically loaded.
// For now, we'll hardcode the imports.
const objections: ObjectionData[] = [
  require('../data/objections-data/price.json'),
  require('../data/objections-data/contract.json'),
  require('../data/objections-data/install.json'),
  require('../data/objections-data/trust_scam.json'),
  require('../data/objections-data/decision_maker.json'),
  require('../data/objections-data/already_have_internet.json'),
  require('../data/objections-data/renter_owner.json'),
];

/**
 * Match customer input to an objection.
 */
export function matchObjection(input: string): ObjectionData | null {
  const normalized = input.toLowerCase().trim();

  for (const obj of objections) {
    for (const variation of obj.spanish_variations) {
      if (normalized.includes(variation.toLowerCase())) {
        return obj;
      }
    }
  }

  return null;
}

/**
 * Build full Spanish response from chunks.
 */
export function buildResponse(objection: ObjectionData): string {
  return objection.rep_response_chunks_es.join(' ');
}

export function getAllObjections(): ObjectionData[] {
  return objections;
}
