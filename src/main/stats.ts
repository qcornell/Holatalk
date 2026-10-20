/** Today's calls with Ana and sign-ups, kept on the phone for the home screen. A new day starts at zero. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { today } from '../teammate/settings';

const KEY = '@hola_day_stats';

export interface DayStats {
  day: string;
  calls: number;
  signups: number;
  seconds: number;
}

const empty = (): DayStats => ({ day: today(), calls: 0, signups: 0, seconds: 0 });

export async function loadToday(): Promise<DayStats> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const saved = raw ? (JSON.parse(raw) as DayStats) : null;
    return saved && saved.day === today() ? { ...empty(), ...saved } : empty();
  } catch {
    return empty();
  }
}

export async function recordCall(r: { signedUp: boolean; seconds: number }): Promise<DayStats> {
  const cur = await loadToday();
  const next = { ...cur, calls: cur.calls + 1, signups: cur.signups + (r.signedUp ? 1 : 0), seconds: cur.seconds + Math.max(0, r.seconds) };
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // the counts are a convenience; a failed save just means they start over
  }
  return next;
}
