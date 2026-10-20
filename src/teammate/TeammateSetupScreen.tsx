/**
 * Teammate setup: everything Ana may say. Prefilled with your current offer; blanks mean
 * "Ana asks you" instead of guessing.
 */
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PriceOption, Promo, TeammateSettings } from './settings';
import { FACT_TOPICS } from './settings';
import { BackIcon, CheckIcon, ChevronDownIcon, PlusIcon, TabletIcon, TrashIcon, MicIcon } from './icons';

const GREEN = '#0B7A54';

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  keyboard,
  hint,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboard?: 'default' | 'decimal-pad' | 'url';
  hint?: string;
}) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput
        style={[s.input, multiline && s.inputMulti]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#A8A29E"
        multiline={multiline}
        keyboardType={keyboard ?? 'default'}
        autoCapitalize={keyboard === 'url' ? 'none' : 'sentences'}
        autoCorrect={keyboard !== 'url'}
      />
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {sub ? <Text style={s.sectionSub}>{sub}</Text> : null}
      <View style={{ gap: 12, marginTop: 6 }}>{children}</View>
    </View>
  );
}

const num = (t: string) => {
  const n = parseFloat(t.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export default function TeammateSetupScreen({
  initial,
  onSave,
  onBack,
}: {
  initial: TeammateSettings;
  onSave: (s: TeammateSettings) => void;
  onBack: () => void;
}) {
  const [v, setV] = useState<TeammateSettings>(initial);
  const [open, setOpen] = useState<string | null>(null);
  const set = (p: Partial<TeammateSettings>) => setV((cur) => ({ ...cur, ...p }));
  const plan = v.plans[0] ?? { name: 'Internet', speed: '', priceMonthly: 0, priceOptions: [] };
  const setPlan = (p: Partial<typeof plan>) => set({ plans: [{ ...plan, ...p }, ...v.plans.slice(1)] });
  const setOption = (i: number, p: Partial<PriceOption>) =>
    setPlan({ priceOptions: plan.priceOptions.map((o, j) => (j === i ? { ...o, ...p } : o)) });
  const setPromo = (i: number, p: Partial<Promo>) => set({ promos: v.promos.map((o, j) => (j === i ? { ...o, ...p } : o)) });
  const setFact = (topic: string, q: string, a: string) =>
    set({ facts: { ...v.facts, [topic]: { ...(v.facts[topic] ?? {}), [q]: a } } });

  const canSave = v.repName.trim() && v.pitch.trim() && (plan.priceOptions.length ? plan.priceOptions.every((o) => o.priceMonthly > 0) : plan.priceMonthly > 0);

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" />
      <View style={s.top}>
        <Pressable onPress={onBack} hitSlop={12} style={s.back} accessibilityLabel="Back">
          <BackIcon color="#18181B" />
        </Pressable>
        <Text style={s.title}>Ana's setup</Text>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Text style={s.lead}>Ana only says what's here. Leave anything blank and she'll ask you instead of guessing.</Text>

          <Section title="You">
            <Field label="Your first name" value={v.repName} onChange={(t) => set({ repName: t })} placeholder="Quentin" />
            <Field label="Company (optional)" value={v.companyName} onChange={(t) => set({ companyName: t })} placeholder="Optimum" />
          </Section>

          <Section title="Your pitch" sub="Ana says this in Spanish right after hello. Write it how you'd say it.">
            <Field value={v.pitch} onChange={(t) => set({ pitch: t })} multiline placeholder="Ofrecemos internet aquí en el área por solo $35 al mes…" />
          </Section>

          <Section title="Prices" sub="If how they pay changes the price, add each way to pay.">
            <Field label="Plan name" value={plan.name} onChange={(t) => setPlan({ name: t })} placeholder="Internet" />
            {plan.priceOptions.length === 0 ? (
              <Field
                label="Price per month"
                value={plan.priceMonthly ? String(plan.priceMonthly) : ''}
                onChange={(t) => setPlan({ priceMonthly: num(t) })}
                keyboard="decimal-pad"
                placeholder="35"
              />
            ) : null}
            {plan.priceOptions.map((o, i) => (
              <View key={i} style={s.optionBox}>
                <View style={s.optionHead}>
                  <Text style={s.optionTitle}>Way to pay {i + 1}</Text>
                  <Pressable onPress={() => setPlan({ priceOptions: plan.priceOptions.filter((_, j) => j !== i) })} hitSlop={10} accessibilityLabel="Remove this way to pay">
                    <TrashIcon />
                  </Pressable>
                </View>
                <Field label="How they pay (English)" value={o.how} onChange={(t) => setOption(i, { how: t })} placeholder="Autopay from a checking account" />
                <Field label="How Ana says it (Spanish)" value={o.howEs} onChange={(t) => setOption(i, { howEs: t })} placeholder="pago automático de su cuenta de cheques" />
                <Field label="Price per month" value={o.priceMonthly ? String(o.priceMonthly) : ''} onChange={(t) => setOption(i, { priceMonthly: num(t) })} keyboard="decimal-pad" placeholder="35" />
              </View>
            ))}
            <Pressable
              onPress={() => setPlan({ priceOptions: [...plan.priceOptions, { how: '', howEs: '', priceMonthly: 0 }] })}
              style={({ pressed }) => [s.addBtn, pressed && { opacity: 0.7 }]}
            >
              <PlusIcon />
              <Text style={s.addText}>Add a way to pay</Text>
            </Pressable>
          </Section>

          <Section title="Install and contract">
            <Field
              label="Install fee ($, 0 = free)"
              value={String(v.installationFee)}
              onChange={(t) => set({ installationFee: num(t) })}
              keyboard="decimal-pad"
            />
            <View style={s.switchRow}>
              <Text style={s.switchLabel}>There's a contract</Text>
              <Switch value={v.hasContract} onValueChange={(b) => set({ hasContract: b })} trackColor={{ true: GREEN }} />
            </View>
          </Section>

          <Section title="Promos" sub="Add an end date and Ana stops mentioning it after that day.">
            {v.promos.map((p, i) => (
              <View key={i} style={s.optionBox}>
                <View style={s.optionHead}>
                  <Text style={s.optionTitle}>Promo {i + 1}</Text>
                  <Pressable onPress={() => set({ promos: v.promos.filter((_, j) => j !== i) })} hitSlop={10} accessibilityLabel="Remove this promo">
                    <TrashIcon />
                  </Pressable>
                </View>
                <Field label="What Ana says (Spanish)" value={p.descriptionEs} onChange={(t) => setPromo(i, { descriptionEs: t })} placeholder="Primer mes gratis" />
                <Field label="In English (for your captions)" value={p.description} onChange={(t) => setPromo(i, { description: t })} placeholder="First month free" />
                <Field label="Ends (YYYY-MM-DD, optional)" value={p.expiresAt} onChange={(t) => setPromo(i, { expiresAt: t.trim() })} placeholder="2026-12-31" keyboard="url" />
              </View>
            ))}
            <Pressable onPress={() => set({ promos: [...v.promos, { descriptionEs: '', description: '', expiresAt: '' }] })} style={({ pressed }) => [s.addBtn, pressed && { opacity: 0.7 }]}>
              <PlusIcon />
              <Text style={s.addText}>Add a promo</Text>
            </Pressable>
          </Section>

          <Section title="When they say yes">
            {([
              ['tablet', 'They type it on my tablet', 'Ana hands off and you pass them the tablet for name, number and email.'],
              ['voice', 'Ana asks for it out loud', 'She reads it back and saves it once they say yes.'],
            ] as const).map(([key, title, sub]) => {
              const on = v.signupBy === key;
              return (
                <Pressable key={key} onPress={() => set({ signupBy: key })} style={[s.choice, on && s.choiceOn]} accessibilityState={{ selected: on }}>
                  {key === 'tablet' ? <TabletIcon size={22} color={on ? GREEN : '#57534E'} /> : <MicIcon size={22} color={on ? GREEN : '#57534E'} />}
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.choiceTitle}>{title}</Text>
                    <Text style={s.choiceSub}>{sub}</Text>
                  </View>
                  {on ? <CheckIcon size={20} /> : null}
                </Pressable>
              );
            })}
          </Section>

          <Section title="Your quick replies" sub="Buttons you can tap when Ana checks in with you.">
            {v.checkInReplies.map((r, i) => (
              <View key={i} style={s.replyRow}>
                <View style={{ flex: 1 }}>
                  <Field value={r} onChange={(t) => set({ checkInReplies: v.checkInReplies.map((x, j) => (j === i ? t : x)) })} />
                </View>
                <Pressable onPress={() => set({ checkInReplies: v.checkInReplies.filter((_, j) => j !== i) })} hitSlop={10} accessibilityLabel="Remove this reply">
                  <TrashIcon />
                </Pressable>
              </View>
            ))}
            <Pressable onPress={() => set({ checkInReplies: [...v.checkInReplies, ''] })} style={({ pressed }) => [s.addBtn, pressed && { opacity: 0.7 }]}>
              <PlusIcon />
              <Text style={s.addText}>Add a reply</Text>
            </Pressable>
          </Section>

          <Section title="Customer questions" sub="Answer what you know. Blank ones, Ana asks you out loud.">
            {Object.entries(FACT_TOPICS).map(([topic, questions]) => {
              const answered = questions.filter((q) => (v.facts[topic]?.[q] ?? '').trim()).length;
              const isOpen = open === topic;
              return (
                <View key={topic} style={s.topic}>
                  <Pressable onPress={() => setOpen(isOpen ? null : topic)} style={s.topicHead}>
                    <Text style={s.topicTitle}>{topic}</Text>
                    <Text style={s.topicCount}>
                      {answered} of {questions.length}
                    </Text>
                    <View style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }}>
                      <ChevronDownIcon />
                    </View>
                  </Pressable>
                  {isOpen ? (
                    <View style={{ gap: 12, paddingTop: 4 }}>
                      {questions.map((q) => (
                        <Field key={q} label={q} value={v.facts[topic]?.[q] ?? ''} onChange={(t) => setFact(topic, q, t)} placeholder="Blank: Ana asks you" />
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </Section>

          <Section title="Connection" sub="How the app reaches Ana. For testing, paste the development token server ID from cloud.livekit.io (Settings).">
            <Field
              label="LiveKit token server ID"
              value={v.connection.tokenServerId}
              onChange={(t) => set({ connection: { ...v.connection, tokenServerId: t.trim() } })}
              keyboard="url"
              placeholder="From LiveKit Cloud, Settings"
            />
            <Field
              label="Start-call URL (later, instead of the ID)"
              value={v.connection.startUrl}
              onChange={(t) => set({ connection: { ...v.connection, startUrl: t.trim() } })}
              keyboard="url"
              placeholder="https://…supabase.co/functions/v1/start-live"
            />
            {v.connection.startUrl ? (
              <Field label="Access code" value={v.connection.accessCode} onChange={(t) => set({ connection: { ...v.connection, accessCode: t.trim() } })} keyboard="url" />
            ) : null}
          </Section>
          <View style={{ height: 96 }} />
        </ScrollView>
        <View style={s.footer}>
          {!canSave ? <Text style={s.footerHint}>Add your name, pitch and a price to save.</Text> : null}
          <Pressable
            disabled={!canSave}
            onPress={() => onSave(v)}
            style={({ pressed }) => [s.saveBtn, !canSave && { opacity: 0.4 }, pressed && { opacity: 0.85 }]}
          >
            <Text style={s.saveText}>Save</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F7F5' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E7E5E4', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: '#18181B' },
  scroll: { paddingHorizontal: 18, paddingBottom: 24, gap: 14 },
  lead: { fontSize: 15, lineHeight: 21, color: '#57534E' },
  section: { backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E7E5E4', padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#18181B' },
  sectionSub: { marginTop: 4, fontSize: 14, lineHeight: 19, color: '#57534E' },
  label: { fontSize: 14, fontWeight: '600', color: '#3F3F46' },
  input: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: '#D6D3D1', backgroundColor: '#FFFFFF', paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#18181B' },
  inputMulti: { minHeight: 120, textAlignVertical: 'top' },
  hint: { fontSize: 13, color: '#78716C' },
  optionBox: { gap: 10, backgroundColor: '#FAFAF9', borderRadius: 14, borderWidth: 1, borderColor: '#E7E5E4', padding: 12 },
  optionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  optionTitle: { fontSize: 14, fontWeight: '700', color: '#18181B' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1.5, borderColor: '#D6D3D1' },
  addText: { fontSize: 15, fontWeight: '600', color: '#18181B' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  switchLabel: { fontSize: 16, color: '#18181B' },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1.5, borderColor: '#E7E5E4', padding: 14 },
  choiceOn: { borderColor: GREEN, backgroundColor: '#E7F8F0' },
  choiceTitle: { fontSize: 16, fontWeight: '700', color: '#18181B' },
  choiceSub: { fontSize: 13, lineHeight: 18, color: '#57534E' },
  replyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  topic: { borderRadius: 14, borderWidth: 1, borderColor: '#E7E5E4', paddingHorizontal: 12, paddingVertical: 10 },
  topicHead: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 },
  topicTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: '#18181B' },
  topicCount: { fontSize: 13, fontWeight: '600', color: GREEN },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 28, backgroundColor: 'rgba(247,247,245,0.96)', borderTopWidth: 1, borderTopColor: '#E7E5E4', gap: 6 },
  footerHint: { fontSize: 13, color: '#78716C', textAlign: 'center' },
  saveBtn: { height: 56, borderRadius: 28, backgroundColor: '#18181B', alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
});
