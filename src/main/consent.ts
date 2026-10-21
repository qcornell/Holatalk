/**
 * The rep's OK for calls with Ana to go to outside AI (App Review Guideline 5.1.2(i)): asked once,
 * before the first call, on this phone. Settings can show it again or turn it off.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@hola_ai_consent';

export async function hasAiConsent(): Promise<boolean> {
  try {
    return !!(await AsyncStorage.getItem(KEY));
  } catch {
    return false;
  }
}

export async function setAiConsent(on: boolean): Promise<void> {
  try {
    if (on) await AsyncStorage.setItem(KEY, new Date().toISOString());
    else await AsyncStorage.removeItem(KEY);
  } catch {
    // storage unavailable: asked again next time, which is the safe side
  }
}
