import { INTENTS } from './corpus';
import { Intent, DetectionResult, AlertLevel } from './types';

/**
 * Hola Intent Detection Engine
 * 
 * 4-layer detection (fastest first):
 *   Layer 1: Exact phrase match     (<1ms)
 *   Layer 2: Phrase substring match (~1ms)
 *   Layer 3: Spanglish match        (~1ms)
 *   Layer 4: Keyword match          (~2ms)
 * 
 * All layers run in-memory, no network calls.
 */

// Pre-build lookup maps at import time for O(1) exact matches
const exactMap = new Map<string, Intent>();
const spanglishMap = new Map<string, Intent>();

for (const intent of INTENTS) {
  for (const phrase of intent.phrases) {
    exactMap.set(normalize(phrase), intent);
  }
  for (const phrase of intent.spanglish) {
    spanglishMap.set(normalize(phrase), intent);
  }
}

/** Normalize text: lowercase, trim, collapse whitespace, strip ¿¡!? punctuation */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[¿¡!?.,;:'"()]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Detect intent from transcribed text.
 * Returns the best match with confidence level and coaching.
 */
export function detectIntent(rawText: string): DetectionResult {
  const start = Date.now();
  const text = normalize(rawText);

  if (!text || text.length < 2) {
    return noMatch(start);
  }

  // ─── Layer 1: Exact phrase match (O(1) hash lookup) ───
  const exactHit = exactMap.get(text);
  if (exactHit) {
    return hit(exactHit, 'exact', text, start);
  }

  // ─── Layer 2: Phrase substring match ───
  // Check if any known phrase is contained within the spoken text
  for (const intent of INTENTS) {
    for (const phrase of intent.phrases) {
      const normPhrase = normalize(phrase);
      if (text.includes(normPhrase) && normPhrase.length >= 4) {
        return hit(intent, 'phrase', normPhrase, start);
      }
    }
  }

  // ─── Layer 3: Spanglish match ───
  const spanglishHit = spanglishMap.get(text);
  if (spanglishHit) {
    return hit(spanglishHit, 'spanglish', text, start);
  }
  // Substring spanglish
  for (const intent of INTENTS) {
    for (const phrase of intent.spanglish) {
      const normPhrase = normalize(phrase);
      if (text.includes(normPhrase) && normPhrase.length >= 4) {
        return hit(intent, 'spanglish', normPhrase, start);
      }
    }
  }

  // ─── Layer 4: Keyword match (broadest, last resort) ───
  let bestKeywordIntent: Intent | null = null;
  let bestKeywordMatch = '';
  let bestKeywordLen = 0;

  for (const intent of INTENTS) {
    for (const keyword of intent.keywords) {
      const normKw = normalize(keyword);
      if (text.includes(normKw) && normKw.length > bestKeywordLen) {
        bestKeywordIntent = intent;
        bestKeywordMatch = normKw;
        bestKeywordLen = normKw.length;
      }
    }
  }

  if (bestKeywordIntent) {
    return hit(bestKeywordIntent, 'keyword', bestKeywordMatch, start);
  }

  // ─── No match — fall through to basic translation ───
  return noMatch(start);
}

function hit(
  intent: Intent,
  confidence: DetectionResult['confidence'],
  matchedOn: string,
  startMs: number
): DetectionResult {
  return {
    intent,
    confidence,
    alert: intent.alert,
    latencyMs: Date.now() - startMs,
    matchedOn,
  };
}

function noMatch(startMs: number): DetectionResult {
  return {
    intent: null,
    confidence: 'none',
    alert: 'NEUTRAL',
    latencyMs: Date.now() - startMs,
    matchedOn: '',
  };
}

/**
 * Check if text starts with the wake word "Hola"
 */
export function isWakeWord(rawText: string): boolean {
  const text = normalize(rawText);
  return text.startsWith('hola') || text === 'ola';
}
