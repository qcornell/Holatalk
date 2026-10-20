/**
 * The Teammate call. The customer sees what looks like a call with a Spanish-speaking rep; you pull up
 * "Your notes" for English captions, Ana's questions for you, and the sign-up. Follows the design
 * "Hola Teammate Call Screen" (boards 1-5).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import type { TeammateSettings } from './settings';
import { money, pricePer } from './settings';
import { industry } from './industries';
import { useTeammateCall } from './useTeammateCall';
import type { AnaNeeds, Caption, CallResult, CallState, PriceCard } from './useTeammateCall';
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  EndCallIcon,
  MicIcon,
  NotesIcon,
  PhoneIcon,
  SpeakerIcon,
  TabletIcon,
  TagIcon,
} from './icons';

const ACCENT = '#30D59B';
const ANA = require('../../assets/teammate/ana.png');
const BARS = [6, 8, 6, 12, 9, 16, 24, 32, 40, 48, 56, 44, 62, 44, 56, 48, 40, 32, 24, 16, 9, 12, 6, 8, 6];

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/* ── the voice wave on the customer's side ── */
function Wave({ active }: { active: boolean }) {
  const anims = useRef(BARS.map(() => new Animated.Value(0.5))).current;
  useEffect(() => {
    if (!active) {
      anims.forEach((a) => Animated.timing(a, { toValue: 0.35, duration: 250, useNativeDriver: true }).start());
      return;
    }
    const loops = anims.map((a, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay((i % 7) * 80),
          Animated.timing(a, { toValue: 1, duration: 450, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(a, { toValue: 0.5, duration: 450, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [active, anims]);
  return (
    <View style={st.wave}>
      {BARS.map((h, i) => (
        <Animated.View
          key={i}
          style={[st.bar, { height: h, opacity: h < 14 ? 0.55 : 1, transform: [{ scaleY: anims[i] }] }]}
        />
      ))}
    </View>
  );
}

/* ── the big price card the customer sees ── */
function PriceView({ price, settings }: { price: PriceCard; settings: TeammateSettings }) {
  const options = price.options.length ? price.options : [{ how: '', howEs: '', monthly: price.monthly }];
  const main = options.find((o) => o.how === price.chosen) ?? options.reduce((a, b) => (b.monthly < a.monthly ? b : a));
  const others = options.filter((o) => o !== main);
  const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const pack = industry(settings.industry);
  const monthly = (price.per ?? pack.per) === 'month';
  return (
    <View style={st.priceCard}>
      <Text style={st.priceKicker}>{settings.industry === 'internet' ? `${price.plan || 'Internet'} para su casa` : price.plan || pack.planName}</Text>
      <View style={st.priceRow}>
        <Text style={st.priceBig}>{money(main.monthly)}</Text>
        {monthly ? <Text style={st.pricePer}>al mes</Text> : null}
      </View>
      {main.howEs ? <Text style={st.priceHow}>{main.howEs.replace(/, con número de cuenta y de ruta$/, '')}</Text> : null}
      <View style={st.priceDivider} />
      {pack.hasInstall && settings.installationFee === 0 ? (
        <View style={st.priceFeature}>
          <CheckIcon size={22} color="#0B7A54" />
          <Text style={st.priceFeatureText}>Instalación gratis</Text>
        </View>
      ) : null}
      {pack.hasInstall && !settings.hasContract ? (
        <View style={st.priceFeature}>
          <CheckIcon size={22} color="#0B7A54" />
          <Text style={st.priceFeatureText}>Sin contrato</Text>
        </View>
      ) : null}
      {others.map((o) => (
        <View key={o.how} style={st.priceOther}>
          <Text style={st.priceOtherHow}>{cap(o.howEs || o.how)}</Text>
          <View style={{ flex: 1 }} />
          <Text style={st.priceOtherAmt}>{money(o.monthly)}</Text>
          {monthly ? <Text style={st.priceOtherPer}> al mes</Text> : null}
        </View>
      ))}
    </View>
  );
}

function CallButton({
  label,
  on,
  onPress,
  children,
}: {
  label: string;
  on?: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={st.ctrl}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: !!on }}
        onPress={onPress}
        style={({ pressed }) => [st.ctrlBtn, on && st.ctrlBtnOn, pressed && { opacity: 0.75 }]}
      >
        {children}
      </Pressable>
      <Text style={st.ctrlLabel}>{label}</Text>
    </View>
  );
}

/* ── what Ana needs from you ── */
function NeedsCard({
  needs,
  rep,
  replies,
  onReply,
}: {
  needs: AnaNeeds;
  rep: string;
  replies: string[];
  onReply: (t: string) => void;
}) {
  const head =
    needs.kind === 'signup'
      ? 'They said yes!'
      : needs.kind === 'question'
        ? 'Ana is asking you'
        : 'Ana needs you · your phone buzzed';
  const big =
    needs.kind === 'signup'
      ? 'Hand them your tablet for their name, number and email.'
      : needs.kind === 'question'
        ? needs.question || 'She has a question for you.'
        : needs.kind === 'check_in'
          ? 'Anything else you want her to ask or explain?'
          : `“${rep}, are you there?”`;
  const hint =
    needs.kind === 'question'
      ? 'Answer out loud, or hold the talk button.'
      : needs.kind === 'signup'
        ? 'Say “yeah” so she knows you heard. Need more? Tap below or just tell her.'
        : 'Just say “yeah” out loud, or tap below.';
  const showReplies = needs.kind !== 'question';
  return (
    <View style={st.needs}>
      <View style={st.needsHead}>
        {needs.kind === 'signup' ? <TabletIcon size={18} /> : <SpeakerIcon size={18} color="#0B7A54" />}
        <Text style={st.needsHeadText}>{head}</Text>
      </View>
      <Text style={st.needsBig}>{big}</Text>
      <Text style={st.needsHint}>{hint}</Text>
      {showReplies ? (
        <View style={{ gap: 8, marginTop: 6 }}>
          {replies.map((r) => (
            <Pressable key={r} onPress={() => onReply(r)} style={({ pressed }) => [st.replyBtn, pressed && { opacity: 0.7 }]}>
              <Text style={st.replyText}>{r}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => onReply("No, that's it, thank you")} style={({ pressed }) => [st.replyDone, pressed && { opacity: 0.8 }]}>
            <Text style={st.replyDoneText}>No, that's it, thank you</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function CaptionLine({ c, rep }: { c: Caption; rep: string }) {
  const label = c.who === 'ana' ? 'Ana' : c.who === 'rep' ? 'You' : 'Customer';
  const color = c.who === 'ana' ? '#0B7A54' : c.who === 'rep' ? '#57534E' : '#1D4ED8';
  const main = c.en || c.text;
  const sameText = !c.en || c.en.trim().toLowerCase() === c.text.trim().toLowerCase();
  return (
    <View style={{ gap: 2 }}>
      <Text style={[st.capWho, { color }]}>{label === 'You' ? rep || 'You' : label}</Text>
      <Text style={st.capMain}>{main}</Text>
      {!sameText ? <Text style={st.capOrig}>{c.text}</Text> : null}
    </View>
  );
}

/* ── "Your notes": your side of the call, in English ── */
function Notes({
  state,
  settings,
  onClose,
  onReply,
  onHoldIn,
  onHoldOut,
  onEnd,
}: {
  state: CallState;
  settings: TeammateSettings;
  onClose: () => void;
  onReply: (t: string) => void;
  onHoldIn: () => void;
  onHoldOut: () => void;
  onEnd: () => void;
}) {
  const scroll = useRef<ScrollView>(null);
  const [holding, setHolding] = useState(false);
  return (
    <View style={st.sheet}>
      <Pressable onPress={onClose} accessibilityLabel="Hide your notes" style={st.sheetHandleArea}>
        <View style={st.sheetHandle} />
      </Pressable>
      <View style={st.sheetTop}>
        <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Hide your notes">
          <ChevronDownIcon />
        </Pressable>
        <Text style={st.sheetTitle}>Your notes</Text>
        <View style={{ flex: 1 }} />
        <Pressable
          onPressIn={() => {
            setHolding(true);
            onHoldIn();
          }}
          onPressOut={() => {
            setHolding(false);
            onHoldOut();
          }}
          accessibilityLabel="Hold to talk to Ana"
          style={[st.holdBtn, holding && st.holdBtnOn]}
        >
          <MicIcon size={18} color={holding ? '#050507' : '#FFFFFF'} />
          <Text style={[st.holdText, holding && { color: '#050507' }]}>{holding ? 'Talking…' : 'Hold to jump in'}</Text>
        </Pressable>
      </View>
      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 12, paddingBottom: 16 }}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
      >
        {state.needs ? (
          <NeedsCard needs={state.needs} rep={settings.repName} replies={settings.checkInReplies} onReply={onReply} />
        ) : null}
        {state.signup ? (
          <View style={st.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={st.cardLabel}>Sign-up</Text>
              <View style={{ flex: 1 }} />
              <Text style={[st.cardLabel, { color: '#0B7A54' }]}>They said yes</Text>
            </View>
            <Row label="Plan" value={state.signup.plan || 'Internet'} done />
            <Row label="Details" value={settings.signupBy === 'tablet' ? 'They type them on your tablet' : 'Saved'} done />
            <Row
              label="Pays with"
              value={state.signup.payment ? `${state.signup.payment} · ${money(state.signup.monthly ?? 0)}/mo` : 'Not yet'}
              done={!!state.signup.payment}
            />
          </View>
        ) : null}
        {state.corrections.length ? (
          <View style={st.warn}>
            <Text style={st.warnTitle}>Ana corrected herself</Text>
            <Text style={st.warnText}>{state.corrections[state.corrections.length - 1]}</Text>
          </View>
        ) : null}
        <View style={st.card}>
          <Text style={st.cardLabel}>Live captions</Text>
          {state.captions.length === 0 ? (
            <Text style={st.capOrig}>What Ana and the customer say shows up here in English.</Text>
          ) : (
            state.captions.slice(-12).map((c) => <CaptionLine key={c.id} c={c} rep={settings.repName} />)
          )}
        </View>
        {state.moveOn ? (
          <View style={st.card}>
            <Text style={st.cardLabel}>Ana says this door is done</Text>
            <Text style={st.capMain}>{state.moveOn}</Text>
          </View>
        ) : null}
      </ScrollView>
      <Pressable onPress={onEnd} style={({ pressed }) => [st.endOutline, pressed && { opacity: 0.7 }]}>
        <Text style={st.endOutlineText}>End call</Text>
      </Pressable>
    </View>
  );
}

function Row({ label, value, done }: { label: string; value: string; done?: boolean }) {
  return (
    <View style={st.row}>
      <Text style={st.rowLabel}>{label}</Text>
      <Text style={[st.rowValue, !done && { color: '#78716C' }]}>{value}</Text>
      {done ? <CheckIcon size={18} /> : null}
    </View>
  );
}

/* ── after the call ── */
function Ended({
  state,
  settings,
  onNext,
  onPlans,
}: {
  state: CallState;
  settings: TeammateSettings;
  onNext: (r: CallResult) => void;
  onPlans?: () => void;
}) {
  const pop = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 5, useNativeDriver: true }).start();
  }, [pop]);
  const won = !!state.signup;
  const minutes = Math.max(1, Math.round(state.seconds / 60));
  return (
    <View style={st.endedWrap}>
      <Animated.View style={[st.endedBadge, { transform: [{ scale: pop }] }, !won && { backgroundColor: '#2A2A30' }]}>
        {won ? <CheckIcon size={64} color="#050507" /> : <PhoneIcon size={52} color="#FFFFFF" />}
      </Animated.View>
      <Text style={st.endedTitle}>{won ? 'Signed up!' : 'Call ended'}</Text>
      <Text style={st.endedSub}>
        {won
          ? `Nice close, ${settings.repName || 'champ'}.`
          : state.endedReason === 'out_of_minutes'
            ? "You're out of minutes for now."
            : state.moveOn
              ? `Ana: ${state.moveOn}`
              : 'On to the next one.'}
      </Text>
      {won && state.signup ? (
        <View style={st.endedCard}>
          <Text style={st.endedPlan}>{state.signup.plan || settings.plans[0]?.name || 'Signed up'}</Text>
          <Row label="Details" value={settings.signupBy === 'tablet' ? 'On your tablet' : 'Saved'} done />
          <Row label="Pays with" value={state.signup.payment || 'Not chosen yet'} done={!!state.signup.payment} />
          {state.signup.monthly ? (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 6 }}>
              <Text style={st.rowLabel}>{pricePer(settings) === 'month' ? 'Monthly' : 'Price'}</Text>
              <View style={{ flex: 1 }} />
              <Text style={st.endedPrice}>{money(state.signup.monthly)}</Text>
              {pricePer(settings) === 'month' ? <Text style={st.rowLabel}> /mo</Text> : null}
            </View>
          ) : null}
        </View>
      ) : null}
      <Text style={st.endedMeta}>
        {clock(state.seconds)} on the call{state.costUsd != null ? ` · about $${state.costUsd.toFixed(2)}` : ` · ~${minutes} min`}
      </Text>
      <View style={{ flex: 1 }} />
      <Pressable onPress={() => onNext({ signedUp: won, seconds: state.seconds })} style={({ pressed }) => [st.nextBtn, pressed && { opacity: 0.85 }]}>
        <Text style={st.nextText}>Next door</Text>
        <ChevronRightIcon />
      </Pressable>
      {state.endedReason === 'out_of_minutes' && onPlans ? (
        <Pressable
          onPress={() => {
            onNext({ signedUp: won, seconds: state.seconds });
            onPlans();
          }}
          accessibilityRole="button"
          style={st.secondaryBtn}
        >
          <Text style={st.secondaryText}>Get more minutes</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function TeammateCallScreen({
  settings,
  onDone,
  onRetry,
  onPlans,
}: {
  settings: TeammateSettings;
  onDone: (r?: CallResult) => void;
  onRetry: () => void;
  /** Open the plans (out of minutes, or no plan yet) */
  onPlans?: () => void;
}) {
  useKeepAwake();
  const call = useTeammateCall(settings);
  const { state } = call;
  const [notesOpen, setNotesOpen] = useState(false);
  const [showPrice, setShowPrice] = useState(false);
  const sheet = useRef(new Animated.Value(0)).current;

  // a new price from Ana pops the card up for the customer
  useEffect(() => {
    if (state.price) setShowPrice(true);
  }, [state.price]);
  // when Ana needs you, your notes open by themselves
  useEffect(() => {
    if (state.needs) setNotesOpen(true);
  }, [state.needs]);
  useEffect(() => {
    Animated.timing(sheet, { toValue: notesOpen ? 1 : 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [notesOpen, sheet]);

  const fallbackPrice: PriceCard | null = useMemo(() => {
    const plan = settings.plans[0];
    const options = (plan?.priceOptions ?? []).filter((o) => o.priceMonthly > 0);
    if (!plan || (!options.length && !(plan.priceMonthly > 0))) return null; // nothing priced: no price card
    return {
      plan: plan.name,
      monthly: options.length ? Math.min(...options.map((o) => o.priceMonthly)) : plan.priceMonthly,
      options: options.map((o) => ({ how: o.how, howEs: o.howEs, monthly: o.priceMonthly })),
      per: pricePer(settings) === 'once' ? 'once' : 'month',
    };
  }, [settings]);
  const price = state.price ?? fallbackPrice;

  if (state.phase === 'ended') {
    return (
      <SafeAreaView style={st.root}>
        <StatusBar barStyle="light-content" />
        <Ended state={state} settings={settings} onNext={onDone} onPlans={onPlans} />
      </SafeAreaView>
    );
  }

  const needsPlan = state.errorCode === 'out_of_minutes' || state.errorCode === 'no_plan';
  if (state.phase === 'error') {
    return (
      <SafeAreaView style={st.root}>
        <StatusBar barStyle="light-content" />
        <View style={st.endedWrap}>
          <Text style={st.endedTitle}>{needsPlan ? (state.errorCode === 'out_of_minutes' ? 'Out of minutes' : 'No plan yet') : "Couldn't reach Ana"}</Text>
          <Text style={[st.endedSub, { textAlign: 'center' }]}>{state.error}</Text>
          <View style={{ flex: 1 }} />
          {needsPlan && onPlans ? (
            <Pressable onPress={onPlans} accessibilityRole="button" style={({ pressed }) => [st.nextBtn, pressed && { opacity: 0.85 }]}>
              <Text style={st.nextText}>See plans</Text>
            </Pressable>
          ) : (
            <Pressable onPress={onRetry} accessibilityRole="button" style={({ pressed }) => [st.nextBtn, pressed && { opacity: 0.85 }]}>
              <Text style={st.nextText}>Try again</Text>
            </Pressable>
          )}
          <Pressable onPress={() => onDone()} style={st.secondaryBtn}>
            <Text style={st.secondaryText}>Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const status =
    state.phase === 'live' ? 'En llamada' : state.phase === 'waiting' ? 'Conectando…' : 'Llamando…';
  const priceUp = showPrice && !!price;

  return (
    <SafeAreaView style={st.root}>
      <StatusBar barStyle="light-content" />
      {priceUp ? (
        <View style={st.compactHead}>
          <Image source={ANA} style={st.avatarSmall} />
          <View style={{ gap: 4 }}>
            <Text style={st.compactName}>Representante en español</Text>
            <Text style={st.compactStatus}>
              {status} · {clock(state.seconds)}
            </Text>
          </View>
        </View>
      ) : (
        <View style={st.callHead}>
          <Image source={ANA} style={st.avatar} accessibilityLabel="Representante en español" />
          <Text style={st.name}>Representante en español</Text>
          <View style={st.statusRow}>
            <PhoneIcon size={20} color={ACCENT} />
            <Text style={st.statusText}>{status}</Text>
          </View>
          <Text style={st.timer}>{clock(state.seconds)}</Text>
          <Wave active={state.phase === 'live' && state.anaTalking} />
          <Text style={st.talking}>
            {state.phase !== 'live' ? ' ' : state.anaTalking ? 'Está hablando…' : 'Está escuchando…'}
          </Text>
        </View>
      )}
      {priceUp && price ? (
        <View style={{ paddingHorizontal: 24, marginTop: 28 }}>
          <PriceView price={price} settings={settings} />
          <Text style={[st.talking, { textAlign: 'center' }]}>
            {state.anaTalking ? 'Está hablando…' : 'Está escuchando…'}
          </Text>
        </View>
      ) : null}

      <View style={{ flex: 1 }} />

      {state.minutesOut != null ? (
        <View style={st.outPill} accessibilityLiveRegion="polite">
          <Text style={st.outText}>Your minutes ran out. Ana wraps up in {Math.max(1, Math.round(state.minutesOut / 60))} min.</Text>
        </View>
      ) : null}
      <View style={st.ctrlRow}>
        <CallButton label="Silenciar" on={state.muted} onPress={call.toggleMute}>
          <MicIcon off={state.muted} color={state.muted ? '#050507' : '#FFFFFF'} />
        </CallButton>
        <CallButton label="Altavoz" on={state.speaker} onPress={call.toggleSpeaker}>
          <SpeakerIcon color={state.speaker ? '#050507' : '#FFFFFF'} />
        </CallButton>
        <CallButton label="Precio" on={priceUp} onPress={() => setShowPrice((v) => !v)}>
          <TagIcon color={priceUp ? '#050507' : '#FFFFFF'} />
        </CallButton>
        <CallButton label="Notas" on={notesOpen} onPress={() => setNotesOpen(true)}>
          <NotesIcon color={notesOpen ? '#050507' : '#FFFFFF'} />
        </CallButton>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Terminar llamada"
        onPress={() => call.end('rep_ended')}
        style={({ pressed }) => [st.endBtn, pressed && { opacity: 0.8 }]}
      >
        <EndCallIcon />
      </Pressable>
      <View style={{ height: 24 }} />

      <Animated.View
        pointerEvents={notesOpen ? 'auto' : 'none'}
        style={[
          StyleSheet.absoluteFill,
          { top: 96, opacity: sheet, transform: [{ translateY: sheet.interpolate({ inputRange: [0, 1], outputRange: [500, 0] }) }] },
        ]}
      >
        <Notes
          state={state}
          settings={settings}
          onClose={() => setNotesOpen(false)}
          onReply={call.reply}
          onHoldIn={call.holdDown}
          onHoldOut={call.holdUp}
          onEnd={() => call.end('rep_ended')}
        />
      </Animated.View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050507' },
  callHead: { alignItems: 'center', paddingTop: 56, paddingHorizontal: 28 },
  avatar: { width: 172, height: 172, borderRadius: 86, borderWidth: 3, borderColor: '#FFFFFF' },
  name: { marginTop: 28, fontSize: 28, lineHeight: 32, fontWeight: '600', color: '#FFFFFF', textAlign: 'center' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  statusText: { color: ACCENT, fontSize: 18, fontWeight: '600' },
  timer: { marginTop: 8, fontSize: 20, color: '#C7C7CC', fontVariant: ['tabular-nums'] },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 64, marginTop: 34 },
  bar: { width: 4, borderRadius: 2, backgroundColor: ACCENT },
  talking: { marginTop: 14, fontSize: 15, color: '#A1A1AA' },

  compactHead: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 24, paddingTop: 24 },
  avatarSmall: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: '#FFFFFF' },
  compactName: { fontSize: 19, fontWeight: '600', color: '#FFFFFF' },
  compactStatus: { fontSize: 15, fontWeight: '600', color: ACCENT, fontVariant: ['tabular-nums'] },

  priceCard: { backgroundColor: '#FFFFFF', borderRadius: 28, paddingTop: 30, paddingHorizontal: 28, paddingBottom: 28 },
  priceKicker: { fontSize: 15, fontWeight: '600', color: '#5B5B63', letterSpacing: 0.3 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 8 },
  priceBig: { fontSize: 92, lineHeight: 96, fontWeight: '800', color: '#111114', letterSpacing: -2 },
  pricePer: { fontSize: 24, fontWeight: '600', color: '#3F3F46' },
  priceHow: { marginTop: 8, fontSize: 16, lineHeight: 22, color: '#3F3F46' },
  priceDivider: { height: 1, backgroundColor: '#E4E4E7', marginTop: 22, marginBottom: 20 },
  priceFeature: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  priceFeatureText: { fontSize: 20, fontWeight: '600', color: '#111114' },
  priceOther: { flexDirection: 'row', alignItems: 'baseline', backgroundColor: '#F4F4F5', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, marginTop: 8 },
  priceOtherHow: { fontSize: 17, fontWeight: '600', color: '#3F3F46', flexShrink: 1 },
  priceOtherAmt: { fontSize: 24, fontWeight: '800', color: '#111114' },
  priceOtherPer: { fontSize: 15, fontWeight: '600', color: '#3F3F46' },

  ctrlRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 28 },
  ctrl: { alignItems: 'center', gap: 10, width: 72 },
  ctrlBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#1C1C21', alignItems: 'center', justifyContent: 'center' },
  ctrlBtnOn: { backgroundColor: '#FFFFFF' },
  ctrlLabel: { fontSize: 13, color: '#D1D1D6' },
  endBtn: { alignSelf: 'center', marginTop: 32, width: 78, height: 78, borderRadius: 39, backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center' },

  sheet: { flex: 1, backgroundColor: '#F7F7F5', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingBottom: 22 },
  sheetHandleArea: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  sheetHandle: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#D6D3D1' },
  sheetTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sheetTitle: { fontSize: 22, fontWeight: '700', color: '#18181B' },
  holdBtn: { height: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: '#18181B', flexDirection: 'row', alignItems: 'center', gap: 8 },
  holdBtnOn: { backgroundColor: ACCENT },
  holdText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },

  needs: { backgroundColor: '#E7F8F0', borderWidth: 1, borderColor: '#9FDDC2', borderRadius: 18, padding: 16, gap: 6 },
  needsHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  needsHeadText: { fontSize: 13, fontWeight: '700', color: '#0B5C3F' },
  needsBig: { fontSize: 21, lineHeight: 27, fontWeight: '700', color: '#0B2E21' },
  needsHint: { fontSize: 14, color: '#2F5F4B' },
  replyBtn: { minHeight: 52, justifyContent: 'center', paddingHorizontal: 18, borderRadius: 16, borderWidth: 1.5, borderColor: '#D6D3D1', backgroundColor: '#FFFFFF' },
  replyText: { fontSize: 16, fontWeight: '600', color: '#18181B' },
  replyDone: { minHeight: 52, justifyContent: 'center', paddingHorizontal: 18, borderRadius: 16, backgroundColor: '#18181B' },
  replyDoneText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },

  card: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E7E5E4', borderRadius: 18, padding: 16, gap: 12 },
  cardLabel: { fontSize: 13, fontWeight: '600', color: '#57534E' },
  capWho: { fontSize: 12, fontWeight: '700' },
  capMain: { fontSize: 16, lineHeight: 22, color: '#18181B' },
  capOrig: { fontSize: 13, color: '#57534E' },
  warn: { backgroundColor: '#FFF7E6', borderWidth: 1, borderColor: '#F2D08A', borderRadius: 18, padding: 14, gap: 4 },
  warnTitle: { fontSize: 15, fontWeight: '700', color: '#5C3700' },
  warnText: { fontSize: 14, color: '#6B4300' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 28 },
  rowLabel: { width: 76, fontSize: 14, color: '#57534E' },
  rowValue: { flex: 1, fontSize: 15, fontWeight: '600', color: '#18181B' },
  endOutline: { height: 50, borderRadius: 25, borderWidth: 1.5, borderColor: '#E5484D', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  endOutlineText: { color: '#C4262E', fontSize: 16, fontWeight: '600' },

  outPill: { alignSelf: 'center', marginHorizontal: 24, marginBottom: 14, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 16, backgroundColor: '#3A2A0A' },
  outText: { fontSize: 14, fontWeight: '600', color: '#F5C26B', textAlign: 'center' },
  endedWrap: { flex: 1, alignItems: 'center', paddingTop: 84, paddingHorizontal: 22, paddingBottom: 30 },
  endedBadge: { width: 128, height: 128, borderRadius: 64, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  endedTitle: { marginTop: 22, fontSize: 34, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.6 },
  endedSub: { marginTop: 8, fontSize: 18, color: '#C7C7CC' },
  endedCard: { marginTop: 28, alignSelf: 'stretch', backgroundColor: '#FFFFFF', borderRadius: 22, paddingVertical: 18, paddingHorizontal: 20, gap: 10 },
  endedPlan: { fontSize: 22, fontWeight: '700', color: '#18181B' },
  endedPrice: { fontSize: 24, fontWeight: '800', color: '#18181B' },
  endedMeta: { marginTop: 18, fontSize: 14, color: '#A1A1AA' },
  nextBtn: { alignSelf: 'stretch', height: 56, borderRadius: 28, backgroundColor: ACCENT, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  nextText: { color: '#050507', fontSize: 18, fontWeight: '700' },
  secondaryBtn: { alignSelf: 'stretch', height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: '#3A3A40', alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  secondaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
