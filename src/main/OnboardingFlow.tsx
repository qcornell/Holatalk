/**
 * First-time setup in three steps: what you sell, about you, your prices. Ends with a ready
 * TeammateSettings (today's prices count as checked).
 */
import React, { useMemo, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { IndustryId } from '../teammate/industries';
import { INDUSTRIES, defaultPitch, industry as industryPack } from '../teammate/industries';
import type { TeammateSettings } from '../teammate/settings';
import { defaultSettings, isReady, today, withIndustry } from '../teammate/settings';
import { CheckIcon, IndustryIcon, MicIcon, PencilIcon, PlusIcon, TabletIcon, TrashIcon } from '../teammate/icons';
import { Button, C, Card, Choice, DarkHeader, Field, Sheet } from './ui';

const ANA = require('../../assets/teammate/ana.png');

export type Step = 'welcome' | 'industry' | 'basics' | 'offer';

interface PriceRow {
  price: string;
  how: string;
}

const num = (t: string) => {
  const n = parseFloat(t.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export default function OnboardingFlow({
  initial,
  onDone,
  startAt = 'welcome',
}: {
  /** Name and company from an older setup, if any */
  initial?: { repName?: string; companyName?: string };
  onDone: (s: TeammateSettings) => void;
  startAt?: Step;
}) {
  const [step, setStep] = useState<Step>(startAt);
  const [v, setV] = useState<TeammateSettings>(() => defaultSettings(initial?.repName ?? '', initial?.companyName ?? '', 'internet'));
  const [rows, setRows] = useState<PriceRow[]>([{ price: '', how: '' }]);
  const [ownPitch, setOwnPitch] = useState<string | null>(null);
  const [invite, setInvite] = useState({ when: '', where: '' });
  const pack = industryPack(v.industry);

  const set = (p: Partial<TeammateSettings>) => setV((cur) => ({ ...cur, ...p }));
  const pick = (id: IndustryId) => {
    setV((cur) => withIndustry(cur, id));
    setRows([{ price: '', how: '' }]);
    setOwnPitch(null);
  };

  const planName = v.plans[0]?.name ?? pack.planName;
  const lowest = rows.map((r) => num(r.price)).filter((n) => n > 0);
  const generated = defaultPitch({
    industry: v.industry,
    company: v.companyName,
    planName,
    price: lowest.length ? Math.min(...lowest) : 0,
    freeInstall: pack.hasInstall && v.installationFee === 0,
    noContract: pack.hasInstall && !v.hasContract,
  });
  const pitch = ownPitch ?? generated;

  const finished = useMemo((): TeammateSettings => {
    const priced = rows.filter((r) => num(r.price) > 0);
    const plans =
      pack.per === 'none'
        ? []
        : [
            {
              name: planName.trim() || pack.planName,
              speed: '',
              priceMonthly: priced.length ? Math.min(...priced.map((r) => num(r.price))) : 0,
              priceOptions:
                priced.length > 1 ? priced.map((r) => ({ how: r.how.trim() || 'Option', howEs: '', priceMonthly: num(r.price) })) : [],
            },
          ];
    let facts = v.facts;
    if (v.industry === 'ministry') {
      const topic = 'Your invitation';
      facts = {
        ...facts,
        [topic]: { ...facts[topic], 'Event or service, day and time': invite.when.trim(), Address: invite.where.trim() },
      };
    }
    return { ...v, plans, facts, pitch: pitch.trim(), reviewedOn: today() };
  }, [v, rows, planName, pitch, pack, invite]);

  const ready = isReady(finished) && (v.industry !== 'ministry' || invite.when.trim().length > 0);

  if (step === 'welcome') return <Welcome onStart={() => setStep('industry')} />;

  return (
    <SafeAreaView style={st.dark} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {step === 'industry' ? (
          <IndustryStep value={v.industry} onPick={pick} onBack={() => setStep('welcome')} onNext={() => setStep('basics')} />
        ) : step === 'basics' ? (
          <>
            <DarkHeader
              onBack={() => setStep('industry')}
              progress={{ step: 2, of: 3 }}
              kicker="Step 2 of 3"
              title="About you"
              sub={v.industry === 'ministry' ? 'Ana introduces you and your church by name.' : 'Ana introduces you and the company by name.'}
            />
            <Sheet>
              <ScrollView contentContainerStyle={st.sheetBody} keyboardShouldPersistTaps="handled">
                <Field
                  label="Your first name"
                  value={v.repName}
                  onChangeText={(t) => set({ repName: t })}
                  placeholder="Your name"
                  autoCapitalize="words"
                  autoCorrect={false}
                  textContentType="givenName"
                  hint={`When Ana needs you she says, "${v.repName.trim() || 'Your name'}, are you there?"`}
                />
                <Field
                  label={pack.companyLabel}
                  value={v.companyName}
                  onChangeText={(t) => set({ companyName: t })}
                  placeholder={pack.companyPlaceholder}
                  autoCapitalize="words"
                />
                <View style={{ gap: 10 }}>
                  <Text style={st.label}>How do people sign up?</Text>
                  <Choice
                    icon={<TabletIcon size={26} color={v.signupBy === 'tablet' ? C.green : C.muted} />}
                    title="They type it on my tablet"
                    sub="Ana tells them in Spanish what to enter"
                    on={v.signupBy === 'tablet'}
                    onPress={() => set({ signupBy: 'tablet' })}
                  />
                  <Choice
                    icon={<MicIcon size={26} color={v.signupBy === 'voice' ? C.green : C.muted} />}
                    title="Ana asks out loud"
                    sub="She gets name, phone and email for you"
                    on={v.signupBy === 'voice'}
                    onPress={() => set({ signupBy: 'voice' })}
                  />
                </View>
              </ScrollView>
              <Footer>
                <Button label="Continue" onPress={() => setStep('offer')} disabled={!v.repName.trim()} />
              </Footer>
            </Sheet>
          </>
        ) : (
          <>
            <DarkHeader
              onBack={() => setStep('basics')}
              progress={{ step: 3, of: 3 }}
              kicker="Step 3 of 3"
              title={v.industry === 'ministry' ? "What's the invitation?" : 'What does it cost?'}
              sub={v.industry === 'ministry' ? 'Ana only shares what you put here.' : "Ana only quotes what's here. You can change it any day."}
            />
            <Sheet>
              <ScrollView contentContainerStyle={st.sheetBody} keyboardShouldPersistTaps="handled">
                {pack.per === 'none' ? (
                  <Card style={st.cardPad}>
                    <Field
                      label="What and when"
                      value={invite.when}
                      onChangeText={(t) => setInvite((x) => ({ ...x, when: t }))}
                      placeholder="Sunday service, 10 AM"
                    />
                    <Field
                      label="Where (optional)"
                      value={invite.where}
                      onChangeText={(t) => setInvite((x) => ({ ...x, where: t }))}
                      placeholder="1234 Main St"
                    />
                  </Card>
                ) : (
                  <Card style={st.cardPad}>
                    <View style={st.planHead}>
                      <View style={st.noShrink}>
                        <IndustryIcon id={v.industry} size={22} />
                      </View>
                      <TextInput
                        value={planName}
                        onChangeText={(t) => set({ plans: [{ ...(v.plans[0] ?? { speed: '', priceMonthly: 0, priceOptions: [] }), name: t }] })}
                        style={st.planName}
                        accessibilityLabel={v.industry === 'fundraiser' ? "What you're selling" : 'What you offer'}
                        placeholder={pack.planName}
                        placeholderTextColor={C.faint}
                      />
                      <View style={st.noShrink}>
                        <PencilIcon size={16} color={C.faint} />
                      </View>
                    </View>
                    {rows.map((r, i) => (
                      <View key={i} style={st.priceRow}>
                        <View style={st.priceBox}>
                          <Text style={st.dollar}>$</Text>
                          <TextInput
                            value={r.price}
                            onChangeText={(t) => setRows((x) => x.map((y, j) => (j === i ? { ...y, price: t.replace(/[^0-9.]/g, '') } : y)))}
                            keyboardType="decimal-pad"
                            placeholder={pack.pricePlaceholder}
                            placeholderTextColor={C.faint}
                            style={st.priceInput}
                            accessibilityLabel={rows.length > 1 ? `Price ${i + 1}` : 'Price'}
                          />
                          {pack.per === 'month' ? <Text style={st.per}>/mo</Text> : null}
                        </View>
                        <TextInput
                          value={r.how}
                          onChangeText={(t) => setRows((x) => x.map((y, j) => (j === i ? { ...y, how: t } : y)))}
                          placeholder={rows.length > 1 ? (i === 0 ? 'Autopay from checking' : 'Debit card') : 'How they pay'}
                          placeholderTextColor={C.faint}
                          style={st.howInput}
                          accessibilityLabel={`How they pay, price ${i + 1}`}
                        />
                        {rows.length > 1 ? (
                          <Pressable onPress={() => setRows((x) => x.filter((_, j) => j !== i))} hitSlop={10} accessibilityLabel="Remove this price">
                            <TrashIcon />
                          </Pressable>
                        ) : null}
                      </View>
                    ))}
                    <Pressable onPress={() => setRows((x) => [...x, { price: '', how: '' }])} style={st.addLink} accessibilityRole="button">
                      <PlusIcon color={C.green} />
                      <Text style={st.addText}>Add a price for another way to pay</Text>
                    </Pressable>
                    {!pack.priceRequired ? <Text style={st.note}>Optional. With no price, Ana says you'll give them the quote.</Text> : null}
                  </Card>
                )}

                {pack.hasInstall ? (
                  <Card style={{ paddingHorizontal: 16 }}>
                    <View style={[st.toggleRow, st.rowLine]}>
                      <Text style={st.toggleLabel}>Install fee</Text>
                      <View style={st.feeBox}>
                        <Text style={st.feeDollar}>$</Text>
                        <TextInput
                          value={v.installationFee ? String(v.installationFee) : ''}
                          onChangeText={(t) => set({ installationFee: num(t) })}
                          keyboardType="decimal-pad"
                          placeholder="0"
                          placeholderTextColor={C.faint}
                          style={st.feeInput}
                          accessibilityLabel="Install fee in dollars, blank for free"
                        />
                      </View>
                      <Text style={st.feeNote}>{v.installationFee ? '' : 'Free'}</Text>
                    </View>
                    <View style={st.toggleRow}>
                      <Text style={st.toggleLabel}>There's a contract</Text>
                      <Switch value={v.hasContract} onValueChange={(b) => set({ hasContract: b })} trackColor={{ true: C.green }} />
                    </View>
                  </Card>
                ) : null}

                <Card style={st.cardPad}>
                  <View style={st.pitchHead}>
                    <Text style={st.pitchLabel}>What Ana says first</Text>
                    <Pressable
                      onPress={() => setOwnPitch(ownPitch === null ? pitch : null)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={ownPitch === null ? 'Edit what Ana says first' : 'Use the suggested opener'}
                    >
                      <Text style={st.pitchEdit}>{ownPitch === null ? 'Edit' : 'Use suggested'}</Text>
                    </Pressable>
                  </View>
                  {ownPitch === null ? (
                    <Text style={st.pitchText}>{pitch}</Text>
                  ) : (
                    <TextInput
                      value={ownPitch}
                      onChangeText={setOwnPitch}
                      multiline
                      style={st.pitchInput}
                      accessibilityLabel="What Ana says first, in Spanish"
                    />
                  )}
                  <Text style={st.note}>In Spanish, right after she says hello. Write it the way you'd say it.</Text>
                </Card>

                <Text style={st.note}>
                  Questions like deposits, IDs or how long things take can wait. Until you answer them in Settings, Ana asks you at the door.
                </Text>
              </ScrollView>
              <Footer>
                <Button label="Finish setup" kind="accent" onPress={() => onDone(finished)} disabled={!ready} />
              </Footer>
            </Sheet>
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={[st.footer, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>{children}</View>;
}

function Welcome({ onStart }: { onStart: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaView style={st.dark} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={[st.welcome, { paddingBottom: Math.max(insets.bottom, 16) + 18 }]} bounces={false}>
        <View style={st.brandRow}>
          <View style={st.brandDot} />
          <Text style={st.brand}>Hola D2D</Text>
        </View>
        <View style={st.welcomeBody}>
          <View style={st.avatarWrap}>
            <View style={st.avatarRing} />
            <Image source={ANA} style={st.avatar} accessibilityLabel="Ana" />
            <View style={st.badge}>
              <Text style={st.badgeText}>Habla español</Text>
            </View>
          </View>
          <Text style={st.welcomeTitle} accessibilityRole="header">
            Meet Ana, your Spanish-speaking teammate.
          </Text>
          <Text style={st.welcomeSub}>
            Put her on speakerphone at the door. She talks with the customer in Spanish, quotes only your prices, and checks with you before anything she isn't sure of.
          </Text>
          <View style={{ gap: 12, marginTop: 6 }}>
            {['Pick what you sell', 'Add your prices', 'Call Ana at the door'].map((t, i) => (
              <View key={t} style={st.stepRow}>
                <View style={st.stepNum}>
                  <Text style={st.stepNumText}>{i + 1}</Text>
                </View>
                <Text style={st.stepText}>{t}</Text>
              </View>
            ))}
          </View>
        </View>
        <Button label="Get started" kind="accent" onPress={onStart} icon={null} style={{ height: 60, borderRadius: 30 }} />
        <Text style={st.welcomeFoot}>Setup takes about 2 minutes.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function IndustryStep({
  value,
  onPick,
  onBack,
  onNext,
}: {
  value: IndustryId;
  onPick: (id: IndustryId) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const { width } = useWindowDimensions();
  const cardW = (width - 36 - 12) / 2;
  return (
    <>
      <DarkHeader
        onBack={onBack}
        progress={{ step: 1, of: 3 }}
        kicker="Step 1 of 3"
        title="What do you sell?"
        sub="Ana learns the questions your customers ask and the right words for them."
      />
      <Sheet>
        <ScrollView contentContainerStyle={[st.sheetBody, { paddingHorizontal: 18 }]}>
          <View style={st.grid} accessibilityRole="radiogroup">
            {INDUSTRIES.map((ind) => {
              const on = ind.id === value;
              return (
                <Pressable
                  key={ind.id}
                  onPress={() => onPick(ind.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${ind.label}, ${ind.sub}`}
                  style={({ pressed }) => [st.indCard, { width: cardW }, on && st.indCardOn, pressed && { opacity: 0.85 }]}
                >
                  <IndustryIcon id={ind.id} />
                  <View style={{ gap: 2 }}>
                    <Text style={st.indLabel}>{ind.label}</Text>
                    <Text style={st.indSub}>{ind.sub}</Text>
                  </View>
                  {on ? (
                    <View style={st.indTick}>
                      <CheckIcon size={14} color="#FFFFFF" />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
        <Footer>
          <Button label="Continue" onPress={onNext} />
        </Footer>
      </Sheet>
    </>
  );
}

const st = StyleSheet.create({
  dark: { flex: 1, backgroundColor: C.ground },
  sheetBody: { paddingTop: 22, paddingHorizontal: 20, paddingBottom: 24, gap: 16 },
  footer: { paddingHorizontal: 20, paddingTop: 10, backgroundColor: C.sheet },
  label: { fontSize: 14, fontWeight: '600', color: C.ink2 },
  cardPad: { padding: 16, gap: 14 },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  noShrink: { flexShrink: 0 },
  planName: { flex: 1, minWidth: 0, fontSize: 18, fontWeight: '700', color: C.ink, paddingVertical: 4 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  priceBox: { width: 108, height: 52, borderRadius: 12, borderWidth: 1.5, borderColor: C.field, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  dollar: { fontSize: 18, fontWeight: '700', color: C.muted },
  priceInput: { flex: 1, fontSize: 20, fontWeight: '800', color: C.ink, paddingVertical: 0, paddingHorizontal: 2 },
  per: { fontSize: 14, color: C.muted },
  howInput: { flex: 1, minWidth: 0, minHeight: 52, borderRadius: 12, borderWidth: 1.5, borderColor: C.field, paddingHorizontal: 12, fontSize: 16, color: C.ink },
  addLink: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, alignSelf: 'flex-start' },
  addText: { fontSize: 16, fontWeight: '700', color: C.green },
  note: { fontSize: 14, lineHeight: 20, color: C.muted },
  toggleRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: C.line },
  toggleLabel: { flex: 1, fontSize: 16, color: C.ink },
  feeBox: { width: 90, height: 42, borderRadius: 10, borderWidth: 1.5, borderColor: C.field, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  feeDollar: { fontSize: 16, fontWeight: '700', color: C.muted },
  feeInput: { flex: 1, fontSize: 17, fontWeight: '700', color: C.ink, paddingVertical: 0, paddingHorizontal: 2 },
  feeNote: { width: 36, fontSize: 15, fontWeight: '700', color: C.green },
  pitchHead: { flexDirection: 'row', alignItems: 'center' },
  pitchLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: C.muted },
  pitchEdit: { fontSize: 15, fontWeight: '700', color: C.green },
  pitchText: { fontSize: 16, lineHeight: 23, color: C.ink },
  pitchInput: { minHeight: 110, borderRadius: 12, borderWidth: 1.5, borderColor: C.green, padding: 12, fontSize: 16, lineHeight: 22, color: C.ink, textAlignVertical: 'top' },
  welcome: { flexGrow: 1, paddingTop: 16, paddingHorizontal: 24 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.accent },
  brand: { fontSize: 17, fontWeight: '800', color: C.onDark },
  welcomeBody: { flex: 1, justifyContent: 'center', gap: 20, paddingVertical: 28 },
  avatarWrap: { width: 150, height: 132 },
  avatarRing: { position: 'absolute', left: 0, top: 0, width: 132, height: 132, borderRadius: 66, borderWidth: 2, borderColor: '#1F5E48' },
  avatar: { position: 'absolute', left: 10, top: 10, width: 112, height: 112, borderRadius: 56 },
  badge: { position: 'absolute', right: 0, bottom: 4, height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: C.accent, justifyContent: 'center' },
  badgeText: { fontSize: 14, fontWeight: '700', color: C.ground },
  welcomeTitle: { fontSize: 38, lineHeight: 41, fontWeight: '800', color: C.onDark, letterSpacing: -0.9 },
  welcomeSub: { fontSize: 18, lineHeight: 26, color: C.onDark2 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#16271F', alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontSize: 14, fontWeight: '800', color: C.accent },
  stepText: { fontSize: 16, color: C.chipText },
  welcomeFoot: { marginTop: 14, alignSelf: 'center', fontSize: 14, color: C.onDark3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  indCard: { height: 104, borderRadius: 18, borderWidth: 2, borderColor: C.line, backgroundColor: '#FFFFFF', padding: 14, justifyContent: 'space-between' },
  indCardOn: { borderColor: C.green, backgroundColor: C.greenBg },
  indLabel: { fontSize: 16, fontWeight: '700', color: C.ink },
  indSub: { fontSize: 13, color: C.muted },
  indTick: { position: 'absolute', top: 12, right: 12, width: 24, height: 24, borderRadius: 12, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
});
