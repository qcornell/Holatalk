/**
 * Hola Voice Speaker — Routed TTS
 * 
 * Android: Custom RoutedTTS native module (Kotlin)
 * iOS: expo-speech (TTS) + AudioRouter native module (session routing only)
 *
 * v6 (2026-03-08): Clean separation of concerns:
 *   - AudioRouter.setOutputMode("speaker"|"ear") — configures AVAudioSession
 *   - expo-speech — does the actual speaking
 *   - AudioRouter is optional — if not available, expo-speech still works
 *     (just without routing control)
 *
 * Speaker mode: excludes BT options from session → iOS ignores Meta glasses
 * Ear mode: includes BT options → iOS routes to glasses
 * "Play loud" button: just calls setOutputMode("speaker") before speaking
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { RoutedTTS, AudioRouter } = NativeModules;

let ExpoSpeech: any = null;
let isInitialized = false;
let currentOnDone: (() => void) | null = null;
let speakerLock = false;

function getExpoSpeech() {
  if (ExpoSpeech) return ExpoSpeech;
  if (Platform.OS === 'ios') {
    try { ExpoSpeech = require('expo-speech'); } catch (e) {
      console.error('[speaker] FATAL: expo-speech not available:', e);
    }
  }
  return ExpoSpeech;
}

// ── Android event listener ──
if (Platform.OS === 'android' && RoutedTTS) {
  try {
    const emitter = new NativeEventEmitter(RoutedTTS);
    emitter.addListener('onTTSDone', () => {
      if (currentOnDone) { const cb = currentOnDone; currentOnDone = null; speakerLock = false; cb(); }
      else speakerLock = false;
    });
  } catch (e) {}
}

async function ensureInit(): Promise<void> {
  if (isInitialized) return;
  if (Platform.OS === 'ios') {
    getExpoSpeech();
    isInitialized = true;
    if (AudioRouter) {
      console.log('[speaker] iOS: expo-speech + AudioRouter ready');
      try {
        const route = await AudioRouter.getCurrentRoute();
        console.log('[speaker] iOS initial route:', JSON.stringify(route));
      } catch (e) {}
    } else {
      console.log('[speaker] iOS: expo-speech ready (AudioRouter not available — no routing control)');
    }
    return;
  }
  if (!RoutedTTS) return;
  try { isInitialized = await RoutedTTS.initialize(); } catch (e) {}
}

/**
 * iOS: Set audio output mode BEFORE speaking.
 * "speaker" = loud, no bluetooth
 * "ear" = bluetooth/earpiece (Meta glasses)
 */
async function setOutputMode(mode: 'speaker' | 'ear'): Promise<void> {
  if (!AudioRouter) {
    console.log(`[speaker] iOS: AudioRouter not available — skipping setOutputMode(${mode})`);
    return;
  }
  try {
    await AudioRouter.setOutputMode(mode);
    console.log(`[speaker] iOS: setOutputMode(${mode}) OK`);
    // Log actual route after setting mode
    try {
      const route = await AudioRouter.getCurrentRoute();
      console.log(`[speaker] iOS: route after ${mode}:`, JSON.stringify(route));
    } catch (e) {}
  } catch (e: any) {
    console.error(`[speaker] iOS: setOutputMode(${mode}) failed:`, e?.message);
  }
}

/**
 * iOS: Speak with expo-speech after setting the audio route.
 */
async function iosSpeak(
  text: string, language: string, rate: number,
  mode: 'speaker' | 'ear',
  onDone?: () => void
): Promise<void> {
  const Speech = getExpoSpeech();
  if (!Speech) {
    console.error('[speaker] iOS: expo-speech not available');
    onDone?.();
    return;
  }

  // Step 1: Configure audio route BEFORE speaking
  await setOutputMode(mode);

  // Step 2: Small delay for session to settle
  await new Promise(r => setTimeout(r, 80));

  console.log(`[speaker] iOS ${mode}: "${text.substring(0, 50)}..." lang=${language}`);

  // Step 3: Speak
  return new Promise<void>((resolve) => {
    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      resolve();
      onDone?.();
    };

    const timeout = setTimeout(() => {
      if (!resolved) {
        console.warn('[speaker] iOS: speech timeout 30s');
        finish();
      }
    }, 30000);

    try {
      Speech.speak(text, {
        language,
        rate: Math.max(0.5, Math.min(rate, 1.5)),
        pitch: 1.0,
        volume: 1.0,
        onStart: () => {
          console.log(`[speaker] iOS: TTS started (${mode})`);
          // Re-assert speaker override right when speech starts
          if (mode === 'speaker' && AudioRouter) {
            AudioRouter.setOutputMode('speaker').catch(() => {});
          }
        },
        onDone: () => {
          console.log(`[speaker] iOS: TTS done (${mode})`);
          clearTimeout(timeout);
          finish();
        },
        onStopped: () => {
          clearTimeout(timeout);
          finish();
        },
        onError: (e: any) => {
          console.error('[speaker] iOS: TTS error:', e);
          clearTimeout(timeout);
          finish();
        },
      });
    } catch (e: any) {
      console.error('[speaker] iOS: Speech.speak() threw:', e?.message);
      clearTimeout(timeout);
      finish();
    }
  });
}

