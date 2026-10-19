import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ScrollView,
  Animated,
  Platform,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { speakSpanishLoud, speakSpanishPrivate, stopSpeaking } from '../voice';
import { translateEnglishToSpanish } from '../translate';
import { UserSetup } from '../config/storage';
import type { RepProfile } from '../config/storage';

interface ConvoScreenProps {
  userSetup: UserSetup | null;
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
  { id: 'intro', icon: '👋', label: 'Intro' },
  { id: 'home', icon: '🏠', label: 'Home' },
  { id: 'kids', icon: '👶', label: 'Kids' },
  { id: 'weather', icon: '☀️', label: 'Weather' },
  { id: 'faith', icon: '⛪', label: 'Faith' },
  { id: 'work', icon: '💼', label: 'Work' },
  { id: 'food', icon: '🍽️', label: 'Food' },
  { id: 'hobbies', icon: '🎮', label: 'Hobbies' },
];

function getCategoriesForTemplate(template: string) {
  switch (template) {
    case 'ministry':
      return ALL_CATEGORIES.filter(c => ['intro', 'home', 'kids', 'weather', 'faith', 'food'].includes(c.id));
    case 'sales':
      return ALL_CATEGORIES.filter(c => ['intro', 'home', 'kids', 'weather', 'food', 'hobbies'].includes(c.id));
    default:
      return ALL_CATEGORIES;
  }
}

const getBuiltInPhrases = (catId: string, setup: UserSetup | null, profile?: RepProfile | null): Phrase[] => {
  const name = setup?.repName || 'Friend';
  const kids = profile?.kidsCount ?? (setup as any)?.kidsCount ?? '0';
  const kidsNames = profile?.kidsNames || '';
  const hometown = profile?.hometown || (setup as any)?.hometown || 'Texas';
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
        { label: `I have ${kids} kids too.`, es: `Yo también tengo ${kids} hijos.` },
      ];
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

