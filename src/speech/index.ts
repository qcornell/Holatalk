/**
 * Cross-platform Speech Abstraction
 * 
 * Android: Custom GlassesModule (Kotlin + whisper.cpp JNI)
 * iOS: whisper.rn (STT) + NativeModules.RNWhisper for audio session control
 */

import { Platform, NativeModules, PermissionsAndroid, Image } from 'react-native';

const { GlassesModule } = NativeModules;

let whisperContext: any = null;
let whisperReady = false;
let androidReady = false;
let activeStopFn: (() => Promise<void>) | null = null;
let isCapturing = false;

// RNWhisper native module — accessed lazily after whisper.rn is loaded
function getRNWhisper() {
  return NativeModules.RNWhisper || null;
}

export async function requestMicPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      { title: 'Microphone Permission', message: 'Hola D2D needs mic access.', buttonPositive: 'OK' }
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  }
  return true;
}

export async function preloadModel(): Promise<string> {
  if (Platform.OS === 'android') {
    if (!GlassesModule) throw new Error('GlassesModule not available');
    const result = await GlassesModule.preloadModel();
    androidReady = true;
    return result;
  }
  // iOS: use whisper.rn
  try {
    let whisperRn: any;
    try {
      whisperRn = require('whisper.rn');
    } catch (importErr: any) {
      throw new Error('whisper.rn import failed: ' + (importErr?.message || 'unknown'));
    }
    console.log('[speech/ios] whisper.rn loaded, initWhisper:', typeof whisperRn.initWhisper);
    if (typeof whisperRn.initWhisper !== 'function') {
      throw new Error('initWhisper is not a function — whisper.rn native module not linked');
    }

    const { File, Paths } = require('expo-file-system');
    const { Asset } = require('expo-asset');

    // Step 1: Download asset to expo cache
    console.log('[speech/ios] Downloading asset...');
    const asset = Asset.fromModule(require('../../assets/ggml-tiny.bin'));
    await asset.downloadAsync();
    console.log('[speech/ios] asset.uri:', asset.uri);
    console.log('[speech/ios] asset.localUri:', asset.localUri);
    console.log('[speech/ios] asset.downloaded:', asset.downloaded);

    if (!asset.localUri) {
      throw new Error('Asset downloaded but localUri is null');
    }

    // Step 2: Copy to a clean, stable path in Documents
    const destFile = new File(Paths.document, 'ggml-tiny.bin');
    console.log('[speech/ios] dest uri:', destFile.uri);
    console.log('[speech/ios] dest exists:', destFile.exists);

    if (!destFile.exists) {
      console.log('[speech/ios] Copying model to Documents...');
      const srcFile = new File(asset.localUri);
      console.log('[speech/ios] src exists:', srcFile.exists, 'src size:', srcFile.size);
      srcFile.copy(destFile);
      console.log('[speech/ios] After copy — exists:', destFile.exists, 'size:', destFile.size);
      if (!destFile.exists) {
        throw new Error('Copy failed — dest does not exist after copy');
      }
      if (destFile.size != null && destFile.size < 1000000) {
        throw new Error('Copied file too small: ' + destFile.size);
      }
    } else {
      console.log('[speech/ios] Model already at dest, size:', destFile.size);
    }

    // Step 3: Get clean native path from file URI
    const fileUri = destFile.uri;
    const modelPath = fileUri.startsWith('file://') ? fileUri.slice(7) : fileUri;
    console.log('[speech/ios] Final model path:', modelPath);
    console.log('[speech/ios] Calling initWhisper (GPU=off, CoreML=off)...');

    whisperContext = await whisperRn.initWhisper({
      filePath: modelPath,
      useGpu: false,
      useCoreMLIos: false,
    });
    whisperReady = true;
    console.log('[speech/ios] ✅ Whisper ready! GPU:', whisperContext?.gpu);
    return 'OK';
  } catch (e: any) {
    const msg = e?.message || 'unknown error';
    console.error('[speech/ios] INIT FAILED:', msg);
    whisperReady = false;
    throw new Error('Whisper init: ' + msg);
  }
}