// ═══════════════════════════
// PUBLIC API
// ═══════════════════════════

export async function speakSpanishLoud(text: string, onDone?: () => void): Promise<void> {
  await ensureInit();
  if (Platform.OS === 'ios') {
    stopSpeaking();
    await iosSpeak(text, 'es-MX', 0.93, 'speaker', onDone);
    return;
  }
  speakerLock = true; currentOnDone = null;
  if (RoutedTTS) await RoutedTTS.stop().catch(() => {});
  currentOnDone = onDone || null;
  try { await RoutedTTS.speakOnSpeaker(text, 'es-US', 0.93); }
  catch (e: any) { speakerLock = false; currentOnDone = null; onDone?.(); }
}

export async function speakSpanishPrivate(text: string, onDone?: () => void): Promise<void> {
  await ensureInit();
  stopSpeaking();
  if (Platform.OS === 'ios') {
    await iosSpeak(text, 'es-MX', 0.93, 'ear', onDone);
    return;
  }
  currentOnDone = onDone || null;
  try { await RoutedTTS.speakOnBluetooth(text, 'es-US', 0.93); }
  catch (e: any) { currentOnDone = null; onDone?.(); }
}

export async function speakEnglishLoud(text: string, onDone?: () => void): Promise<void> {
  await ensureInit();
  if (Platform.OS === 'ios') {
    stopSpeaking();
    await iosSpeak(text, 'en-US', 1.0, 'speaker', onDone);
    return;
  }
  speakerLock = true; currentOnDone = null;
  if (RoutedTTS) await RoutedTTS.stop().catch(() => {});
  currentOnDone = onDone || null;
  try { await RoutedTTS.speakOnSpeaker(text, 'en-US', 1.0); }
  catch (e: any) { speakerLock = false; currentOnDone = null; onDone?.(); }
}

export async function speakEnglishPrivate(text: string, onDone?: () => void): Promise<void> {
  await ensureInit();
  stopSpeaking();
  if (Platform.OS === 'ios') {
    await iosSpeak(text, 'en-US', 1.0, 'ear', onDone);
    return;
  }
  currentOnDone = onDone || null;
  try { await RoutedTTS.speakOnBluetooth(text, 'en-US', 1.0); }
  catch (e: any) { currentOnDone = null; onDone?.(); }
}

// ─── Aliases ───
export function speakSpanish(text: string, onDone?: () => void): void { speakSpanishLoud(text, onDone); }
export function speakEnglish(text: string, onDone?: () => void): void { speakEnglishLoud(text, onDone); }
export function speakGreeting(repName: string, company: string, onDone?: () => void): void {
  speakSpanishLoud(`Hola, soy ${repName} de ${company}.`, onDone);
}
export function speakCoachResponse(spanishText: string, onDone?: () => void): void {
  speakSpanishLoud(spanishText, onDone);
}

export function stopSpeaking(): void {
  currentOnDone = null; speakerLock = false;
  if (Platform.OS === 'ios') {
    const Speech = getExpoSpeech();
    if (Speech) Speech.stop();
    return;
  }
  if (RoutedTTS) RoutedTTS.stop().catch(() => {});
}

export async function isSpeaking(): Promise<boolean> {
  if (Platform.OS === 'ios') {
    const Speech = getExpoSpeech();
    if (Speech) return await Speech.isSpeakingAsync();
    return false;
  }
  if (!RoutedTTS) return false;
  try { return await RoutedTTS.isSpeaking(); } catch { return false; }
}

export async function listVoices(): Promise<void> {
  if (Platform.OS === 'ios') {
    try {
      const Speech = getExpoSpeech();
      if (!Speech) return;
      const voices = await Speech.getAvailableVoicesAsync();
      const es = voices.filter((v: any) => v.language.startsWith('es'));
      console.log(`🗣️ Spanish voices (${es.length}):`);
      es.forEach((v: any) => console.log(`  ${v.identifier} — ${v.name}`));
    } catch (e) {}
  }
}

export { checkBluetooth, isBluetoothAvailable } from './audioRouter';
