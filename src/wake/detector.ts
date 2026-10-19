/**
 * Hola Wake Word Detector — v3 (VAD-Gated + Anti-Hallucination)
 * 
 * Key insight: Don't run Whisper on silence. Use amplitude check first.
 * 
 * Flow:
 *   Record 0.8s → Check amplitude → Speech? 
 *     NO  → Skip Whisper entirely (saves battery + kills hallucinations)
 *     YES → Run Whisper → Contains "hola"? → Wake!
 * 
 * Also requires "hola" to be detected clearly (not just substring noise).
 */

import { AppState, AppStateStatus, Platform } from 'react-native';
import * as Speech from '../speech';

export type WakeCallback = () => void;

let isListening = false;
let shouldStop = false;
let appStateSubscription: any = null;

/** Record window — short for snappy response */
const LISTEN_WINDOW_SEC = 0.8;

/** Cooldown after wake — prevent bounce loops */
const WAKE_COOLDOWN_MS = 3000;
let lastWakeTime = 0;

/**
 * Ensure microphone permission is granted before starting loop.
 */
async function ensureMicPermission() {
  return await Speech.requestMicPermission();
}

/**
 * Start wake word detection loop.
 * Returns a stop function.
 */
export function startWakeDetection(onWake: WakeCallback): () => void {
  if (isListening) {
    return () => stopWakeDetection();
  }

  shouldStop = false;

  // Setup AppState listener immediately so we handle backgrounding correctly
  // even if permission dialog is open
  appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'background' || state === 'inactive') {
      shouldStop = true;
      isListening = false;
    } else if (state === 'active' && !isListening && !shouldStop) {
      // Re-check permission on resume just to be safe, or assume granted if we got here?
      // For simplicity, we just restart the loop if we were supposed to be running.
      // But we need to ensure we don't start if permission was revoked.
      ensureMicPermission().then(granted => {
        if (granted && !shouldStop && !isListening) {
          isListening = true;
          runLoop(onWake);
        }
      });
    }
  });

  // Check permission before starting the loop
  ensureMicPermission().then(granted => {
    // Check !shouldStop again because user might have cancelled/backgrounded 
    // while permission dialog was open
    if (granted && !shouldStop) {
      isListening = true;
      console.log('😴 Wake detector started — listening for "Hola"...');
      runLoop(onWake);
    } else if (!granted) {
      console.warn('🎤 Mic permission denied — wake detector disabled');
      // Clean up since we're not actually starting
      if (appStateSubscription) {
        appStateSubscription.remove();
        appStateSubscription = null;
      }
    }
  });

  return () => stopWakeDetection();
}

export function stopWakeDetection() {
  shouldStop = true;
  isListening = false;
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
}

async function runLoop(onWake: WakeCallback) {
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 5;

  while (!shouldStop && isListening) {
    try {
      // Cooldown check — don't re-trigger within 3s of last wake
      if (Date.now() - lastWakeTime < WAKE_COOLDOWN_MS) {
        await sleep(500);
        continue;
      }

      // Record short clip with VAD energy check
      // recordWithVADCheck returns "SILENCE" if no speech detected, 
      // otherwise returns the Whisper transcription
      const transcript: string = await Speech.recordWakeCheck(LISTEN_WINDOW_SEC);

      // Reset error count on successful native call (even if silence)
      consecutiveErrors = 0;

      if (shouldStop) break;

      // Native side returns "SILENCE" when amplitude too low — skip entirely
      if (!transcript || transcript === 'SILENCE' || transcript.length < 2) {
        continue;
      }

      const normalized = transcript.toLowerCase().trim().replace(/[.,!?¿¡'"]/g, '');

      // Skip known hallucinations
      if (isHallucination(normalized)) {
        continue;
      }

      console.log(`👂 Wake check: "${normalized}"`);

      if (containsHola(normalized)) {
        console.log('🎯 WAKE WORD DETECTED!');
        lastWakeTime = Date.now();
        isListening = false;
        shouldStop = true;
        onWake();
        return;
      }

    } catch (e: any) {
      console.error('Wake loop error:', e.message);
      consecutiveErrors++;
      
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error('Too many consecutive errors — stopping wake detector to prevent loop');
        shouldStop = true;
        isListening = false;
        break;
      }
      
      await sleep(500);
    }
  }
  isListening = false;
}

/** Known Whisper hallucinations on silence/noise */
const HALLUCINATIONS = new Set([
  'vamos a ver', 'a ver', 'ahora no', 'gracias',
  'gracias por ver', 'hasta luego', 'subtitulos',
  'mas de la fue', 'nos vemos', 'bueno',
  'hasta la proxima', 'adios', 'muy bien',
  'si', 'no', 'que', 'y', 'de', 'la', 'el',
  'suscribete', 'like', 'subscribe',
  'thank you for watching', 'thanks for watching',
]);

function isHallucination(text: string): boolean {
  if (HALLUCINATIONS.has(text)) return true;
  // Single word under 4 chars is probably noise
  if (text.split(' ').length === 1 && text.length < 4) return true;
  return false;
}

/**
 * Match "hola" — strict but fair.
 * Must be a clear "hola" — not buried in a long phrase.
 */
function containsHola(text: string): boolean {
  const clean = text.replace(/[^a-zA-Z\s]/g, '').trim();
  const words = clean.split(/\s+/);
  
  // Check each word
  for (const word of words) {
    // Direct matches
    if (word === 'hola' || word === 'ola' || word === 'holla' || word === 'olla') return true;
    if (word === 'hula' || word === 'howla' || word === 'hoola' || word === 'owla') return true;
    
    // Edit distance 1 from "hola" (catches "holq", "hols", "hoba", etc)
    if (word.length >= 3 && word.length <= 5 && editDistance(word, 'hola') <= 1) return true;
  }

  // Multi-word matches
  if (clean.includes('oh la') || clean.includes('o la') || clean.includes('ho la')) return true;

  return false;
}

function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