export async function stopCapture(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  if (activeStopFn) {
    try { await activeStopFn(); } catch (e) {}
    activeStopFn = null;
  }
  isCapturing = false;
  await sleep(200);
}

export async function recordAndTranscribe(max: number): Promise<string> {
  if (Platform.OS === 'android') return await GlassesModule.recordAndTranscribe(max);
  return await iosRecordAndTranscribe(max, 'es');
}

export async function recordAndTranscribeForMic(max: number, micMode: string): Promise<string> {
  if (Platform.OS === 'android') return await GlassesModule.recordAndTranscribeForMic(max, micMode);
  return await iosRecordAndTranscribe(max, micMode === 'customer' ? 'es' : 'en');
}

export async function recordWakeCheck(dur: number): Promise<string> {
  if (Platform.OS === 'android') return await GlassesModule.recordWakeCheck(dur);
  return await iosRecordAndTranscribe(dur, 'es');
}

export async function ping(): Promise<string> {
  if (Platform.OS === 'android') return GlassesModule ? await GlassesModule.ping() : 'unavailable';
  return whisperReady ? 'pong' : 'not ready';
}

export function isReady(): boolean {
  if (Platform.OS === 'android') return !!GlassesModule && androidReady;
  return whisperReady;
}

/** Diagnostic string for debugging speech init failures */
export function diagnose(): string {
  if (Platform.OS === 'android') {
    return `Android: GlassesModule=${!!GlassesModule}, androidReady=${androidReady}`;
  }
  const rn = getRNWhisper();
  let whisperRnAvail = false;
  let initWhisperType = 'missing';
  let assetInfo = 'unknown';
  try {
    const w = require('whisper.rn');
    whisperRnAvail = true;
    initWhisperType = typeof w.initWhisper;
  } catch (e) {}
  try {
    const a = require('../../assets/ggml-tiny.bin');
    const src = Image.resolveAssetSource(a);
    assetInfo = `id=${a},uri=${src?.uri?.substring(0, 80) || 'null'}`;
  } catch (e) {
    assetInfo = 'require failed';
  }
  return `iOS: ready=${whisperReady}, RNWhisper=${!!rn}, pkg=${whisperRnAvail}, init=${initWhisperType}, ctx=${!!whisperContext}, asset=${assetInfo}`;
}

/**
 * iOS: Force LOUD SPEAKER for non-TTS audio.
 * 
 * NOTE: This is only used for non-TTS audio routing (e.g., playing back audio).
 * For TTS, speaker.ts calls AudioRouter.speakOnSpeaker() which owns both the
 * AVAudioSession and AVSpeechSynthesizer so the speaker override stays active.
 * 
 * Uses AudioRouter.routeToSpeaker() when available (preferred — consistent session config),
 * falls back to RNWhisper if AudioRouter not present.
 */
export async function setAudioLoudSpeaker(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  // Prefer AudioRouter for consistent session management
  const { AudioRouter } = NativeModules;
  if (AudioRouter) {
    try {
      await AudioRouter.routeToSpeaker();
      console.log('[speech/ios] → LOUD SPEAKER (AudioRouter)');
      return;
    } catch (e: any) {
      console.warn('[speech/ios] AudioRouter.routeToSpeaker fallthrough:', e?.message);
    }
  }
  // Fallback to RNWhisper
  try {
    const rn = getRNWhisper();
    if (rn) {
      await rn.setAudioSessionCategory('Playback', []);
      await rn.setAudioSessionActive(true);
      console.log('[speech/ios] → LOUD SPEAKER (RNWhisper Playback fallback)');
    }
  } catch (e: any) {
    console.warn('[speech/ios] setAudioLoudSpeaker error:', e?.message);
  }
}