export default function ConvoScreen({ userSetup, repProfile, onBack }: ConvoScreenProps) {
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [mode, setMode] = useState<'loud' | 'ear'>('loud');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const expandAnim = useRef(new Animated.Value(0)).current;

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

  const CATEGORIES = getCategoriesForTemplate(userSetup?.selectedTemplate || '');

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

  useEffect(() => {
    Animated.timing(expandAnim, {
      toValue: activeCat ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [activeCat]);

  const handleSpeak = (textEs: string) => {
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
      return;
    }
    setIsSpeaking(true);
    if (mode === 'loud') {
      speakSpanishLoud(textEs, () => setIsSpeaking(false));
    } else {
      speakSpanishPrivate(textEs, () => setIsSpeaking(false));
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

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F6FB" />
      
      <View style={s.header}>
        <View style={{ width: 60 }} />
        <Text style={s.title}>Convo Mode</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Mode Toggle */}
      <View style={s.toggleContainer}>
        <TouchableOpacity
          style={[s.toggleBtn, mode === 'ear' && s.toggleActive, { borderTopLeftRadius: 20, borderBottomLeftRadius: 20 }]}
          onPress={() => setMode('ear')}
        >
          <Text style={[s.toggleTxt, mode === 'ear' && s.toggleTxtActive]}>🎧 Ear (Private)</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.toggleBtn, mode === 'loud' && s.toggleActive, { borderTopRightRadius: 20, borderBottomRightRadius: 20 }]}
          onPress={() => setMode('loud')}
        >
          <Text style={[s.toggleTxt, mode === 'loud' && s.toggleTxtActive]}>🔊 Loud (Public)</Text>
        </TouchableOpacity>
      </View>

      <Text style={s.modeHint}>
        {mode === 'loud' ? 'Tap to speak SPANISH to customer' : 'Tap to hear SPANISH in your ear'}
      </Text>

      <ScrollView contentContainerStyle={s.grid} showsVerticalScrollIndicator={false}>
        {CATEGORIES.map((cat) => {
          const isActive = activeCat === cat.id;
          const builtInPhrases = getBuiltInPhrases(cat.id, userSetup, repProfile);
          const customPhrases = getCustomPhrases(cat.id);

          return (
            <View key={cat.id} style={s.catWrapper}>
              <TouchableOpacity
                style={[s.catBtn, isActive && s.catBtnActive]}
                onPress={() => setActiveCat(isActive ? null : cat.id)}
                activeOpacity={0.8}
              >
                <Text style={s.catIcon}>{cat.icon}</Text>
                <Text style={[s.catLabel, isActive && s.catLabelActive]}>{cat.label}</Text>
                {customPhrases.length > 0 && (
                  <View style={s.customBadge}>
                    <Text style={s.customBadgeTxt}>+{customPhrases.length}</Text>
                  </View>
                )}
              </TouchableOpacity>

              {isActive && (
                <View style={s.phrasesContainer}>
                  {/* Built-in phrases (with possible overrides) */}
                  {builtInPhrases.map((original, i) => {
                    const phrase = getEffectiveBuiltIn(cat.id, i, original);
                    const isEdited = !!customData.edits[`${cat.id}:${i}`];
                    return (
                      <View key={`b-${i}`} style={s.phraseRow}>
                        <TouchableOpacity
                          style={s.phraseBtn}
                          onPress={() => handleSpeak(phrase.es)}
                          activeOpacity={0.7}
                        >
                          <View style={s.phraseTextWrap}>
                            <Text style={s.phraseLabel}>
                              {phrase.label}
                              {isEdited && <Text style={s.editedMark}> •</Text>}
                            </Text>
                            <Text style={s.phraseEs}>{phrase.es}</Text>
                          </View>
                          <View style={s.phraseActions}>
                            <TouchableOpacity
                              style={s.editIconBtn}
                              onPress={() => openEditBuiltIn(cat.id, i, phrase)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Text style={s.editIcon}>✏️</Text>
                            </TouchableOpacity>
                            <Text style={s.playIcon}>{mode === 'loud' ? '🔊' : '🎧'}</Text>
                          </View>
                        </TouchableOpacity>
                      </View>
                    );
                  })}

                  {/* Custom (user-added) phrases */}
                  {customPhrases.map((phrase, i) => (
                    <View key={`c-${i}`} style={s.phraseRow}>
                      <TouchableOpacity
                        style={[s.phraseBtn, s.phraseBtnCustom]}
                        onPress={() => handleSpeak(phrase.es)}
                        activeOpacity={0.7}
                      >
                        <View style={s.phraseTextWrap}>
                          <Text style={s.phraseLabel}>{phrase.label}</Text>
                          <Text style={s.phraseEs}>{phrase.es}</Text>
                        </View>
                        <View style={s.phraseActions}>
                          <TouchableOpacity
                            style={s.editIconBtn}
                            onPress={() => openEditCustom(cat.id, i, phrase)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Text style={s.editIcon}>✏️</Text>
                          </TouchableOpacity>
                          <Text style={s.playIcon}>{mode === 'loud' ? '🔊' : '🎧'}</Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  ))}

                  {/* Add new phrase button */}
                  <TouchableOpacity
                    style={s.addPhraseBtn}
                    onPress={() => openAddNew(cat.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={s.addPhrasePlus}>＋</Text>
                    <Text style={s.addPhraseTxt}>Add phrase</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}

        <TouchableOpacity style={s.bottomBackBtn} onPress={onBack} activeOpacity={0.7}>
          <Text style={s.bottomBackTxt}>◀ Back</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Edit / Add Modal ── */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={s.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <View style={s.modalCard}>
              <Text style={s.modalTitle}>{isNewPhrase ? 'Add Phrase' : 'Edit Phrase'}</Text>

              <Text style={s.modalFieldLabel}>English</Text>
              <TextInput
                style={s.modalInput}
                value={editLabel}
                onChangeText={setEditLabel}
                onBlur={handleEnglishBlur}
                placeholder="Type in English — Spanish auto-translates"
                autoCapitalize="sentences"
                multiline
                returnKeyType="done"
                blurOnSubmit
              />

              <View style={s.spanishRow}>
                <Text style={s.modalFieldLabel}>Spanish</Text>
                {isTranslating && (
                  <View style={s.translatingRow}>
                    <ActivityIndicator size="small" color="#7C5CFC" />
                    <Text style={s.translatingTxt}>Translating...</Text>
                  </View>
                )}
              </View>
              <TextInput
                style={[s.modalInput, s.modalInputSpanish]}
                value={editEs}
                onChangeText={setEditEs}
                placeholder="Auto-filled — edit if needed"
                autoCapitalize="sentences"
                multiline
                returnKeyType="done"
                blurOnSubmit
              />
              <Text style={s.autoTranslateHint}>
                ✨ Spanish fills automatically when you type English
              </Text>

              <View style={s.modalBtnRow}>
                <TouchableOpacity style={s.modalCancelBtn} onPress={() => setEditModalVisible(false)}>
                  <Text style={s.modalCancelTxt}>Cancel</Text>
                </TouchableOpacity>

                {!isNewPhrase && editTarget && (
                  <TouchableOpacity
                    style={s.modalDeleteBtn}
                    onPress={editTarget.type === 'custom' ? handleDeletePhrase : handleResetBuiltIn}
                  >
                    <Text style={s.modalDeleteTxt}>
                      {editTarget.type === 'custom' ? '🗑️' : '↩️'}
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[s.modalSaveBtn, isTranslating && { opacity: 0.6 }]}
                  onPress={handleSaveEdit}
                  disabled={isTranslating}
                >
                  <Text style={s.modalSaveTxt}>{isTranslating ? 'Translating...' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F6FB' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: 18, fontWeight: '700', color: '#1A1B2E' },
  
  toggleContainer: { flexDirection: 'row', marginHorizontal: 20, marginTop: 10, backgroundColor: '#E5E7EB', borderRadius: 20, padding: 2 },
  toggleBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  toggleActive: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  toggleTxt: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  toggleTxtActive: { color: '#7C5CFC', fontWeight: '700' },
  
  modeHint: { textAlign: 'center', color: '#A0A3BD', fontSize: 12, marginTop: 8, marginBottom: 16 },

  grid: { paddingHorizontal: 16, paddingBottom: 40 },
  catWrapper: { marginBottom: 12, backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden', elevation: 2 },
  catBtn: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  catBtnActive: { backgroundColor: '#F5F6FB' },
  catIcon: { fontSize: 24 },
  catLabel: { fontSize: 18, fontWeight: '600', color: '#1A1B2E', flex: 1 },
  catLabelActive: { color: '#7C5CFC' },

  customBadge: { backgroundColor: '#7C5CFC', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  customBadgeTxt: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },

  phrasesContainer: { padding: 16, paddingTop: 0, gap: 10 },
  phraseRow: {},
  phraseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  phraseBtnCustom: {
    borderColor: '#D4C8FF',
    backgroundColor: '#FAFAFF',
  },
  phraseTextWrap: { flex: 1, marginRight: 8 },
  phraseLabel: { fontSize: 14, fontWeight: '600', color: '#374151' },
  phraseEs: { fontSize: 13, color: '#6B7280', fontStyle: 'italic', marginTop: 2 },
  editedMark: { color: '#7C5CFC', fontWeight: '700' },
  phraseActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  editIconBtn: { padding: 2 },
  editIcon: { fontSize: 14, opacity: 0.5 },
  playIcon: { fontSize: 18 },

  // Add phrase button
  addPhraseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#7C5CFC',
    borderStyle: 'dashed',
    gap: 6,
  },
  addPhrasePlus: { fontSize: 18, color: '#7C5CFC', fontWeight: '700' },
  addPhraseTxt: { fontSize: 14, color: '#7C5CFC', fontWeight: '600' },

  // Back button at bottom
  bottomBackBtn: { marginTop: 8, marginBottom: 20, paddingVertical: 16, backgroundColor: '#F0F1F7', borderRadius: 16, alignItems: 'center' },
  bottomBackTxt: { fontSize: 16, fontWeight: '600', color: '#6B7280' },

  // ── Modal styles ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1B2E',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalFieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
    marginTop: 8,
  },
  modalInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#1A1B2E',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minHeight: 48,
  },
  modalInputSpanish: {
    borderColor: '#D4C8FF',
    backgroundColor: '#FAFAFF',
  },
  spanishRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  translatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  translatingTxt: {
    fontSize: 12,
    color: '#7C5CFC',
    fontWeight: '600',
  },
  autoTranslateHint: {
    fontSize: 11,
    color: '#A0A3BD',
    marginTop: 4,
    fontStyle: 'italic',
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    gap: 10,
  },
  modalCancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#F0F1F7',
  },
  modalCancelTxt: { fontSize: 15, fontWeight: '600', color: '#6B7280' },
  modalDeleteBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
  },
  modalDeleteTxt: { fontSize: 16 },
  modalSaveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#7C5CFC',
    alignItems: 'center',
  },
  modalSaveTxt: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
