/**
 * Convo: small talk for inside the house. Tap a phrase and the phone says it in Spanish, out loud
 * or in your ear. Phrases are editable, and you can add your own (typed in English, translated).
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  StatusBar,
  ScrollView,
  Platform,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { speakSpanishLoud, speakSpanishPrivate, stopSpeaking } from '../voice';
import { translateEnglishToSpanish } from '../translate';
import type { RepProfile } from '../config/storage';
import { industry } from '../teammate/industries';
import { PencilIcon, PlusIcon, SpeakerIcon } from '../teammate/icons';
import { BackButton, Button, C } from '../main/ui';

interface ConvoScreenProps {
  repName: string;
  /** What the rep sells; picks the topics that fit (no "Faith" small talk on a fundraiser, etc.) */
  industryId: string;
  repProfile?: RepProfile | null;
  onBack: () => void;
}

interface Phrase {
  label: string;
  es: string;
}

/** Persisted custom phrase data */
interface CustomPhraseData {
  /** Overrides for built-in phrases, keyed by "categoryId:index" */
  edits: Record<string, Phrase>;
  /** User-added custom phrases, keyed by category ID */
  custom: Record<string, Phrase[]>;
}

const CUSTOM_PHRASES_KEY = '@hola_custom_phrases';

const ALL_CATEGORIES = [
  { id: 'intro', label: 'Intro' },
  { id: 'home', label: 'Home' },
  { id: 'kids', label: 'Kids' },
  { id: 'weather', label: 'Weather' },
  { id: 'faith', label: 'Faith' },
  { id: 'work', label: 'Work' },
  { id: 'food', label: 'Food' },
  { id: 'hobbies', label: 'Hobbies' },
];

