/**
 * Audio Router — Switch between phone speaker and Bluetooth (Meta Glasses).
 * 
 * 🔊 Speaker mode: Customer hears from phone speaker
 * 🎧 Bluetooth mode: Rep hears privately in glasses earpiece
 * 
 * Android: Uses AudioRouter native module (Kotlin)
 * iOS: Uses AudioRouter (ObjC, injected by config plugin) OR falls back gracefully
 *
 * For TTS routing, speaker.ts calls AudioRouter.setOutputMode() before expo-speech.
 * This file provides non-TTS route switching and Bluetooth detection.
 */

import { NativeModules, Platform } from 'react-native';

const AudioRouterModule = NativeModules.AudioRouter || null;

export type AudioRoute = 'speaker' | 'bluetooth' | 'default';

let currentRoute: AudioRoute = 'default';
let bluetoothAvailable: boolean | null = null;

/**
 * Route audio to phone speaker (customer hears).
 */
export async function routeToSpeaker(): Promise<void> {
  if (AudioRouterModule) {
    try {
      await AudioRouterModule.routeToSpeaker();
      currentRoute = 'speaker';
      console.log('[audioRouter] → SPEAKER');
      return;
    } catch (e: any) {
      console.warn('[audioRouter] routeToSpeaker failed:', e?.message);
    }
  }
  currentRoute = 'speaker';
  console.log('[audioRouter] → SPEAKER (no native module, set flag only)');
}

/**
 * Route audio to Bluetooth (rep hears in glasses).
 */
export async function routeToBluetooth(): Promise<void> {
  if (AudioRouterModule) {
    try {
      await AudioRouterModule.routeToBluetooth();
      currentRoute = 'bluetooth';
      console.log('[audioRouter] → BLUETOOTH');
      return;
    } catch (e: any) {
      console.warn('[audioRouter] routeToBluetooth failed:', e?.message);
    }
  }
  currentRoute = 'bluetooth';
  console.log('[audioRouter] → BLUETOOTH (no native module, set flag only)');
}

/**
 * Restore default audio routing.
 */
export async function routeToDefault(): Promise<void> {
  if (AudioRouterModule) {
    try {
      await AudioRouterModule.routeToDefault();
      currentRoute = 'default';
      console.log('[audioRouter] → DEFAULT');
      return;
    } catch (e: any) {
      console.warn('[audioRouter] routeToDefault failed:', e?.message);
    }
  }
  currentRoute = 'default';
}

/**
 * Check if Bluetooth audio is available (Meta Glasses connected).
 */
export async function checkBluetooth(): Promise<boolean> {
  // Try AudioRouter native module
  if (AudioRouterModule?.isBluetoothConnected) {
    try {
      bluetoothAvailable = await AudioRouterModule.isBluetoothConnected();
      console.log('[audioRouter] Bluetooth available:', bluetoothAvailable);
      return bluetoothAvailable ?? false;
    } catch (e: any) {
      console.warn('[audioRouter] checkBluetooth failed:', e?.message);
    }
  }

  // iOS without native module: can't easily check, assume false
  bluetoothAvailable = false;
  console.log('[audioRouter] Bluetooth check: no native module, assuming false');
  return false;
}

/**
 * Get cached Bluetooth status (call checkBluetooth first).
 */
export function isBluetoothAvailable(): boolean {
  return bluetoothAvailable ?? false;
}

/**
 * Get current audio route.
 */
export function getCurrentRoute(): AudioRoute {
  return currentRoute;
}
