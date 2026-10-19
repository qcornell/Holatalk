/**
 * Whisper Hallucination Filter
 * 
 * Whisper hallucinates specific phrases on silence/ambient noise.
 * These are well-documented patterns — filter them before they
 * hit the conversation engine.
 */

const HALLUCINATIONS = new Set([
  // Spanish hallucinations (Whisper's most common phantom outputs)
  'vamos a ver',
  '¡vamos a ver!',
  'a ver',
  'ahora no',
  'gracias',
  'gracias por ver',
  'gracias por ver el video',
  'hasta luego',
  'subtitulos',
  'subtítulos',
  'subtitulos realizados por la comunidad de amara org',
  'mas de la fue',
  'más de la fue',
  'nos vemos',
  // 'bueno' removed — valid customer response
  'hasta la proxima',
  'hasta la próxima',
  'adios',
  'adiós',
  'muy bien',
  'suscribete',
  'suscríbete',
  'que',
  'de',
  'la',
  'el',
  'y',
  'un',
  'es',
  'en',
  'lo',
  'por',
  'con',
  'se',
  'al',
  'del',
  'las',
  'los',
  'una',
  // 'no' removed — valid customer response
  'ya',
  'me',
  'te',
  'le',
  'su',
  // 'si' removed — valid YES from customer
  'como',
  'mas',
  'pero',
  'para',
  'esta',
  'fue',
  'esto',
  // English hallucinations
  'thank you for watching',
  'thanks for watching',
  'like and subscribe',
  'please subscribe',
  'subscribe',
  'like',
  'you',
  'the',
  'thank you',
  'thanks',
  'bye',
  'goodbye',
  'okay',
  'hmm',
  'um',
  'uh',
  'so',
  'oh',
  'ah',
  // 'yeah', 'yes', 'no' removed — valid responses for both mics
  'i',
  'a',
  // Music/sound markers
  '♪',
  '♫',
  '...',
  '',
]);

/**
 * Returns true if the transcription is likely a hallucination.
 * Filter these BEFORE feeding into the conversation engine.
 */
export function isHallucination(text: string): boolean {
  if (!text || text.trim().length === 0) return true;

  const clean = text
    .toLowerCase()
    .trim()
    .replace(/[.,!?¿¡'"♪♫\[\]()]/g, '')
    .trim();

  // Empty after cleaning
  if (clean.length === 0) return true;

  // Exact match against known hallucinations
  if (HALLUCINATIONS.has(clean)) return true;

  // Single word under 2 chars = probably noise (but 'si', 'no' are valid — 2 chars)
  const words = clean.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 1 && clean.length < 2) return true;

  // Repeated single word (e.g. "si si si si" from noise)
  if (words.length >= 3 && new Set(words).size === 1) return true;

  // Contains "[BLANK_AUDIO]" or similar Whisper markers
  if (text.includes('[BLANK_AUDIO]') || text.includes('[MUSIC]') || text.includes('[SILENCE]')) return true;

  // Whisper sometimes outputs timestamps
  if (/^\d{2}:\d{2}/.test(clean)) return true;

  // Common Whisper patterns: "Subtítulos realizados por..." / "Amara.org" / YouTube-style credits
  if (clean.includes('amara') || clean.includes('subtitulos realizados') || clean.includes('subtítulos realizados')) return true;

  // All words are 2 chars or fewer AND all are letters (not numbers) = noise fragments
  const allShortLetters = words.every(w => w.length <= 2 && !/\d/.test(w));
  if (allShortLetters && words.length <= 5) return true;

  // Repeated phrases like "Gracias. Gracias. Gracias." — but not numbers
  if (words.length >= 4 && !/\d/.test(clean)) {
    const uniq = new Set(words);
    if (uniq.size <= 2) return true;
  }

  return false;
}