const getBuiltInPhrases = (catId: string, repName: string, profile?: RepProfile | null): Phrase[] => {
  const name = repName || 'Friend';
  const kids = profile?.kidsCount || 0;
  const kidsNames = profile?.kidsNames || '';
  const hometown = profile?.hometown || 'Texas';
  const repHobbies = profile?.hobbies || [];

  switch (catId) {
    case 'intro':
      return [
        { label: 'Hi, how are you?', es: 'Hola, ¿cómo está?' },
        { label: `My name is ${name}.`, es: `Me llamo ${name}.` },
        { label: 'Nice to meet you.', es: 'Mucho gusto.' },
      ];
    case 'home':
      return [
        { label: 'Beautiful home!', es: '¡Qué casa tan bonita!' },
        { label: 'How long lived here?', es: '¿Cuánto tiempo lleva viviendo aquí?' },
        { label: 'Did you renovate?', es: '¿Hizo remodelaciones?' },
      ];
    case 'kids': {
      const kidsPhrases: Phrase[] = [
        { label: 'Cute kids!', es: '¡Qué niños tan lindos!' },
        { label: 'How old are they?', es: '¿Cuántos años tienen?' },
      ];
      if (kids > 0) {
        kidsPhrases.push(
          kids === 1
            ? { label: 'I have a kid too.', es: 'Yo también tengo un hijo.' }
            : { label: `I have ${kids} kids too.`, es: `Yo también tengo ${kids} hijos.` },
        );
      }
      if (kidsNames) {
        kidsPhrases.push({ label: `My kids are ${kidsNames}.`, es: `Mis hijos se llaman ${kidsNames}.` });
      }
      return kidsPhrases;
    }
    case 'weather':
      return [
        { label: 'It\'s hot today!', es: '¡Hace mucho calor hoy!' },
        { label: 'We need rain.', es: 'Necesitamos lluvia.' },
        { label: 'Beautiful day.', es: 'Día hermoso, ¿verdad?' },
      ];
    case 'faith':
      return [
        { label: 'Do you have a church?', es: '¿Tiene una iglesia a la que asiste?' },
        { label: 'Can I pray for you?', es: '¿Puedo orar por usted?' },
        { label: 'God bless you.', es: 'Que Dios le bendiga.' },
      ];
    case 'work':
      return [
        { label: 'What do you do?', es: '¿En qué trabaja?' },
        { label: `I'm from ${hometown}.`, es: `Yo soy de ${hometown}.` },
        { label: 'Traffic is crazy.', es: 'El tráfico está terrible hoy.' },
      ];
    case 'food': {
      const foodPhrases: Phrase[] = [
        { label: 'What are you cooking?', es: '¿Qué está cocinando?' },
        { label: 'Smells good!', es: '¡Huele muy rico!' },
        { label: 'Favorite restaurant?', es: '¿Cuál es su restaurante favorito?' },
        { label: 'I love Mexican food.', es: 'Me encanta la comida mexicana.' },
        { label: 'Any good places nearby?', es: '¿Conoce algún buen lugar para comer por aquí?' },
      ];
      if (profile?.favoriteFood) {
        foodPhrases.push({ label: `I love ${profile.favoriteFood}.`, es: `A mí me encanta ${profile.favoriteFood}.` });
      }
      return foodPhrases;
    }
    case 'hobbies': {
      const hobbyPhrases: Phrase[] = [
        { label: 'What do you do for fun?', es: '¿Qué hace para divertirse?' },
        { label: 'What are you doing this weekend?', es: '¿Qué va a hacer este fin de semana?' },
        { label: 'Do you play video games?', es: '¿Juega videojuegos?' },
        { label: 'Do you like sports?', es: '¿Le gustan los deportes?' },
        { label: 'Do you like soccer?', es: '¿Le gusta el fútbol?' },
        { label: 'I like fishing.', es: 'A mí me gusta pescar.' },
        { label: 'Do you watch Netflix?', es: '¿Ve Netflix?' },
        { label: 'Do you like music?', es: '¿Le gusta la música?' },
      ];
      if (repHobbies.includes('fishing')) hobbyPhrases.push({ label: 'I love to fish!', es: '¡A mí me encanta pescar!' });
      if (repHobbies.includes('sports')) hobbyPhrases.push({ label: 'I play sports too.', es: 'Yo también juego deportes.' });
      if (repHobbies.includes('cooking')) hobbyPhrases.push({ label: 'I love cooking.', es: 'Me encanta cocinar.' });
      if (repHobbies.includes('gym')) hobbyPhrases.push({ label: 'I go to the gym.', es: 'Yo voy al gimnasio.' });
      if (repHobbies.includes('church')) hobbyPhrases.push({ label: 'I go to church.', es: 'Yo voy a la iglesia.' });
      if (profile?.favoriteTeam) hobbyPhrases.push({ label: `I'm a ${profile.favoriteTeam} fan!`, es: `¡Soy fan de ${profile.favoriteTeam}!` });
      // Bug fix #1: Include otherHobby in convo phrases
      if (profile?.otherHobby) {
        hobbyPhrases.push({ label: `I like ${profile.otherHobby}.`, es: `A mí me gusta ${profile.otherHobby}.` });
      }
      return hobbyPhrases;
    }
    default:
      return [];
  }
};

