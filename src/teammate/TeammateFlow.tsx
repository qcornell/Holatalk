/**
 * Call Ana from home: the once-a-day "any price or promo changes?" check when it's due, then the
 * call. "Next door" goes back home.
 */
import React, { useState } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { TeammateSettings } from './settings';
import { needsDailyCheck, offerSummary, today } from './settings';
import TeammateSetupScreen from './TeammateSetupScreen';
import TeammateCallScreen from './TeammateCallScreen';
import type { CallResult } from './useTeammateCall';
import { BackIcon } from './icons';
import { C } from '../main/ui';

type Step = 'check' | 'edit' | 'call';

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
        <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back" style={st.back}>
          <BackIcon size={20} />
        </Pressable>
        <Text style={st.kicker}>Before your first door</Text>
        <Text style={st.bigTitle} accessibilityRole="header">
          {s.industry === 'ministry' ? 'Any changes to the invitation today?' : 'Any price or promo changes today?'}
        </Text>
      </View>
      <View style={st.checkSheet}>
        <View style={st.card}>
          <Text style={st.cardLabel}>What {s.assistantName || 'Ana'} will tell customers</Text>
          {offerSummary(s).map((r) => (
            <View key={r.label} style={st.sumRow}>
              <Text style={st.sumLabel}>{r.label}</Text>
              <Text style={st.sumValue}>{r.value}</Text>
            </View>
          ))}
          <View style={st.hr} />
          <Text style={st.cardMeta}>Last checked {prettyDay(s.reviewedOn)}</Text>
        </View>
        <Text style={st.note}>
          {s.industry === 'ministry'
            ? `${s.assistantName || 'Ana'} only shares what's here.`
            : `${s.assistantName || 'Ana'} only quotes what's here. Expired promos drop off on their own.`}
        </Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={onSame} accessibilityRole="button" style={({ pressed }) => [st.primary, pressed && { opacity: 0.85 }]}>
          <Text style={st.primaryText}>No, all the same. Call {s.assistantName || 'Ana'}</Text>
        </Pressable>
        <Pressable onPress={onChange} accessibilityRole="button" style={({ pressed }) => [st.outline, pressed && { opacity: 0.7 }]}>
          <Text style={st.outlineText}>{s.industry === 'ministry' ? 'Yes, update the details' : 'Yes, update prices'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

export default function TeammateFlow({
  settings,
  onSave,
  onExit,
  onPlans,
}: {
  settings: TeammateSettings;
  /** Saves the setup (the daily check stamps today's date) */
  onSave: (s: TeammateSettings) => Promise<void>;
  /** Back home; with how the call went when there was one */
  onExit: (result?: CallResult) => void;
  /** Out of minutes or no plan: go to the plans */
  onPlans: () => void;
}) {
  const [step, setStep] = useState<Step>(() => (needsDailyCheck(settings) ? 'check' : 'call'));
  const [callKey, setCallKey] = useState(0);

  const checked = async (next: TeammateSettings) => {
    await onSave({ ...next, reviewedOn: today() }); // saving your prices counts as today's check
    setCallKey((k) => k + 1);
    setStep('call');
  };

  if (step === 'check') {
    return <DailyCheck s={settings} onSame={() => checked(settings)} onChange={() => setStep('edit')} onBack={() => onExit()} />;
  }
  if (step === 'edit') {
    return (
      <TeammateSetupScreen
        initial={settings}
        title={settings.industry === 'ministry' ? 'The invitation' : "Today's prices"}
        sections={settings.industry === 'ministry' ? ['questions'] : ['prices']}
        onSave={checked}
        onBack={() => setStep('check')}
      />
    );
  }
  return (
    <TeammateCallScreen key={callKey} settings={settings} onDone={(r) => onExit(r)} onRetry={() => setCallKey((k) => k + 1)} onPlans={onPlans} />
  );
}

const st = StyleSheet.create({
  dark: { flex: 1, backgroundColor: C.ground },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.chip, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  checkTop: { paddingTop: 8, paddingHorizontal: 24, paddingBottom: 28, gap: 8 },
  kicker: { fontSize: 15, fontWeight: '600', color: C.accent },
  bigTitle: { fontSize: 32, lineHeight: 37, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.6 },
  checkSheet: { flex: 1, backgroundColor: C.sheet, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 22, paddingHorizontal: 20, paddingBottom: 30, gap: 14 },
  card: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: C.line, borderRadius: 18, paddingVertical: 16, paddingHorizontal: 18, gap: 12 },
  cardLabel: { fontSize: 13, fontWeight: '600', color: C.muted },
  sumRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  sumLabel: { flex: 1, fontSize: 16, lineHeight: 21, color: C.ink2 },
  sumValue: { fontSize: 17, fontWeight: '700', color: C.ink },
  hr: { height: 1, backgroundColor: C.line },
  cardMeta: { fontSize: 14, color: C.muted },
  note: { fontSize: 15, lineHeight: 21, color: C.muted },
  primary: { minHeight: 58, borderRadius: 29, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryText: { fontSize: 18, fontWeight: '700', color: C.ground },
  outline: { height: 58, borderRadius: 29, borderWidth: 1.5, borderColor: C.ink, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  outlineText: { fontSize: 18, fontWeight: '700', color: C.ink },
});
