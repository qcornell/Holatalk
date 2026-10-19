/**
 * Translation module using Supabase Edge Function (proxies to OpenAI GPT-4o-mini).
 * Whisper handles STT (on-device), this handles the translation (server-side).
 *
 * Customer mic: Spanish → English
 * Rep mic: English → Spanish
 */

// ✅ Your deployed Supabase Edge Function URL
const SUPABASE_FUNCTION_URL =
  "https://bozoiqestwopczjaxnlu.supabase.co/functions/v1/translate";

export type TranslateDirection = "es_to_en" | "en_to_es";

interface TranslateResult {
  ok: boolean;
  translated: string;
  original: string;
  direction: TranslateDirection;
  latencyMs: number;
}

/**
 * Quick connectivity check — tries to reach Google's generate_204 endpoint.
 * Returns false if the device appears to be offline (no Wi-Fi / no data).
 */
async function isOnline(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    await fetch('https://clients3.google.com/generate_204', {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return true;
  } catch {
    return false;
  }
}

/**
 * Translate text using Supabase Edge Function
 */
export async function translate(
  text: string,
  direction: TranslateDirection
): Promise<TranslateResult> {
  const start = Date.now();
  const original = text.trim();

  console.log("[translate] provider=supabase_edge_function");

  if (!original) {
    return {
      ok: false,
      translated: "",
      original,
      direction,
      latencyMs: 0,
    };
  }

  // Check connectivity before calling the edge function
  const online = await isOnline();
  if (!online) {
    console.warn("[translate] Device appears offline — skipping API call");
    return {
      ok: false,
      translated: "⚠️ Sin conexión / Offline",
      original,
      direction,
      latencyMs: Date.now() - start,
    };
  }

  try {
    const response = await fetch(SUPABASE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: original,
        direction, // matches your edge function
      }),
    });

    // Retry once on 502 (Supabase cold start / gateway hiccup)
    if (response.status === 502) {
      console.warn("[translate] Got 502 — retrying once after 500ms...");
      await new Promise(r => setTimeout(r, 500));
      const retry = await fetch(SUPABASE_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: original, direction }),
      });
      if (retry.ok) {
        const data = await retry.json();
        const translated = data.translated || original;
        const latencyMs = Date.now() - start;
        console.log(`[translate] ${direction} (retry): "${original}" → "${translated}" (${latencyMs}ms)`);
        return { ok: true, translated, original, direction, latencyMs };
      }
      console.error("[translate] Retry also failed:", retry.status);
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error("[translate] Supabase error:", response.status, errText);

      return {
        ok: false,
        translated: original,
        original,
        direction,
        latencyMs: Date.now() - start,
      };
    }

    const data = await response.json();
    const translated = data.translated || original;

    const latencyMs = Date.now() - start;

    console.log(
      `[translate] ${direction}: "${original}" → "${translated}" (${latencyMs}ms)`
    );

    return {
      ok: true,
      translated,
      original,
      direction,
      latencyMs,
    };
  } catch (e: any) {
    console.error("[translate] Error:", e?.message || e);

    return {
      ok: false,
      translated: original,
      original,
      direction,
      latencyMs: Date.now() - start,
    };
  }
}

/**
 * Pre-warm the Supabase Edge Function to avoid cold start latency.
 * Call this once at app startup — fire and forget.
 */
export function warmupTranslation(): void {
  console.log("[translate] Warming up edge function...");
  fetch(SUPABASE_FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "warmup", direction: "es_to_en" }),
  })
    .then((res) => {
      if (res.ok) console.log("[translate] Edge function warmed up ✅");
      else console.warn("[translate] Warmup returned status:", res.status);
    })
    .catch(() => {
      console.warn("[translate] Warmup failed (will retry on first real call)");
    });
}

/**
 * Spanish → English
 */
export function translateSpanishToEnglish(
  text: string
): Promise<TranslateResult> {
  return translate(text, "es_to_en");
}

/**
 * English → Spanish
 */
export function translateEnglishToSpanish(
  text: string
): Promise<TranslateResult> {
  return translate(text, "en_to_es");
}
