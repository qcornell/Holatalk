/**
 * Talks to the Hola server (supabase/functions/start-live): the rep's plan and minutes left, and
 * the go-ahead to start a call with Ana. The phone sends its Apple-signed subscription
 * transactions; the server checks them with Apple's signature and counts the minutes.
 */
import { planTransactions } from '../subscription';
import type { TeammateSettings } from '../teammate/settings';

export const START_LIVE_URL =
  process.env.EXPO_PUBLIC_TEAMMATE_START_URL || 'https://bozoiqestwopczjaxnlu.supabase.co/functions/v1/start-live';

export interface PlanStatus {
  plan: string;
  minutesLeft: number;
  minutesInPlan: number;
  /** ISO date the minutes reset */
  periodEnd: string;
  trial: boolean;
}

export interface CallTicket extends PlanStatus {
  serverUrl: string;
  participantToken: string;
  roomName: string;
}

/** A refusal from the server: out_of_minutes, no_plan, bad_access_code, meter_down, ... */
export class AccountError extends Error {
  constructor(public code: string, message: string, public status?: PlanStatus) {
    super(message);
  }
}

/** True while testing through LiveKit's development token server (set in Settings, Connection). */
export function usingTestConnection(s: TeammateSettings): boolean {
  return !!s.connection.tokenServerId.trim();
}

async function post(action: 'status' | 'start', s: TeammateSettings): Promise<any> {
  const transactions = s.connection.accessCode.trim() ? [] : await planTransactions();
  let r: Response;
  try {
    r = await fetch(s.connection.startUrl.trim() || START_LIVE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        device_id: s.deviceId,
        transactions,
        ...(s.connection.accessCode.trim() ? { access_code: s.connection.accessCode.trim() } : {}),
      }),
    });
  } catch {
    throw new AccountError('offline', "Can't reach Hola. Check your signal and try again.");
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const status = typeof data.minutesInPlan === 'number' ? (data as PlanStatus) : undefined;
    throw new AccountError(String(data.error || `http_${r.status}`), String(data.message || `Hola couldn't start the call (HTTP ${r.status}).`), status);
  }
  return data;
}

export async function planStatus(s: TeammateSettings): Promise<PlanStatus> {
  return (await post('status', s)) as PlanStatus;
}

export async function startCall(s: TeammateSettings): Promise<CallTicket> {
  return (await post('start', s)) as CallTicket;
}

/** "Resets Nov 3" */
export function resetsOn(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `Resets ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}
