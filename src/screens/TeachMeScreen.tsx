/**
 * Teach Me: a few quick questions about the rep, so Convo's small talk sounds like them
 * ("I'm from Houston", "I have 2 kids too"). Saved on the phone.
 */
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { saveRepProfile, DEFAULT_REP_PROFILE } from '../config/storage';
import type { RepProfile } from '../config/storage';
import { Button, C, DarkHeader } from '../main/ui';

interface Props {
  existingProfile: RepProfile | null;
  onComplete: (profile: RepProfile) => void;
  onBack: () => void;
}

type Step = 'kids' | 'kidsNames' | 'married' | 'hometown' | 'hobbies' | 'jobDuration' | 'food' | 'team' | 'done';

const STEPS: Step[] = ['kids', 'kidsNames', 'married', 'hometown', 'hobbies', 'jobDuration', 'food', 'team', 'done'];
const ASKED = STEPS.filter((s) => s !== 'done');

const HOBBY_OPTIONS = [
  { id: 'fishing', label: 'Fishing' },
  { id: 'video games', label: 'Video games' },
  { id: 'sports', label: 'Sports' },
  { id: 'cooking', label: 'Cooking' },
  { id: 'music', label: 'Music' },
  { id: 'church', label: 'Church' },
  { id: 'gym', label: 'Gym' },
  { id: 'reading', label: 'Reading' },
  { id: 'cars', label: 'Cars' },
  { id: 'hunting', label: 'Hunting' },
  { id: 'other', label: 'Other' },
];

const QUESTIONS: Record<Exclude<Step, 'done'>, { title: string; sub: string }> = {
  kids: { title: 'How many kids do you have?', sub: 'Families love talking about their kids.' },
  kidsNames: { title: "What are your kids' names?", sub: 'Optional. It makes small talk more personal.' },
  married: { title: 'Are you married?', sub: 'Only used for small talk.' },
  hometown: { title: 'Where are you from?', sub: 'Whatever you usually tell people.' },
  hobbies: { title: 'What do you do for fun?', sub: 'Pick all that fit.' },
  jobDuration: { title: 'How long have you been doing this?', sub: 'Customers like hearing you know your stuff.' },
  food: { title: 'Favorite food?', sub: "A great icebreaker when they're cooking." },
  team: { title: 'Favorite sports team?', sub: "Optional. Skip it if you're not into sports." },
};

/** The Convo line a step's answer gives you, in English and Spanish. */
function preview(step: Step, p: RepProfile): { en: string; es: string } | null {
  switch (step) {
    case 'kids':
      if (p.kidsCount <= 0) return null;
      return p.kidsCount === 1
        ? { en: 'I have a kid too.', es: 'Yo también tengo un hijo.' }
        : { en: `I have ${p.kidsCount} kids too.`, es: `Yo también tengo ${p.kidsCount} hijos.` };
    case 'kidsNames':
      return p.kidsNames.trim() ? { en: `My kids are ${p.kidsNames.trim()}.`, es: `Mis hijos se llaman ${p.kidsNames.trim()}.` } : null;
    case 'hometown':
      return p.hometown.trim() ? { en: `I'm from ${p.hometown.trim()}.`, es: `Yo soy de ${p.hometown.trim()}.` } : null;
    case 'hobbies':
      if (p.hobbies.includes('fishing')) return { en: 'I love to fish!', es: '¡A mí me encanta pescar!' };
      if (p.hobbies.includes('cooking')) return { en: 'I love cooking.', es: 'Me encanta cocinar.' };
      if (p.hobbies.includes('sports')) return { en: 'I play sports too.', es: 'Yo también juego deportes.' };
      if (p.hobbies.includes('gym')) return { en: 'I go to the gym.', es: 'Yo voy al gimnasio.' };
      if (p.hobbies.includes('church')) return { en: 'I go to church.', es: 'Yo voy a la iglesia.' };
      return null;
    case 'food':
      return p.favoriteFood.trim() ? { en: `I love ${p.favoriteFood.trim()}.`, es: `A mí me encanta ${p.favoriteFood.trim()}.` } : null;
    case 'team':
      return p.favoriteTeam.trim() ? { en: `I'm a ${p.favoriteTeam.trim()} fan!`, es: `¡Soy fan de ${p.favoriteTeam.trim()}!` } : null;
    default:
      return null;
  }
}