/**
 * iOS: Route to earpiece/bluetooth for private listening (Meta Glasses).
 * 
 * Uses AudioRouter.routeToBluetooth() when available (preferred),
 * falls back to RNWhisper if AudioRouter not present.
 */
export async function setAudioEarpiece(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  // Prefer AudioRouter for consistent session management
  const { AudioRouter } = NativeModules;
  if (AudioRouter) {
    try {
      await AudioRouter.routeToBluetooth();
      console.log('[speech/ios] → EARPIECE/BT (AudioRouter)');
      return;
    } catch (e: any) {
      console.warn('[speech/ios] AudioRouter.routeToBluetooth fallthrough:', e?.message);
    }
  }
  // Fallback to RNWhisper
  try {
    const rn = getRNWhisper();
    if (rn) {
      await rn.setAudioSessionCategory('PlayAndRecord', ['AllowBluetooth']);
      await rn.setAudioSessionActive(true);
      console.log('[speech/ios] → EARPIECE/BT (RNWhisper)');
    }
  } catch (e: any) {
    console.warn('[speech/ios] setAudioEarpiece error:', e?.message);
  }
}

// ─── iOS internal ───

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function iosRecordAndTranscribe(maxSec: number, language: string): Promise<string> {
  if (!whisperContext) return 'ERROR: Whisper not loaded';
  await stopCapture();

  // Set audio for recording
  const rn = getRNWhisper();
  if (rn) {
    try {
      await rn.setAudioSessionCategory('PlayAndRecord', ['DefaultToSpeaker', 'AllowBluetooth']);
      await rn.setAudioSessionActive(true);
    } catch (e) {}
  }

  try {
    isCapturing = true;

    const { stop, subscribe } = await whisperContext.transcribeRealtime({
      language,
      translate: false,
      maxLen: 1,
      realtimeAudioSec: maxSec,
      realtimeAudioMinSec: 0.5,
    });

    activeStopFn = stop;

    return new Promise<string>((resolve) => {
      let latestResult = '';
      let previousResult = '';
      let resolved = false;
      let silenceTimer: any = null;
      let gotSpeech = false;

      const SILENCE_AFTER_SPEECH_MS = 1000;

      const finish = (text: string) => {
        if (resolved) return;
        resolved = true;
        if (silenceTimer) clearTimeout(silenceTimer);
        activeStopFn = null;
        isCapturing = false;
        const trimmed = text.trim();
        resolve(trimmed || 'SILENCE');
      };

      const initialTimer = setTimeout(() => {
        if (!gotSpeech && !resolved) {
          try { stop(); } catch (e) {}
          finish('');
        }
      }, 4000);

      subscribe((evt: any) => {
        let newText = '';
        if (evt?.data?.result) newText = evt.data.result;
        if (evt?.data?.segments?.length > 0) {
          const all = evt.data.segments.map((s: any) => s.text).join(' ').trim();
          if (all) newText = all;
        }

        if (newText && newText.trim().length > 0) {
          latestResult = newText.trim();
          if (!gotSpeech) { gotSpeech = true; clearTimeout(initialTimer); }

          if (latestResult !== previousResult) {
            previousResult = latestResult;
            if (silenceTimer) clearTimeout(silenceTimer);
            silenceTimer = setTimeout(() => {
              try { stop(); } catch (e) {}
              setTimeout(() => finish(latestResult), 200);
            }, SILENCE_AFTER_SPEECH_MS);
          }
        }

        if (evt?.isCapturing === false) {
          finish(evt?.data?.result || latestResult);
        }
      });

      setTimeout(() => {
        if (!resolved) {
          try { stop(); } catch (e) {}
          setTimeout(() => finish(latestResult), 200);
        }
      }, maxSec * 1000 + 1500);
    });

  } catch (e: any) {
    activeStopFn = null;
    isCapturing = false;
    return 'ERROR: ' + (e?.message || 'failed');
  }
}
