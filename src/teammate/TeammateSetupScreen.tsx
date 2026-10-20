/**
 * Ana's setup, one part at a time (opened from Settings), or all of it. Everything Ana may say;
 * blanks mean "Ana asks you" instead of guessing.
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PriceOption, Promo, TeammateSettings } from './settings';
import { factTopics, isReady, withIndustry } from './settings';
import type { IndustryId } from './industries';
import { INDUSTRIES, defaultPitch, industry as industryPack } from './industries';
import { ChevronDownIcon, IndustryIcon, MicIcon, PlusIcon, TabletIcon, TrashIcon } from './icons';
import { Button, C, Choice, DarkHeader, Sheet } from '../main/ui';

export type SetupSection = 'you' | 'industry' | 'pitch' | 'prices' | 'signup' | 'replies' | 'questions' | 'connection';

const ALL: SetupSection[] = ['you', 'industry', 'pitch', 'prices', 'signup', 'replies', 'questions', 'connection'];

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
        placeholderTextColor={C.faint}
        multiline={multiline}
        keyboardType={keyboard ?? 'default'}
        autoCapitalize={keyboard === 'url' ? 'none' : 'sentences'}
        autoCorrect={keyboard !== 'url'}
        accessibilityLabel={label ?? placeholder}
      />
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
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
  sections = ALL,
  title = "Ana's setup",
}: {
  initial: TeammateSettings;
  onSave: (s: TeammateSettings) => void;
  onBack: () => void;
  sections?: SetupSection[];
  title?: string;
}) {
  const insets = useSafeAreaInsets();
  const [v, setV] = useState<TeammateSettings>(initial);
  const [open, setOpen] = useState<string | null>(null);
  const show = (k: SetupSection) => sections.includes(k);
  const pack = industryPack(v.industry);
  const set = (p: Partial<TeammateSettings>) => setV((cur) => ({ ...cur, ...p }));
  const plan = v.plans[0] ?? { name: pack.planName, speed: '', priceMonthly: 0, priceOptions: [] };
  const setPlan = (p: Partial<typeof plan>) => set({ plans: [{ ...plan, ...p }, ...v.plans.slice(1)] });
  const setOption = (i: number, p: Partial<PriceOption>) =>
    setPlan({ priceOptions: plan.priceOptions.map((o, j) => (j === i ? { ...o, ...p } : o)) });
  const setPromo = (i: number, p: Partial<Promo>) => set({ promos: v.promos.map((o, j) => (j === i ? { ...o, ...p } : o)) });
  const setFact = (topic: string, q: string, a: string) =>
    set({ facts: { ...v.facts, [topic]: { ...(v.facts[topic] ?? {}), [q]: a } } });
  const pickIndustry = (id: IndustryId) =>
    setV((cur) => {
      const next = withIndustry(cur, id);
      const p = industryPack(id);
      return {
        ...next,
        pitch: defaultPitch({
          industry: id,
          company: next.companyName,
          planName: p.planName,
          price: 0,
          freeInstall: p.hasInstall && next.installationFee === 0,
          noContract: p.hasInstall && !next.hasContract,
        }),
      };
    });

  const canSave = isReady(v);
  const per = pack.per === 'month' ? ' per month' : '';

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />
      <DarkHeader onBack={onBack} title={title} sub={show('questions') && sections.length === 1 ? 'Answer what you know. Blank ones, Ana asks you out loud.' : undefined} />
      <Sheet>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            {sections.length > 2 ? (
              <Text style={s.lead}>Ana only says what's here. Leave anything blank and she'll ask you instead of guessing.</Text>
            ) : null}

            {show('you') ? (
              <Section title="You">
                <Field label="Your first name" value={v.repName} onChange={(t) => set({ repName: t })} placeholder="Your name" />
                <Field label={pack.companyLabel} value={v.companyName} onChange={(t) => set({ companyName: t })} placeholder={pack.companyPlaceholder} />
              </Section>
            ) : null}

            {show('industry') ? (
              <Section title="What you sell" sub="Switching starts your prices, opener and questions over for the new kind of door.">
                {INDUSTRIES.map((ind) => (
                  <Choice
                    key={ind.id}
                    icon={<IndustryIcon id={ind.id} size={24} />}
                    title={ind.label}
                    sub={ind.sub}
                    on={v.industry === ind.id}
                    onPress={() => pickIndustry(ind.id)}
                  />
                ))}
              </Section>
            ) : null}

            {show('pitch') ? (
              <Section title="What Ana says first" sub="In Spanish, right after hello. Write it how you'd say it.">
                <Field value={v.pitch} onChange={(t) => set({ pitch: t })} multiline placeholder="Ofrecemos…" />
              </Section>
            ) : null}

            {show('prices') && pack.per !== 'none' ? (
              <Section
                title="Prices"
                sub={
                  pack.priceRequired
                    ? 'If how they pay changes the price, add each way to pay.'
                    : "Optional. With no price, Ana says you'll give them the quote."
                }
              >
                <Field label={v.industry === 'fundraiser' ? "What you're selling" : 'What you offer'} value={plan.name} onChange={(t) => setPlan({ name: t })} placeholder={pack.planName} />
                {plan.priceOptions.length === 0 ? (
                  <Field
                    label={`Price${per}`}
                    value={plan.priceMonthly ? String(plan.priceMonthly) : ''}
                    onChange={(t) => setPlan({ priceMonthly: num(t) })}
                    keyboard="decimal-pad"
                    placeholder={pack.pricePlaceholder}
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
                    <Field label="How Ana says it (Spanish, optional)" value={o.howEs} onChange={(t) => setOption(i, { howEs: t })} placeholder="pago automático de su cuenta de cheques" />
                    <Field label={`Price${per}`} value={o.priceMonthly ? String(o.priceMonthly) : ''} onChange={(t) => setOption(i, { priceMonthly: num(t) })} keyboard="decimal-pad" placeholder={pack.pricePlaceholder} />
                  </View>
                ))}
                <Pressable
                  onPress={() =>
                    setPlan({
                      priceOptions:
                        plan.priceOptions.length === 0 && plan.priceMonthly > 0
                          ? [{ how: '', howEs: '', priceMonthly: plan.priceMonthly }, { how: '', howEs: '', priceMonthly: 0 }]
                          : [...plan.priceOptions, { how: '', howEs: '', priceMonthly: 0 }],
                    })
                  }
                  style={({ pressed }) => [s.addBtn, pressed && { opacity: 0.7 }]}
                  accessibilityRole="button"
                >
                  <PlusIcon />
                  <Text style={s.addText}>Add a way to pay</Text>
                </Pressable>
              </Section>
            ) : null}

            {show('prices') && pack.hasInstall ? (
              <Section title="Install and contract">
                <Field
                  label="Install fee ($, 0 = free)"
                  value={String(v.installationFee)}
                  onChange={(t) => set({ installationFee: num(t) })}
                  keyboard="decimal-pad"
                />
                <View style={s.switchRow}>
                  <Text style={s.switchLabel}>There's a contract</Text>
                  <Switch value={v.hasContract} onValueChange={(b) => set({ hasContract: b })} trackColor={{ true: C.green }} />
                </View>
              </Section>
            ) : null}

            {show('prices') && pack.per !== 'none' ? (
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
                <Pressable onPress={() => set({ promos: [...v.promos, { descriptionEs: '', description: '', expiresAt: '' }] })} style={({ pressed }) => [s.addBtn, pressed && { opacity: 0.7 }]} accessibilityRole="button">
                  <PlusIcon />
                  <Text style={s.addText}>Add a promo</Text>
                </Pressable>
              </Section>
            ) : null}

            {show('signup') ? (
              <Section title="When they say yes">
                <Choice
                  icon={<TabletIcon size={22} color={v.signupBy === 'tablet' ? C.green : C.muted} />}
                  title="They type it on my tablet"
                  sub="Ana tells them in Spanish what to enter."
                  on={v.signupBy === 'tablet'}
                  onPress={() => set({ signupBy: 'tablet' })}
                />
                <Choice
                  icon={<MicIcon size={22} color={v.signupBy === 'voice' ? C.green : C.muted} />}
                  title="Ana asks for it out loud"
                  sub="She reads it back and saves it once they say yes."
                  on={v.signupBy === 'voice'}
                  onPress={() => set({ signupBy: 'voice' })}
                />
              </Section>
            ) : null}

            {show('replies') ? (
              <Section title="Your quick replies" sub={`Buttons you can tap when ${v.assistantName || 'Ana'} checks in with you.`}>
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
                <Pressable onPress={() => set({ checkInReplies: [...v.checkInReplies, ''] })} style={({ pressed }) => [s.addBtn, pressed && { opacity: 0.7 }]} accessibilityRole="button">
                  <PlusIcon />
                  <Text style={s.addText}>Add a reply</Text>
                </Pressable>
              </Section>
            ) : null}

            {show('questions') ? (
              <Section title="Customer questions" sub={sections.length > 1 ? 'Answer what you know. Blank ones, Ana asks you out loud.' : undefined}>
                {Object.entries(factTopics(v)).map(([topic, questions]) => {
                  const answered = questions.filter((q) => (v.facts[topic]?.[q] ?? '').trim()).length;
                  const isOpen = open === topic;
                  return (
                    <View key={topic} style={s.topic}>
                      <Pressable onPress={() => setOpen(isOpen ? null : topic)} style={s.topicHead} accessibilityRole="button" accessibilityState={{ expanded: isOpen }}>
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
            ) : null}

            {show('connection') ? (
              <Section title="Connection (testing)" sub="How the app reaches Ana until the Hola server is live. Paste the development token server ID from cloud.livekit.io (Settings).">
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
            ) : null}
          </ScrollView>
          <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
            {!canSave ? (
              <Text style={s.footerHint}>
                {pack.priceRequired ? 'Ana needs your name, an opener and a price to go out.' : 'Ana needs your name and an opener to go out.'}
              </Text>
            ) : null}
            <Button label="Save" onPress={() => onSave(v)} disabled={!canSave} />
          </View>
        </KeyboardAvoidingView>
      </Sheet>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.ground },
  scroll: { paddingTop: 20, paddingHorizontal: 18, paddingBottom: 24, gap: 14 },
  lead: { fontSize: 15, lineHeight: 21, color: C.muted },
  section: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: C.ink },
  sectionSub: { marginTop: 4, fontSize: 14, lineHeight: 19, color: C.muted },
  label: { fontSize: 14, fontWeight: '600', color: C.ink2 },
  input: { minHeight: 48, borderRadius: 12, borderWidth: 1.5, borderColor: C.field, backgroundColor: '#FFFFFF', paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: C.ink },
  inputMulti: { minHeight: 120, textAlignVertical: 'top' },
  hint: { fontSize: 13, color: '#78716C' },
  optionBox: { gap: 10, backgroundColor: '#FAFAF9', borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 12 },
  optionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  optionTitle: { fontSize: 14, fontWeight: '700', color: C.ink },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1.5, borderColor: C.field },
  addText: { fontSize: 15, fontWeight: '600', color: C.ink },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  switchLabel: { fontSize: 16, color: C.ink },
  replyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  topic: { borderRadius: 14, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, paddingVertical: 10 },
  topicHead: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  topicTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: C.ink },
  topicCount: { fontSize: 13, fontWeight: '600', color: C.green },
  footer: { paddingHorizontal: 18, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.sheet, gap: 6 },
  footerHint: { fontSize: 13, color: '#78716C', textAlign: 'center' },
});