export default function ConvoScreen({ repName, industryId, repProfile, onBack }: ConvoScreenProps) {
  const insets = useSafeAreaInsets();
  const CATEGORIES = ALL_CATEGORIES.filter((c) => industry(industryId).convoCats.includes(c.id));
  const [activeCat, setActiveCat] = useState<string>(CATEGORIES[0]?.id ?? 'intro');
  const [mode, setMode] = useState<'loud' | 'ear'>('loud');
  const [speaking, setSpeaking] = useState<string | null>(null); // the Spanish being said right now

  // Custom phrases state
  const [customData, setCustomData] = useState<CustomPhraseData>({ edits: {}, custom: {} });
  const [customLoaded, setCustomLoaded] = useState(false);

  // Edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editLabel, setEditLabel] = useState('');
  const [editEs, setEditEs] = useState('');
  const [editTarget, setEditTarget] = useState<{
    catId: string;
    type: 'builtin' | 'custom';
    index: number;
  } | null>(null);
  const [isNewPhrase, setIsNewPhrase] = useState(false);
  const [editCatId, setEditCatId] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [originalEnglish, setOriginalEnglish] = useState(''); // track what English was when we auto-translated

  // Load custom phrases on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(CUSTOM_PHRASES_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as CustomPhraseData;
          setCustomData({
            edits: parsed.edits || {},
            custom: parsed.custom || {},
          });
        }
      } catch (e) {
        console.error('[ConvoScreen] Failed to load custom phrases:', e);
      }
      setCustomLoaded(true);
    })();
  }, []);

  // Persist custom phrases whenever they change
  const saveCustomData = useCallback(async (data: CustomPhraseData) => {
    setCustomData(data);
    try {
      await AsyncStorage.setItem(CUSTOM_PHRASES_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('[ConvoScreen] Failed to save custom phrases:', e);
    }
  }, []);

  useEffect(() => () => stopSpeaking(), []);

  const handleSpeak = (textEs: string) => {
    if (speaking) {
      stopSpeaking();
      const same = speaking === textEs;
      setSpeaking(null);
      if (same) return; // a second tap on the same phrase stops it
    }
    setSpeaking(textEs);
    const done = () => setSpeaking((cur) => (cur === textEs ? null : cur));
    if (mode === 'loud') {
      speakSpanishLoud(textEs, done);
    } else {
      speakSpanishPrivate(textEs, done);
    }
  };

  /** Get the effective phrase (with overrides applied) for a built-in phrase */
  const getEffectiveBuiltIn = (catId: string, index: number, original: Phrase): Phrase => {
    const key = `${catId}:${index}`;
    return customData.edits[key] || original;
  };

  /** Get custom phrases for a category */
  const getCustomPhrases = (catId: string): Phrase[] => {
    return customData.custom[catId] || [];
  };

  // ── Edit modal handlers ──

  const openEditBuiltIn = (catId: string, index: number, phrase: Phrase) => {
    setEditTarget({ catId, type: 'builtin', index });
    setEditLabel(phrase.label);
    setEditEs(phrase.es);
    setOriginalEnglish(phrase.label);
    setIsNewPhrase(false);
    setEditCatId(catId);
    setIsTranslating(false);
    setEditModalVisible(true);
  };

  const openEditCustom = (catId: string, customIndex: number, phrase: Phrase) => {
    setEditTarget({ catId, type: 'custom', index: customIndex });
    setEditLabel(phrase.label);
    setEditEs(phrase.es);
    setOriginalEnglish(phrase.label);
    setIsNewPhrase(false);
    setEditCatId(catId);
    setIsTranslating(false);
    setEditModalVisible(true);
  };

  const openAddNew = (catId: string) => {
    setEditTarget(null);
    setEditLabel('');
    setEditEs('');
    setOriginalEnglish('');
    setIsNewPhrase(true);
    setEditCatId(catId);
    setIsTranslating(false);
    setEditModalVisible(true);
  };

  /**
   * Auto-translate English → Spanish when user finishes typing English.
   * Called on English field blur or when Save is pressed with empty Spanish.
   */
  const autoTranslate = async (englishText: string): Promise<string> => {
    const trimmed = englishText.trim();
    if (!trimmed) return '';
    setIsTranslating(true);
    try {
      const result = await translateEnglishToSpanish(trimmed);
      if (result.ok && result.translated) {
        return result.translated;
      }
    } catch (e: any) {
      console.warn('[ConvoScreen] Auto-translate failed:', e?.message);
    } finally {
      setIsTranslating(false);
    }
    return '';
  };

  /** Called when English field loses focus — auto-translate if text changed */
  const handleEnglishBlur = async () => {
    const trimmed = editLabel.trim();
    if (!trimmed || trimmed === originalEnglish) return;
    const translated = await autoTranslate(trimmed);
    if (translated) {
      setEditEs(translated);
      setOriginalEnglish(trimmed);
    }
  };

  const handleSaveEdit = async () => {
    const trimmedLabel = editLabel.trim();
    let trimmedEs = editEs.trim();
    if (!trimmedLabel && !trimmedEs) {
      setEditModalVisible(false);
      return;
    }

    // Auto-translate if:
    // 1. New phrase and Spanish is empty, OR
    // 2. Editing and English changed from what it was when we opened the modal
    const englishChanged = trimmedLabel !== originalEnglish.trim();
    if (trimmedLabel && (!trimmedEs || (!isNewPhrase && englishChanged))) {
      const translated = await autoTranslate(trimmedLabel);
      if (translated) {
        trimmedEs = translated;
        setEditEs(trimmedEs);
      }
    }

    const newData = { ...customData, edits: { ...customData.edits }, custom: { ...customData.custom } };

    if (isNewPhrase) {
      const catCustom = [...(newData.custom[editCatId] || [])];
      catCustom.push({ label: trimmedLabel, es: trimmedEs || trimmedLabel });
      newData.custom[editCatId] = catCustom;
    } else if (editTarget) {
      if (editTarget.type === 'builtin') {
        const key = `${editTarget.catId}:${editTarget.index}`;
        newData.edits[key] = { label: trimmedLabel, es: trimmedEs || trimmedLabel };
      } else {
        const catCustom = [...(newData.custom[editTarget.catId] || [])];
        catCustom[editTarget.index] = { label: trimmedLabel, es: trimmedEs || trimmedLabel };
        newData.custom[editTarget.catId] = catCustom;
      }
    }

    saveCustomData(newData);
    setEditModalVisible(false);
  };

  const handleDeletePhrase = () => {
    if (!editTarget) return;

    Alert.alert('Delete Phrase', 'Are you sure you want to delete this phrase?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const newData = { ...customData, edits: { ...customData.edits }, custom: { ...customData.custom } };
          if (editTarget.type === 'builtin') {
            // For built-in: remove the override (restores default)
            const key = `${editTarget.catId}:${editTarget.index}`;
            delete newData.edits[key];
          } else {
            // For custom: remove the phrase entirely
            const catCustom = [...(newData.custom[editTarget.catId] || [])];
            catCustom.splice(editTarget.index, 1);
            newData.custom[editTarget.catId] = catCustom;
          }
          saveCustomData(newData);
          setEditModalVisible(false);
        },
      },
    ]);
  };

  const handleResetBuiltIn = () => {
    if (!editTarget || editTarget.type !== 'builtin') return;
    const key = `${editTarget.catId}:${editTarget.index}`;
    if (!customData.edits[key]) {
      setEditModalVisible(false);
      return;
    }
    const newData = { ...customData, edits: { ...customData.edits } };
    delete newData.edits[key];
    saveCustomData(newData);
    setEditModalVisible(false);
  };

  const builtIn = getBuiltInPhrases(activeCat, repName, repProfile);
  const custom = getCustomPhrases(activeCat);
  const items = [
    ...builtIn.map((original, i) => ({
      key: `b-${i}`,
      phrase: getEffectiveBuiltIn(activeCat, i, original),
      edit: () => openEditBuiltIn(activeCat, i, getEffectiveBuiltIn(activeCat, i, original)),
      mine: !!customData.edits[`${activeCat}:${i}`],
    })),
    ...custom.map((phrase, i) => ({ key: `c-${i}`, phrase, edit: () => openEditCustom(activeCat, i, phrase), mine: true })),
  ];

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />
      <View style={s.top}>
        <View style={s.topRow}>
          <BackButton onPress={onBack} />
          <View style={{ flex: 1 }} />
          <View style={s.toggle} accessibilityRole="radiogroup" accessibilityLabel="Play from">
            {(['loud', 'ear'] as const).map((m) => (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                accessibilityRole="radio"
                accessibilityState={{ selected: mode === m }}
                style={[s.toggleBtn, mode === m && s.toggleOn]}
              >
                <Text style={[s.toggleTxt, mode === m && s.toggleTxtOn]}>{m === 'loud' ? 'Speaker' : 'Earpiece'}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Text style={s.title} accessibilityRole="header">
          Convo
        </Text>
        <Text style={s.sub}>{mode === 'loud' ? 'Tap a phrase. Your phone says it in Spanish.' : 'Tap a phrase to hear it in your ear first.'}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} style={{ marginHorizontal: -20 }}>
          {CATEGORIES.map((cat) => {
            const on = cat.id === activeCat;
            return (
              <Pressable
                key={cat.id}
                onPress={() => setActiveCat(cat.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={[s.chip, on && s.chipOn]}
              >
                <Text style={[s.chipTxt, on && s.chipTxtOn]}>{cat.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={s.sheet}>
        <ScrollView contentContainerStyle={[s.list, { paddingBottom: Math.max(insets.bottom, 12) + 20 }]}>
          {items.map(({ key, phrase, edit, mine }) => {
            const on = speaking === phrase.es;
            return (
              <Pressable
                key={key}
                onPress={() => handleSpeak(phrase.es)}
                onLongPress={edit}
                accessibilityRole="button"
                accessibilityLabel={`Say: ${phrase.label}`}
                accessibilityHint="Long press to edit"
                style={({ pressed }) => [s.phrase, on && s.phraseOn, pressed && { opacity: 0.85 }]}
              >
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={s.phraseEn}>
                    {phrase.label}
                    {mine ? <Text style={s.mine}>  · yours</Text> : null}
                  </Text>
                  <Text style={s.phraseEs}>{phrase.es}</Text>
                </View>
                <Pressable onPress={edit} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Edit ${phrase.label}`} style={s.editBtn}>
                  <PencilIcon size={16} color={C.faint} />
                </Pressable>
                <View style={[s.play, on && s.playOn]}>
                  {on ? (
                    <View style={s.wave}>
                      {[12, 20, 14, 8].map((h, i) => (
                        <View key={i} style={[s.waveBar, { height: h }]} />
                      ))}
                    </View>
                  ) : (
                    <SpeakerIcon size={22} color={C.green} />
                  )}
                </View>
              </Pressable>
            );
          })}
          <Button label="Add your own phrase" kind="outline" onPress={() => openAddNew(activeCat)} icon={<PlusIcon />} style={{ marginTop: 6, height: 54 }} />
          <Text style={s.addHint}>Type it in English. We translate it.</Text>
        </ScrollView>
      </View>

      {/* ── Edit / Add ── */}
      <Modal visible={editModalVisible} transparent animationType="fade" onRequestClose={() => setEditModalVisible(false)}>
        <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={s.modalScrollContent} keyboardShouldPersistTaps="handled" bounces={false}>
            <View style={s.modalCard}>
              <Text style={s.modalTitle}>{isNewPhrase ? 'Add a phrase' : 'Edit phrase'}</Text>

              <Text style={s.modalFieldLabel}>English</Text>
              <TextInput
                style={s.modalInput}
                value={editLabel}
                onChangeText={setEditLabel}
                onBlur={handleEnglishBlur}
                placeholder="Type it in English"
                placeholderTextColor={C.faint}
                autoCapitalize="sentences"
                multiline
                returnKeyType="done"
                blurOnSubmit
                accessibilityLabel="English"
              />

              <View style={s.spanishRow}>
                <Text style={s.modalFieldLabel}>Spanish</Text>
                {isTranslating ? (
                  <View style={s.translatingRow}>
                    <ActivityIndicator size="small" color={C.green} />
                    <Text style={s.translatingTxt}>Translating…</Text>
                  </View>
                ) : null}
              </View>
              <TextInput
                style={[s.modalInput, s.modalInputSpanish]}
                value={editEs}
                onChangeText={setEditEs}
                placeholder="Fills in by itself. Edit if needed."
                placeholderTextColor={C.faint}
                autoCapitalize="sentences"
                multiline
                returnKeyType="done"
                blurOnSubmit
                accessibilityLabel="Spanish"
              />

              <View style={s.modalBtnRow}>
                <Pressable style={s.modalCancelBtn} onPress={() => setEditModalVisible(false)} accessibilityRole="button">
                  <Text style={s.modalCancelTxt}>Cancel</Text>
                </Pressable>
                {!isNewPhrase && editTarget ? (
                  <Pressable
                    style={s.modalDeleteBtn}
                    onPress={editTarget.type === 'custom' ? handleDeletePhrase : handleResetBuiltIn}
                    accessibilityRole="button"
                  >
                    <Text style={s.modalDeleteTxt}>{editTarget.type === 'custom' ? 'Delete' : 'Reset'}</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  style={[s.modalSaveBtn, isTranslating && { opacity: 0.6 }]}
                  onPress={handleSaveEdit}
                  disabled={isTranslating}
                  accessibilityRole="button"
                >
                  <Text style={s.modalSaveTxt}>{isTranslating ? 'Translating…' : 'Save'}</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.ground },
  top: { paddingTop: 8, paddingHorizontal: 20, paddingBottom: 18, gap: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  toggle: { flexDirection: 'row', height: 40, padding: 3, borderRadius: 20, backgroundColor: C.chip },
  toggleBtn: { height: 34, paddingHorizontal: 14, borderRadius: 17, justifyContent: 'center' },
  toggleOn: { backgroundColor: '#FFFFFF' },
  toggleTxt: { fontSize: 14, fontWeight: '700', color: C.onDark2 },
  toggleTxtOn: { color: C.ground },
  title: { fontSize: 30, fontWeight: '800', color: C.onDark, letterSpacing: -0.6 },
  sub: { fontSize: 16, lineHeight: 22, color: C.onDark2 },
  chips: { gap: 8, paddingHorizontal: 20, paddingTop: 8 },
  chip: { height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: C.chip, justifyContent: 'center' },
  chipOn: { backgroundColor: C.accent },
  chipTxt: { fontSize: 15, fontWeight: '700', color: C.chipText },
  chipTxtOn: { color: C.ground },
  sheet: { flex: 1, backgroundColor: C.sheet, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  list: { paddingTop: 20, paddingHorizontal: 18, gap: 10 },
  phrase: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingLeft: 16, paddingRight: 14, borderRadius: 18, borderWidth: 1.5, borderColor: C.line, backgroundColor: '#FFFFFF' },
  phraseOn: { borderColor: C.green },
  phraseEn: { fontSize: 17, lineHeight: 22, fontWeight: '700', color: C.ink },
  mine: { fontSize: 13, fontWeight: '600', color: C.green },
  phraseEs: { fontSize: 15, lineHeight: 20, color: C.muted },
  editBtn: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  play: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E7F8F0', alignItems: 'center', justifyContent: 'center' },
  playOn: { backgroundColor: C.green },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  waveBar: { width: 3, borderRadius: 2, backgroundColor: '#FFFFFF' },
  addHint: { alignSelf: 'center', fontSize: 14, color: C.muted },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalScrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 400, backgroundColor: '#FFFFFF', borderRadius: 22, padding: 22 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: C.ink, marginBottom: 12 },
  modalFieldLabel: { fontSize: 14, fontWeight: '600', color: C.ink2, marginBottom: 6, marginTop: 8 },
  modalInput: { borderRadius: 12, borderWidth: 1.5, borderColor: C.field, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: C.ink, minHeight: 50 },
  modalInputSpanish: { borderColor: C.greenLine, backgroundColor: C.greenBg },
  spanishRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  translatingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  translatingTxt: { fontSize: 13, color: C.green, fontWeight: '600' },
  modalBtnRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20, gap: 10 },
  modalCancelBtn: { height: 48, paddingHorizontal: 18, borderRadius: 24, borderWidth: 1.5, borderColor: C.field, justifyContent: 'center' },
  modalCancelTxt: { fontSize: 15, fontWeight: '700', color: C.ink },
  modalDeleteBtn: { height: 48, paddingHorizontal: 16, borderRadius: 24, backgroundColor: '#FEF2F2', justifyContent: 'center' },
  modalDeleteTxt: { fontSize: 15, fontWeight: '700', color: C.red },
  modalSaveBtn: { flex: 1, height: 48, borderRadius: 24, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  modalSaveTxt: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
