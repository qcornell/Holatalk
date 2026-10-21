/**
 * One Teammate call: joins a LiveKit room on speakerphone, Ana (the hola-teammate agent) joins too,
 * and her messages on the "hola" data topic become screen state (captions, price card, "Ana needs you").
 *
 * Ana -> phone: hello, caption, price_card, calling_rep, rep_nudge, ask_rep, check_in, signup_ready,
 *               lead, callback, flag, move_on, ended   (see teammate-agent/README.md)
 * phone -> Ana: playbook (answers hello), rep_says (a tapped reply), rep_hold (talk button down/up)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Vibration } from 'react-native';
import { AndroidAudioTypePresets, AudioSession } from '@livekit/react-native';
import { Participant, RemoteParticipant, Room, RoomEvent, TokenSource } from 'livekit-client';
import type { TeammateSettings } from './settings';
import { toPlaybook } from './settings';
import { AccountError, startCall, usingTestConnection } from '../main/account';

const TOPIC = 'hola';
const AGENT_NAME = 'hola-teammate';
const ANA_JOIN_SECONDS = 20;

export type Phase = 'connecting' | 'waiting' | 'live' | 'ended' | 'error';

export interface Caption {
  id: number;
  who: 'customer' | 'ana' | 'rep';
  text: string;
  en: string;
}

export interface PriceCard {
  plan: string;
  monthly: number;
  options: { how: string; howEs: string; monthly: number }[];
  chosen?: string;
  /** "month" or "once" (a one-time price) */
  per?: 'month' | 'once';
}

/** How a call went, for the day's counts on the home screen. */
export interface CallResult {
  signedUp: boolean;
  seconds: number;
}

/** Why Ana wants you right now. */
export interface AnaNeeds {
  kind: 'calling' | 'question' | 'signup' | 'check_in';
  question?: string;
}

export interface SignUp {
  plan: string;
  payment: string;
  monthly: number | null;
}

export interface CallState {
  phase: Phase;
  error: string;
  seconds: number;
  muted: boolean;
  speaker: boolean;
  anaTalking: boolean;
  captions: Caption[];
  price: PriceCard | null;
  needs: AnaNeeds | null;
  signup: SignUp | null;
  corrections: string[];
  moveOn: string;
  endedReason: string;
  costUsd: number | null;
  /** Why the call couldn't start, from the Hola server: out_of_minutes, no_plan, offline, ... */
  errorCode: string;
  /** The plan ran out mid-call: Ana wraps up after this many seconds */
  minutesOut: number | null;
}

const START: CallState = {
  phase: 'connecting',
  error: '',
  seconds: 0,
  muted: false,
  speaker: true,
  anaTalking: false,
  captions: [],
  price: null,
  needs: null,
  signup: null,
  corrections: [],
  moveOn: '',
  endedReason: '',
  costUsd: null,
  errorCode: '',
  minutesOut: null,
};

/** A strong buzz so you feel it in your hand or pocket. */
function buzz(times = 2) {
  Vibration.vibrate(times > 1 ? [0, 400, 150, 400] : 400);
}

/**
 * How the phone gets into a room with Ana: the Hola server (checks the plan and minutes), or, while
 * testing, LiveKit's development token server when its ID is set in Settings > Connection.
 */
async function connectionFor(s: TeammateSettings, roomName: string): Promise<{ serverUrl: string; participantToken: string }> {
  const identity = `rep-${s.deviceId}`;
  const userId = `device-${s.deviceId}`;
  const { tokenServerId } = s.connection;
  if (!usingTestConnection(s)) {
    const ticket = await startCall(s);
    return { serverUrl: ticket.serverUrl, participantToken: ticket.participantToken };
  }
  const source = TokenSource.developmentTokenServer(tokenServerId.trim());
  const got = await source.fetch({
    roomName,
    participantIdentity: identity,
    participantName: s.repName || 'Rep',
    agentName: AGENT_NAME,
    agentMetadata: JSON.stringify({ user_id: userId, rep_identity: identity }),
  });
  return { serverUrl: got.serverUrl, participantToken: got.participantToken };
}