export default function TeachMeScreen({ existingProfile, onComplete, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('kids');
  const [profile, setProfile] = useState<RepProfile>(existingProfile ? { ...DEFAULT_REP_PROFILE, ...existingProfile } : { ...DEFAULT_REP_PROFILE });
  const stepIndex = STEPS.indexOf(step);
  const update = (partial: Partial<RepProfile>) => setProfile((prev) => ({ ...prev, ...partial }));

  const goNext = () => {
    if (step === 'kids' && profile.kidsCount === 0) return setStep('married');
    if (stepIndex < STEPS.length - 1) setStep(STEPS[stepIndex + 1]);
  };
  const goBack = () => {
    if (stepIndex === 0) return onBack();
    if (step === 'married' && profile.kidsCount === 0) return setStep('kids');
    setStep(STEPS[stepIndex - 1]);
  };
  const handleFinish = async () => {
    await saveRepProfile(profile);
    onComplete(profile);
  };
  const toggleHobby = (id: string) =>
    update({ hobbies: profile.hobbies.includes(id) ? profile.hobbies.filter((h) => h !== id) : [...profile.hobbies, id] });

  const n = step === 'done' ? ASKED.length : ASKED.indexOf(step) + 1;
  const q = step === 'done' ? { title: 'Nice, now Convo knows you', sub: 'Your lines are in Convo. Come back any time to change them.' } : QUESTIONS[step];
  const line = preview(step, profile);

  const input = (value: string, onChange: (t: string) => void, label: string, placeholder: string, words = false) => (
    <View style={{ gap: 6 }}>
      <Text style={st.label}>{label}</Text>
      <TextInput
        style={st.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.faint}
        autoCapitalize={words ? 'words' : 'sentences'}
        accessibilityLabel={label}
        returnKeyType="next"
        onSubmitEditing={goNext}
      />
    </View>
  );
  const pill = (on: boolean, label: string, onPress: () => void, key?: string) => (
    <Pressable key={key ?? label} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} style={[st.pill, on && st.pillOn]}>
      <Text style={[st.pillText, on && st.pillTextOn]}>{label}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={st.root} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />
      <DarkHeader onBack={goBack} progress={{ step: n, of: ASKED.length }} kicker={step === 'done' ? 'Teach Me · done' : `Teach Me · ${n} of ${ASKED.length}`} title={q.title} sub={q.sub} />
      <View style={st.sheet}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={st.body} keyboardShouldPersistTaps="handled">
            {step === 'kids' ? (
              <View style={st.pills}>{[0, 1, 2, 3, 4, 5].map((k) => pill(profile.kidsCount === k, k === 0 ? 'None' : k === 5 ? '5+' : String(k), () => update({ kidsCount: k }), String(k)))}</View>
            ) : null}
            {step === 'kidsNames' ? input(profile.kidsNames, (t) => update({ kidsNames: t }), 'Names', 'Sofia, Diego', true) : null}
            {step === 'married' ? (
              <>
                <View style={st.pills}>
                  {pill(profile.maritalStatus === 'married', 'Yes, married', () => update({ maritalStatus: 'married' }))}
                  {pill(profile.maritalStatus === 'single', 'Single', () => update({ maritalStatus: 'single' }))}
                  {pill(profile.maritalStatus === 'complicated', "It's complicated", () => update({ maritalStatus: 'complicated' }))}
                </View>
                {profile.maritalStatus === 'married' ? input(profile.marriedDuration, (t) => update({ marriedDuration: t }), 'For how long?', '5 years') : null}
              </>
            ) : null}
            {step === 'hometown' ? input(profile.hometown, (t) => update({ hometown: t }), 'Hometown', 'Houston, Texas', true) : null}
            {step === 'hobbies' ? (
              <>
                <View style={st.pills}>{HOBBY_OPTIONS.map((h) => pill(profile.hobbies.includes(h.id), h.label, () => toggleHobby(h.id), h.id))}</View>
                {profile.hobbies.includes('other') ? input(profile.otherHobby, (t) => update({ otherHobby: t }), 'What else?', 'Photography, bowling') : null}
              </>
            ) : null}
            {step === 'jobDuration' ? input(profile.jobDuration, (t) => update({ jobDuration: t }), 'How long', '2 years') : null}
            {step === 'food' ? input(profile.favoriteFood, (t) => update({ favoriteFood: t }), 'Favorite food', 'Tacos') : null}
            {step === 'team' ? input(profile.favoriteTeam, (t) => update({ favoriteTeam: t }), 'Team', 'Dallas Cowboys', true) : null}

            {line ? (
              <View style={st.preview} accessibilityLabel={`In Convo you'll have: ${line.en}`}>
                <Text style={st.previewKicker}>In Convo you'll have</Text>
                <Text style={st.previewEn}>{line.en}</Text>
                <Text style={st.previewEs}>{line.es}</Text>
              </View>
            ) : null}

            {step === 'done' ? (
              <View style={st.summary}>
                {[
                  profile.kidsCount > 0 ? `${profile.kidsCount} kid${profile.kidsCount > 1 ? 's' : ''}${profile.kidsNames ? ` (${profile.kidsNames})` : ''}` : '',
                  profile.maritalStatus === 'married' ? `Married${profile.marriedDuration ? `, ${profile.marriedDuration}` : ''}` : profile.maritalStatus === 'single' ? 'Single' : '',
                  profile.hometown ? `From ${profile.hometown}` : '',
                  profile.hobbies.length ? profile.hobbies.map((h) => (h === 'other' && profile.otherHobby ? profile.otherHobby : h)).join(', ') : '',
                  profile.jobDuration ? `${profile.jobDuration} doing this` : '',
                  profile.favoriteFood ? `Loves ${profile.favoriteFood}` : '',
                  profile.favoriteTeam ? `${profile.favoriteTeam} fan` : '',
                ]
                  .filter(Boolean)
                  .map((t) => (
                    <Text key={t} style={st.summaryLine}>
                      {t}
                    </Text>
                  ))}
              </View>
            ) : null}
          </ScrollView>
          <View style={[st.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
            {step === 'done' ? (
              <Button label="Done" kind="accent" onPress={handleFinish} />
            ) : (
              <>
                <Button label="Next" onPress={goNext} />
                <Button label="Skip this one" kind="text" onPress={goNext} />
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.ground },
  sheet: { flex: 1, backgroundColor: C.sheet, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  body: { paddingTop: 22, paddingHorizontal: 20, paddingBottom: 24, gap: 16 },
  label: { fontSize: 14, fontWeight: '600', color: C.ink2 },
  input: { minHeight: 54, borderRadius: 14, borderWidth: 1.5, borderColor: C.field, backgroundColor: '#FFFFFF', paddingHorizontal: 16, fontSize: 18, color: C.ink },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pill: { minHeight: 48, minWidth: 64, paddingHorizontal: 18, borderRadius: 24, borderWidth: 2, borderColor: C.line, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  pillOn: { borderColor: C.green, backgroundColor: C.greenBg },
  pillText: { fontSize: 16, fontWeight: '700', color: C.ink2 },
  pillTextOn: { color: C.green },
  preview: { backgroundColor: C.greenBg, borderWidth: 1, borderColor: C.greenLine, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16, gap: 3 },
  previewKicker: { fontSize: 13, fontWeight: '600', color: C.green },
  previewEn: { fontSize: 17, fontWeight: '700', color: C.ink },
  previewEs: { fontSize: 15, color: C.ink2 },
  summary: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: C.line, borderRadius: 18, padding: 18, gap: 8 },
  summaryLine: { fontSize: 16, lineHeight: 22, color: C.ink2 },
  footer: { paddingHorizontal: 20, paddingTop: 10, backgroundColor: C.sheet, gap: 2 },
});
