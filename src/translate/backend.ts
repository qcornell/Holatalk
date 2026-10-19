/**
 * Backend proxy translation (via hola.talk API)
 * Hides OpenAI key on server side, users don't need their own API key.
 */

const API_URL = 'https://hola.talk/api/translate';

export type TranslateDirection = 'es_to_en' | 'en_to_es';

interface TranslateResult {
  ok: boolean;
  translated: string;
  original: string;
  direction: TranslateDirection;
  latencyMs: number;
}

/**
 * Translate via backend proxy (secure, no client-side API key).
 */
export async function translateViaServer(
  text: string,
  direction: TranslateDirection,
): Promise<TranslateResult> {
  const start = Date.now();
  const original = text.trim();

  console.log('[translate] provider=backend_proxy apiKeyPresent=false (server-side)');

  if (!original || original.length === 0) {
    return { ok: false, translated: '', original, direction, latencyMs: 0 };
  }

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: original,
        direction,
      }),
    });

    if (!response.ok) {
      console.error('[translate] Backend error:', response.status, await response.text());
      return { ok: false, translated: original, original, direction, latencyMs: Date.now() - start };
    }

    const data = await response.json();
    const translated = data.translated || original;
    const latencyMs = Date.now() - start;

    console.log(`[translate] ${direction}: "${original}" → "${translated}" (${latencyMs}ms)`);

    return { ok: true, translated, original, direction, latencyMs };
  } catch (e: any) {
    console.error('[translate] Error:', e.message || e);
    return { ok: false, translated: original, original, direction, latencyMs: Date.now() - start };
  }
}

/**
 * Translate Spanish → English
 */
export function translateSpanishToEnglish(text: string): Promise<TranslateResult> {
  return translateViaServer(text, 'es_to_en');
}

/**
 * Translate English → Spanish
 */
export function translateEnglishToSpanish(text: string): Promise<TranslateResult> {
  return translateViaServer(text, 'en_to_es');
}