export function useTeammateCall(settings: TeammateSettings) {
  const [state, setState] = useState<CallState>(START);
  const room = useRef<Room | null>(null);
  const captionId = useRef(0);
  const ended = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const patch = useCallback((p: Partial<CallState> | ((s: CallState) => Partial<CallState>)) => {
    setState((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) }));
  }, []);

  const send = useCallback(async (msg: Record<string, unknown>) => {
    const r = room.current;
    if (!r) return;
    try {
      await r.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(msg)), { reliable: true, topic: TOPIC });
    } catch (e) {
      console.warn('[teammate] send failed', msg.type, e);
    }
  }, []);

  const handle = useCallback(
    (msg: any) => {
      switch (msg?.type) {
        case 'hello': // Ana joined and wants the setup
          send({ type: 'playbook', playbook: toPlaybook(settingsRef.current), user_id: `device-${settingsRef.current.deviceId}` });
          patch({ phase: 'live' });
          break;
        case 'caption': {
          const who: Caption['who'] = msg.who === 'hola' ? 'ana' : msg.who === 'rep' ? 'rep' : 'customer';
          const c: Caption = { id: ++captionId.current, who, text: String(msg.text ?? ''), en: String(msg.en ?? '') };
          patch((s) => ({ captions: [...s.captions.slice(-40), c] }));
          break;
        }
        case 'price_card':
          patch({ price: { plan: msg.plan, monthly: msg.monthly, options: msg.options ?? [], chosen: msg.chosen, per: msg.per === 'once' ? 'once' : 'month' } });
          break;
        case 'calling_rep': // "Quentin, are you there?"
          buzz();
          patch((s) => ({ needs: s.needs && s.needs.kind !== 'calling' ? s.needs : { kind: 'calling' } }));
          break;
        case 'rep_nudge':
          buzz();
          break;
        case 'ask_rep':
          patch({ needs: { kind: 'question', question: String(msg.question ?? '') } });
          break;
        case 'check_in':
          patch({ needs: { kind: 'check_in' } });
          break;
        case 'signup_ready':
          buzz();
          patch({ needs: { kind: 'signup' }, signup: { plan: msg.plan ?? '', payment: msg.payment ?? '', monthly: msg.monthly ?? null } });
          break;
        case 'lead': // voice sign-ups (no tablet)
          if (msg.status === 'saved') {
            const f = msg.fields ?? {};
            patch({ signup: { plan: f.plan ?? '', payment: f.payment ?? '', monthly: f.monthly ?? null } });
          }
          break;
        case 'flag':
          patch((s) => ({ corrections: [...s.corrections, String(msg.problem ?? '')] }));
          break;
        case 'move_on':
          patch({ moveOn: String(msg.reason ?? '') });
          break;
        case 'minutes_out': // the plan ran out; Ana wraps up after a short grace
          buzz(1);
          patch({ minutesOut: typeof msg.grace_seconds === 'number' ? msg.grace_seconds : 180 });
          break;
        case 'ended':
          patch({ endedReason: String(msg.reason ?? ''), costUsd: typeof msg.cost_usd === 'number' ? msg.cost_usd : null });
          break;
      }
    },
    [patch, send],
  );

  const finish = useCallback(
    async (reason = '') => {
      if (ended.current) return;
      ended.current = true;
      patch((s) => ({ phase: 'ended', endedReason: s.endedReason || reason, needs: null }));
      const r = room.current;
      room.current = null;
      try {
        await r?.disconnect();
      } finally {
        await AudioSession.stopAudioSession().catch(() => {});
      }
    },
    [patch],
  );

  const phaseRef = useRef<Phase>('connecting');
  useEffect(() => {
    phaseRef.current = state.phase;
  }, [state.phase]);

  // connect once when the screen opens
  useEffect(() => {
    let cancelled = false;
    let joinTimer: ReturnType<typeof setTimeout> | undefined;
    const s = settingsRef.current;
    const r = new Room({
      adaptiveStream: false,
      dynacast: false,
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    room.current = r;

    r.on(RoomEvent.DataReceived, (payload: Uint8Array, _p?: RemoteParticipant, _k?: unknown, topic?: string) => {
      if (topic !== TOPIC) return;
      try {
        handle(JSON.parse(new TextDecoder().decode(payload)));
      } catch {
        /* not ours */
      }
    });
    r.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      patch({ anaTalking: speakers.some((p) => p.isAgent) });
    });
    r.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
      if (p.isAgent) patch((st) => (st.phase === 'waiting' ? { phase: 'live' } : {}));
    });
    r.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
      if (p.isAgent) finish('ana_left');
    });
    r.on(RoomEvent.Disconnected, () => finish('disconnected'));

    (async () => {
      try {
        await AudioSession.configureAudio({
          ios: { defaultOutput: 'speaker' },
          android: { preferredOutputList: ['speaker'], audioTypeOptions: AndroidAudioTypePresets.communication },
        });
        await AudioSession.startAudioSession();
        const roomName = `hola-${s.deviceId.slice(0, 8)}-${Date.now().toString(36)}`;
        const { serverUrl, participantToken } = await connectionFor(s, roomName);
        if (cancelled) return;
        await r.connect(serverUrl, participantToken);
        await r.localParticipant.setMicrophoneEnabled(true);
        AudioSession.selectAudioOutput('force_speaker').catch(() => {});
        patch((st) => (st.phase === 'connecting' ? { phase: 'waiting' } : {}));
        joinTimer = setTimeout(() => {
          if (phaseRef.current !== 'waiting' || ended.current) return;
          ended.current = true;
          r.disconnect();
          AudioSession.stopAudioSession().catch(() => {});
          patch({
            phase: 'error',
            error: usingTestConnection(s)
              ? "Ana didn't pick up. Is start-ana-for-iphone running on your PC?"
              : "Ana didn't pick up. Try again in a moment.",
          });
        }, ANA_JOIN_SECONDS * 1000);
      } catch (e: any) {
        if (cancelled) return;
        ended.current = true;
        r.disconnect();
        AudioSession.stopAudioSession().catch(() => {});
        patch({ phase: 'error', error: e?.message || String(e), errorCode: e instanceof AccountError ? e.code : '' });
      }
    })();

    return () => {
      cancelled = true;
      if (joinTimer) clearTimeout(joinTimer);
      if (!ended.current) {
        ended.current = true;
        r.disconnect();
        AudioSession.stopAudioSession().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // call timer
  useEffect(() => {
    if (state.phase !== 'live') return;
    const t = setInterval(() => patch((s) => ({ seconds: s.seconds + 1 })), 1000);
    return () => clearInterval(t);
  }, [state.phase, patch]);

  const toggleMute = useCallback(async () => {
    const r = room.current;
    if (!r) return;
    const muted = !state.muted;
    await r.localParticipant.setMicrophoneEnabled(!muted);
    patch({ muted });
  }, [state.muted, patch]);

  const toggleSpeaker = useCallback(async () => {
    const speaker = !state.speaker;
    await AudioSession.selectAudioOutput(speaker ? 'force_speaker' : 'default').catch(() => {});
    patch({ speaker });
  }, [state.speaker, patch]);

  /** A tapped quick reply: certain to be you, so Ana trusts it like your voice. */
  const reply = useCallback(
    (text: string) => {
      send({ type: 'rep_says', text });
      patch({ needs: null });
    },
    [send, patch],
  );

  const holdDown = useCallback(async () => {
    if (state.muted) {
      await room.current?.localParticipant.setMicrophoneEnabled(true);
      patch({ muted: false });
    }
    send({ type: 'rep_hold', down: true });
  }, [send, state.muted, patch]);

  const holdUp = useCallback(() => {
    send({ type: 'rep_hold', down: false });
    patch((s) => (s.needs?.kind === 'calling' ? { needs: null } : {}));
  }, [send, patch]);

  const dismissNeeds = useCallback(() => patch({ needs: null }), [patch]);

  return { state, end: finish, toggleMute, toggleSpeaker, reply, holdDown, holdUp, dismissNeeds };
}
