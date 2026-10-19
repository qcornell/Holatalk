/**
 * TeachMeScreen — A friendly step-by-step questionnaire to learn about the rep.
 * Stores personal small-talk data for personalizing conversation phrases.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { saveRepProfile, DEFAULT_REP_PROFILE } from '../config/storage';
import type { RepProfile } from '../config/storage';

interface Props {
  existingProfile: RepProfile | null;
  onComplete: (profile: RepProfile) => void;
  onBack: () => void;
}

type Step = 'kids' | 'kidsNames' | 'married' | 'hometown' | 'hobbies' | 'jobDuration' | 'food' | 'team' | 'done';

const STEPS: Step[] = ['kids', 'kidsNames', 'married', 'hometown', 'hobbies', 'jobDuration', 'food', 'team', 'done'];

const HOBBY_OPTIONS = [
  { id: 'fishing', icon: '🎣', label: 'Fishing' },
  { id: 'video games', icon: '🎮', label: 'Video Games' },
  { id: 'sports', icon: '⚽', label: 'Sports' },
  { id: 'cooking', icon: '🍳', label: 'Cooking' },
  { id: 'music', icon: '🎵', label: 'Music' },
  { id: 'church', icon: '⛪', label: 'Church' },
  { id: 'gym', icon: '💪', label: 'Gym' },
  { id: 'reading', icon: '📚', label: 'Reading' },
  { id: 'cars', icon: '🚗', label: 'Cars' },
  { id: 'hunting', icon: '🦌', label: 'Hunting' },
  { id: 'other', icon: '✨', label: 'Other' },
];

export default function TeachMeScreen({ existingProfile, onComplete, onBack }: Props) {
  const [step, setStep] = useState<Step>('kids');
  const [profile, setProfile] = useState<RepProfile>(
    existingProfile ? { ...DEFAULT_REP_PROFILE, ...existingProfile } : { ...DEFAULT_REP_PROFILE }
  );

  const stepIndex = STEPS.indexOf(step);

  const update = (partial: Partial<RepProfile>) => setProfile(prev => ({ ...prev, ...partial }));

  const goNext = () => {
    // Skip kidsNames if no kids
    if (step === 'kids' && profile.kidsCount === 0) {
      setStep('married');
      return;
    }
    if (stepIndex < STEPS.length - 1) {
      setStep(STEPS[stepIndex + 1]);
    }
  };

  const goBack = () => {
    if (step === 'married' && profile.kidsCount === 0) {
      setStep('kids');
      return;
    }
    if (stepIndex > 0) {
      setStep(STEPS[stepIndex - 1]);
    }
  };

  const handleFinish = async () => {
    await saveRepProfile(profile);
    onComplete(profile);
  };

  const toggleHobby = (hobbyId: string) => {
    const hobbies = profile.hobbies.includes(hobbyId)
      ? profile.hobbies.filter(h => h !== hobbyId)
      : [...profile.hobbies, hobbyId];
    update({ hobbies });
  };

  // Progress dots (exclude 'done' from visible dots)
  const visibleSteps = STEPS.filter(s => s !== 'done');
  const progressIndex = step === 'done' ? visibleSteps.length : visibleSteps.indexOf(step);

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F6FB" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {/* Header */}
          <View style={s.header}>
            <Text style={s.headerEmoji}>🧑</Text>
            <Text style={s.headerTitle}>Let me get to know you!</Text>
            <Text style={s.headerSub}>This helps me personalize conversations for you.</Text>
            {/* Progress dots */}
            <View style={s.progressRow}>
              {visibleSteps.map((_, i) => (
                <View key={i} style={[s.dot, i <= progressIndex && s.dotActive]} />
              ))}
            </View>
          </View>

          {/* ── Step: Kids Count ── */}
          {step === 'kids' && (
            <View style={s.section}>
              <Text style={s.question}>👶 How many kids do you have?</Text>
              <Text style={s.hint}>Tap a number — this helps with small talk!</Text>
              <View style={s.numberRow}>
                {[0, 1, 2, 3, 4, 5].map(n => (
                  <TouchableOpacity
                    key={n}
                    style={[s.numberBtn, profile.kidsCount === n && s.numberBtnActive]}
                    onPress={() => update({ kidsCount: n })}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.numberTxt, profile.kidsCount === n && s.numberTxtActive]}>
                      {n === 0 ? 'None' : n === 5 ? '5+' : String(n)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* ── Step: Kids Names ── */}
          {step === 'kidsNames' && (
            <View style={s.section}>
              <Text style={s.question}>👧👦 What are your kids' names?</Text>
              <Text style={s.hint}>Optional — helps make convo more personal.</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. Sofia, Diego"
                value={profile.kidsNames}
                onChangeText={t => update({ kidsNames: t })}
                autoCapitalize="words"
              />
            </View>
          )}

          {/* ── Step: Married ── */}
          {step === 'married' && (
            <View style={s.section}>
              <Text style={s.question}>💍 Are you married?</Text>
              <View style={s.choiceCol}>
                {[
                  { value: 'married' as const, label: '💑 Yes, married', emoji: '' },
                  { value: 'single' as const, label: '🙂 Nope, single', emoji: '' },
                  { value: 'complicated' as const, label: "🤷 It's complicated", emoji: '' },
                ].map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[s.choiceBtn, profile.maritalStatus === opt.value && s.choiceBtnActive]}
                    onPress={() => update({ maritalStatus: opt.value })}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.choiceTxt, profile.maritalStatus === opt.value && s.choiceTxtActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {profile.maritalStatus === 'married' && (
                <View style={{ marginTop: 16 }}>
                  <Text style={s.hint}>How long have you been married?</Text>
                  <TextInput
                    style={s.input}
                    placeholder="e.g. 5 years"
                    value={profile.marriedDuration}
                    onChangeText={t => update({ marriedDuration: t })}
                  />
                </View>
              )}
            </View>
          )}

          {/* ── Step: Hometown ── */}
          {step === 'hometown' && (
            <View style={s.section}>
              <Text style={s.question}>📍 Where are you from?</Text>
              <Text style={s.hint}>City, state — whatever you usually tell people.</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. Houston, Texas"
                value={profile.hometown}
                onChangeText={t => update({ hometown: t })}
                autoCapitalize="words"
              />
            </View>
          )}

          {/* ── Step: Hobbies ── */}
          {step === 'hobbies' && (
            <View style={s.section}>
              <Text style={s.question}>🎯 What are your hobbies?</Text>
              <Text style={s.hint}>Pick all that apply — we'll use these in convo!</Text>
              <View style={s.hobbyGrid}>
                {HOBBY_OPTIONS.map(h => (
                  <TouchableOpacity
                    key={h.id}
                    style={[s.hobbyBtn, profile.hobbies.includes(h.id) && s.hobbyBtnActive]}
                    onPress={() => toggleHobby(h.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={s.hobbyIcon}>{h.icon}</Text>
                    <Text style={[s.hobbyLabel, profile.hobbies.includes(h.id) && s.hobbyLabelActive]}>{h.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {profile.hobbies.includes('other') && (
                <View style={{ marginTop: 16 }}>
                  <Text style={s.hint}>What else do you enjoy?</Text>
                  <TextInput
                    style={s.input}
                    placeholder="e.g. photography, bowling, traveling"
                    value={profile.otherHobby}
                    onChangeText={t => update({ otherHobby: t })}
                  />
                </View>
              )}
            </View>
          )}

          {/* ── Step: Job Duration ── */}
          {step === 'jobDuration' && (
            <View style={s.section}>
              <Text style={s.question}>💼 How long you been doing this?</Text>
              <Text style={s.hint}>Customers love hearing you're experienced.</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. 2 years"
                value={profile.jobDuration}
                onChangeText={t => update({ jobDuration: t })}
              />
            </View>
          )}

          {/* ── Step: Favorite Food ── */}
          {step === 'food' && (
            <View style={s.section}>
              <Text style={s.question}>🍽️ Favorite food?</Text>
              <Text style={s.hint}>Great icebreaker when they're cooking!</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. tacos, pizza, BBQ"
                value={profile.favoriteFood}
                onChangeText={t => update({ favoriteFood: t })}
              />
            </View>
          )}

          {/* ── Step: Favorite Team ── */}
          {step === 'team' && (
            <View style={s.section}>
              <Text style={s.question}>🏆 Favorite sports team?</Text>
              <Text style={s.hint}>Optional — skip if you're not into sports.</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. Dallas Cowboys"
                value={profile.favoriteTeam}
                onChangeText={t => update({ favoriteTeam: t })}
                autoCapitalize="words"
              />
            </View>
          )}

          {/* ── Step: Done ── */}
          {step === 'done' && (
            <View style={s.section}>
              <Text style={s.doneEmoji}>🎉</Text>
              <Text style={s.doneTitle}>Nice, I know you now!</Text>
              <Text style={s.doneSub}>I'll use this to personalize your convos. You can update anytime.</Text>

              <View style={s.summaryCard}>
                {profile.kidsCount > 0 && <Text style={s.summaryLine}>👶 {profile.kidsCount} kid{profile.kidsCount > 1 ? 's' : ''}{profile.kidsNames ? ` (${profile.kidsNames})` : ''}</Text>}
                {profile.maritalStatus ? <Text style={s.summaryLine}>💍 {profile.maritalStatus === 'married' ? `Married${profile.marriedDuration ? ` (${profile.marriedDuration})` : ''}` : profile.maritalStatus === 'single' ? 'Single' : "It's complicated"}</Text> : null}
                {profile.hometown ? <Text style={s.summaryLine}>📍 From {profile.hometown}</Text> : null}
                {profile.hobbies.length > 0 && <Text style={s.summaryLine}>🎯 {profile.hobbies.map(h => h === 'other' && profile.otherHobby ? profile.otherHobby : h).join(', ')}</Text>}
                {profile.jobDuration ? <Text style={s.summaryLine}>💼 {profile.jobDuration} in the game</Text> : null}
                {profile.favoriteFood ? <Text style={s.summaryLine}>🍽️ Loves {profile.favoriteFood}</Text> : null}
                {profile.favoriteTeam ? <Text style={s.summaryLine}>🏆 {profile.favoriteTeam} fan</Text> : null}
              </View>
            </View>
          )}

          {/* Navigation */}
          <View style={s.navRow}>
            <TouchableOpacity style={s.backBtn} onPress={stepIndex === 0 ? onBack : goBack} activeOpacity={0.7}>
              <Text style={s.backBtnTxt}>{stepIndex === 0 ? '◀ Back' : '← Back'}</Text>
            </TouchableOpacity>
            {step === 'done' ? (
              <TouchableOpacity style={s.finishBtn} onPress={handleFinish} activeOpacity={0.7}>
                <Text style={s.finishBtnTxt}>✅ Done!</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.nextBtn} onPress={goNext} activeOpacity={0.7}>
                <Text style={s.nextBtnTxt}>Next →</Text>
              </TouchableOpacity>
            )}
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F6FB' },
  scroll: { paddingHorizontal: 20, paddingBottom: 120 },

  header: { alignItems: 'center', paddingTop: 12, marginBottom: 20 },
  headerEmoji: { fontSize: 40, marginBottom: 6 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#1A1B2E', textAlign: 'center' },
  headerSub: { fontSize: 14, color: '#6B7280', marginTop: 4, textAlign: 'center' },
  progressRow: { flexDirection: 'row', marginTop: 16 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#D4D6E4', marginHorizontal: 4 },
  dotActive: { backgroundColor: '#7C5CFC' },

  section: { marginBottom: 24 },
  question: { fontSize: 20, fontWeight: '700', color: '#1A1B2E', marginBottom: 4 },
  hint: { fontSize: 14, color: '#9CA3AF', marginBottom: 16, lineHeight: 20 },

  input: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, fontSize: 18, color: '#1A1B2E', elevation: 2, borderWidth: 1, borderColor: '#E5E7EB' },

  numberRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  numberBtn: { paddingVertical: 16, paddingHorizontal: 22, backgroundColor: '#FFFFFF', borderRadius: 16, elevation: 2, borderWidth: 2, borderColor: '#E5E7EB', minWidth: 70, alignItems: 'center' },
  numberBtnActive: { backgroundColor: '#7C5CFC', borderColor: '#7C5CFC' },
  numberTxt: { fontSize: 18, fontWeight: '700', color: '#374151' },
  numberTxtActive: { color: '#FFFFFF' },

  choiceCol: { gap: 10 },
  choiceBtn: { paddingVertical: 18, paddingHorizontal: 20, backgroundColor: '#FFFFFF', borderRadius: 16, elevation: 2, borderWidth: 2, borderColor: '#E5E7EB' },
  choiceBtnActive: { backgroundColor: '#7C5CFC', borderColor: '#7C5CFC' },
  choiceTxt: { fontSize: 18, fontWeight: '600', color: '#374151', textAlign: 'center' },
  choiceTxtActive: { color: '#FFFFFF' },

  hobbyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  hobbyBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, backgroundColor: '#FFFFFF', borderRadius: 16, elevation: 2, borderWidth: 2, borderColor: '#E5E7EB', gap: 6 },
  hobbyBtnActive: { backgroundColor: '#7C5CFC', borderColor: '#7C5CFC' },
  hobbyIcon: { fontSize: 20 },
  hobbyLabel: { fontSize: 15, fontWeight: '600', color: '#374151' },
  hobbyLabelActive: { color: '#FFFFFF' },

  doneEmoji: { fontSize: 56, textAlign: 'center', marginBottom: 12 },
  doneTitle: { fontSize: 24, fontWeight: '700', color: '#1A1B2E', textAlign: 'center' },
  doneSub: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginTop: 6, marginBottom: 20 },
  summaryCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, elevation: 2, gap: 8 },
  summaryLine: { fontSize: 16, color: '#374151', lineHeight: 24 },

  navRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, gap: 12 },
  backBtn: { flex: 1, paddingVertical: 16, backgroundColor: '#F0F1F7', borderRadius: 16, alignItems: 'center' },
  backBtnTxt: { fontSize: 16, fontWeight: '600', color: '#6B7280' },
  nextBtn: { flex: 2, paddingVertical: 16, backgroundColor: '#7C5CFC', borderRadius: 16, alignItems: 'center', elevation: 4 },
  nextBtnTxt: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  finishBtn: { flex: 2, paddingVertical: 16, backgroundColor: '#10B981', borderRadius: 16, alignItems: 'center', elevation: 4 },
  finishBtnTxt: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
