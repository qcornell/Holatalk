/**
 * Teammate mode from the home screen: first-time setup, the once-a-day "any price or promo
 * changes?" check, the ready screen, then the call. "Next door" comes back to the ready screen.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { UserSetup } from '../config/storage';
import type { TeammateSettings } from './settings';
import {
  defaultSettings,
  loadTeammateSettings,
  needsDailyCheck,
  offerSummary,
  saveTeammateSettings,
  today,
} from './settings';
import TeammateSetupScreen from './TeammateSetupScreen';
import TeammateCallScreen from './TeammateCallScreen';
import { BackIcon, CheckIcon, ChevronRightIcon } from './icons';

const ACCENT = '#30D59B';

type Step = 'loading' | 'setup' | 'check' | 'ready' | 'call';

function prettyDay(iso: string): string {
  if (!iso) return 'not yet';
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const diff = Math.round((new Date(today()).getTime() - new Date(iso).getTime()) / 86400000);
  const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return diff === 1 ? `yesterday, ${label}` : label;
}

function DailyCheck({ s, onSame, onChange, onBack }: { s: TeammateSettings; onSame: () => void; onChange: () => void; onBack: () => void }) {
  return (
    <SafeAreaView style={st.dark} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />
      <View style={st.checkTop}>
        <Pressable onPress={onBack} hitSlop={12} accessibilityLabel="Back" style={{ marginBottom: 18 }}>
          <BackIcon />
        </Pressable>
        <Text style={st.kicker}>Before your first door</Text>
        <Text style={st.bigTitle}>Any price or promo changes today?</Text>
      </View>
      <View style={st.checkSheet}>
        <View style={st.card}>
          <Text style={st.cardLabel}>What Ana will tell customers</Text>
          {offerSummary(s).map((r) => (
            <View key={r.label} style={st.sumRow}>
              <Text style={st.sumLabel}>{r.label}</Text>
              <Text style={st.sumValue}>{r.value}</Text>
            </View>
          ))}
          <View style={st.hr} />
          <Text style={st.cardMeta}>Last checked {prettyDay(s.reviewedOn)}</Text>
        </View>
        <Text style={st.note}>Ana only quotes what's here. Expired promos drop off on their own.</Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={onSame} style={({ pressed }) => [st.primary, pressed && { opacity: 0.85 }]}>
          <Text style={st.primaryText}>No, all the same</Text>
        </Pressable>
        <Pressable onPress={onChange} style={({ pressed }) => [st.outline, pressed && { opacity: 0.7 }]}>
          <Text style={st.outlineText}>Yes, update prices</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Ready({
  s,
  first,
  onGo,
  onEdit,
  onBack,
}: {
  s: TeammateSettings;
  first: boolean;
  onGo: () => void;
  onEdit: () => void;
  onBack: () => void;
}) {
  const pop = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 5, useNativeDriver: true }).start();
  }, [pop]);
  const prices = s.plans[0]?.priceOptions.length
    ? s.plans[0].priceOptions.map((o) => `$${o.priceMonthly} ${o.how.toLowerCase().startsWith('autopay') ? 'with autopay' : 'with ' + o.how.toLowerCase()}`).join(', ')
    : `$${s.plans[0]?.priceMonthly ?? ''} a month`;
  return (
    <SafeAreaView style={st.dark}>
      <StatusBar barStyle="light-content" />
      <View style={st.readyWrap}>
        <Pressable onPress={onBack} hitSlop={12} accessibilityLabel="Back to Hola" style={st.readyBack}>
          <BackIcon />
        </Pressable>
        <View style={st.badgeWrap}>
          <View style={[st.dot, { left: 8, top: 26, width: 10, height: 10, backgroundColor: '#F5A524' }]} />
          <View style={[st.dot, { right: 4, top: 44, width: 8, height: 8, backgroundColor: '#60A5FA' }]} />
          <View style={[st.dot, { left: 20, bottom: 18, width: 7, height: 7, backgroundColor: '#F472B6' }]} />
          <View style={[st.dot, { right: 20, bottom: 8, width: 11, height: 11, backgroundColor: ACCENT }]} />
          <Animated.View style={[st.badge, { transform: [{ scale: pop }] }]}>
            <CheckIcon size={64} color="#050507" />
          </Animated.View>
        </View>
        <Text style={st.readyTitle}>{first ? "Ana's ready" : "You're set for today"}</Text>
        <Text style={st.readySub}>
          Prices checked {prettyDay(s.reviewedOn)}. Ana will quote {prices}.
        </Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={onGo} style={({ pressed }) => [st.primary, st.goBtn, pressed && { opacity: 0.85 }]}>
          <Text style={st.goText}>Go live</Text>
          <ChevronRightIcon />
        </Pressable>
        <Pressable onPress={onEdit} hitSlop={8} style={{ marginTop: 16 }}>
          <Text style={st.editLink}>Edit Ana's setup</Text>
        </Pressable>
        <Text style={st.tomorrow}>We'll ask about prices again tomorrow.</Text>
      </View>
    </SafeAreaView>
  );
}

export default function TeammateFlow({ userSetup, onExit }: { userSetup: UserSetup | null; onExit: () => void }) {
  const [step, setStep] = useState<Step>('loading');
  const [settings, setSettings] = useState<TeammateSettings | null>(null);
  const [first, setFirst] = useState(false);
  const [callKey, setCallKey] = useState(0);

  useEffect(() => {
    (async () => {
      const saved = await loadTeammateSettings();
      if (!saved) {
        setSettings(defaultSettings(userSetup?.repName || 'Quentin', userSetup?.companyName || ''));
        setFirst(true);
        setStep('setup');
        return;
      }
      setSettings(saved);
      setStep(needsDailyCheck(saved) ? 'check' : 'ready');
    })();
  }, [userSetup]);

  const save = async (next: TeammateSettings) => {
    const stamped = { ...next, reviewedOn: today() }; // saving your prices counts as today's check
    await saveTeammateSettings(stamped);
    setSettings(stamped);
    setStep('ready');
  };

  if (step === 'loading' || !settings) return <View style={st.dark} />;

  if (step === 'setup') {
    return <TeammateSetupScreen initial={settings} onSave={save} onBack={() => (first ? onExit() : setStep('ready'))} />;
  }
  if (step === 'check') {
    return (
      <DailyCheck
        s={settings}
        onSame={() => save(settings)}
        onChange={() => setStep('setup')}
        onBack={onExit}
      />
    );
  }
  if (step === 'call') {
    return (
      <TeammateCallScreen
        key={callKey}
        settings={settings}
        onDone={() => {
          setFirst(false);
          setStep(needsDailyCheck(settings) ? 'check' : 'ready');
        }}
        onRetry={() => setCallKey((k) => k + 1)}
      />
    );
  }
  return (
    <Ready
      s={settings}
      first={first}
      onGo={() => {
        setCallKey((k) => k + 1);
        setStep('call');
      }}
      onEdit={() => setStep('setup')}
      onBack={onExit}
    />
  );
}

const st = StyleSheet.create({
  dark: { flex: 1, backgroundColor: '#050507' },
  checkTop: { paddingTop: 24, paddingHorizontal: 24, paddingBottom: 28, gap: 8 },
  kicker: { fontSize: 15, fontWeight: '600', color: ACCENT },
  bigTitle: { fontSize: 32, lineHeight: 37, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.6 },
  checkSheet: { flex: 1, backgroundColor: '#F7F7F5', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 22, paddingHorizontal: 20, paddingBottom: 30, gap: 14 },
  card: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E7E5E4', borderRadius: 18, paddingVertical: 16, paddingHorizontal: 18, gap: 12 },
  cardLabel: { fontSize: 13, fontWeight: '600', color: '#57534E' },
  sumRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  sumLabel: { flex: 1, fontSize: 16, lineHeight: 21, color: '#3F3F46' },
  sumValue: { fontSize: 17, fontWeight: '700', color: '#18181B' },
  hr: { height: 1, backgroundColor: '#E7E5E4' },
  cardMeta: { fontSize: 14, color: '#57534E' },
  note: { fontSize: 15, lineHeight: 21, color: '#57534E' },
  primary: { height: 58, borderRadius: 29, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 18, fontWeight: '700', color: '#050507' },
  outline: { height: 58, borderRadius: 29, borderWidth: 1.5, borderColor: '#18181B', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  outlineText: { fontSize: 18, fontWeight: '700', color: '#18181B' },
  readyWrap: { flex: 1, alignItems: 'center', paddingTop: 72, paddingHorizontal: 22, paddingBottom: 30 },
  readyBack: { position: 'absolute', top: 16, left: 20 },
  badgeWrap: { width: 168, height: 168, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', borderRadius: 6 },
  badge: { width: 128, height: 128, borderRadius: 64, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  readyTitle: { marginTop: 24, fontSize: 34, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.6, textAlign: 'center' },
  readySub: { marginTop: 10, fontSize: 18, lineHeight: 25, color: '#C7C7CC', textAlign: 'center' },
  goBtn: { alignSelf: 'stretch', height: 60, borderRadius: 30, flexDirection: 'row', gap: 10 },
  goText: { fontSize: 19, fontWeight: '700', color: '#050507' },
  editLink: { fontSize: 15, fontWeight: '600', color: '#FFFFFF', textDecorationLine: 'underline' },
  tomorrow: { marginTop: 12, fontSize: 14, color: '#A1A1AA' },
});
