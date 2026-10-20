import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  StatusBar,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { detectIntent } from './src/intents';
import type { DetectionResult } from './src/intents';
// Wake word detection disabled — button-only activation for field reliability
// import { startWakeDetection, stopWakeDetection } from './src/wake';
import { DEFAULT_CONFIG } from './src/config';
import { generateCoachResponses } from './src/config/coach';
import { 
  speakSpanish, speakEnglish, speakCoachResponse, stopSpeaking, listVoices,
  speakSpanishLoud, speakSpanishPrivate, speakEnglishLoud,
  checkBluetooth, isBluetoothAvailable,
} from './src/voice';
import { buildGuidedFlow, classifyResponse } from './src/conversation';
import type { ConvoStep } from './src/conversation';
import { findObjection } from './src/data/objections';
import { findSignal } from './src/data/signals';
import { isHallucination } from './src/hallucinations';
import { ConvoStateMachine } from './src/state';
import type { ConvoState, MicMode } from './src/state';
import { DualMicController } from './src/mic';
import { matchObjection, buildResponse } from './src/objections';
import { translateSpanishToEnglish, translateEnglishToSpanish, warmupTranslation } from './src/translate';
import { loadSetup, saveSetup, loadRepProfile, saveRepProfile } from './src/config/storage';
import type { UserSetup, RepProfile } from './src/config/storage';
import { setupToConfig } from './src/config/storage';
import { buildCustomFlow } from './src/conversation/buildCustomFlow';
import SetupScreen from './src/screens/SetupScreen';
import ConvoScreen from './src/screens/ConvoScreen';
import TeachMeScreen from './src/screens/TeachMeScreen';
import PaywallScreen from './src/screens/PaywallScreen';
import TeammateFlow from './src/teammate/TeammateFlow';
import { PhoneIcon } from './src/teammate/icons';
import { checkSubscriptionStatus, disconnectStore } from './src/subscription';
import * as Speech from './src/speech';

let currentConfig = DEFAULT_CONFIG;
let coach = generateCoachResponses(currentConfig);
let convoFlow = buildGuidedFlow(currentConfig);
const stateMachine = new ConvoStateMachine('PITCH');
const micController = new DualMicController();

/* Translation now handled by GPT-4o-mini via src/translate/index.ts */

/* ── Icons ── */
const MicIcon = ({ color = '#FFF', size = 1 }: { color?: string; size?: number }) => (
  <View style={{ alignItems: 'center' }}>
    <View style={{ width: 14 * size, height: 22 * size, borderRadius: 7 * size, backgroundColor: color }} />
    <View style={{ width: 24 * size, height: 13 * size, borderBottomLeftRadius: 12 * size, borderBottomRightRadius: 12 * size, borderWidth: 2.5 * size, borderColor: color, borderTopWidth: 0, backgroundColor: 'transparent', marginTop: -8 * size }} />
    <View style={{ width: 2.5 * size, height: 6 * size, backgroundColor: color }} />
    <View style={{ width: 14 * size, height: 2.5 * size, backgroundColor: color, borderRadius: 2 * size }} />
  </View>
);

const SwapArrows = () => (
  <View style={{ alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
      <View style={{ width: 14, height: 2, backgroundColor: '#FFF', borderRadius: 1 }} />
      <View style={{ width: 0, height: 0, borderTopWidth: 4, borderTopColor: 'transparent', borderBottomWidth: 4, borderBottomColor: 'transparent', borderLeftWidth: 5, borderLeftColor: '#FFF' }} />
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ width: 0, height: 0, borderTopWidth: 4, borderTopColor: 'transparent', borderBottomWidth: 4, borderBottomColor: 'transparent', borderRightWidth: 5, borderRightColor: '#FFF' }} />
      <View style={{ width: 14, height: 2, backgroundColor: '#FFF', borderRadius: 1 }} />
    </View>
  </View>
);

/* ── Wave Bar ── */
const WaveBar = ({ delay, isActive }: { delay: number; isActive: boolean }) => {
  const height = useRef(new Animated.Value(6)).current;
  useEffect(() => {
    if (isActive) {
      const anim = Animated.loop(Animated.sequence([
        Animated.timing(height, { toValue: 24 + Math.random() * 18, duration: 280 + delay * 40, useNativeDriver: false }),
        Animated.timing(height, { toValue: 4, duration: 280 + delay * 40, useNativeDriver: false }),
      ]));
      const t = setTimeout(() => anim.start(), delay * 60);
      return () => { clearTimeout(t); anim.stop(); };
    } else {
      Animated.timing(height, { toValue: 6, duration: 300, useNativeDriver: false }).start();
    }
  }, [isActive]);
  return <Animated.View style={{ width: 3, borderRadius: 2, marginHorizontal: 1.5, height, backgroundColor: isActive ? '#7C5CFC' : '#D4D6E4' }} />;
};

/* ── Auto-sleep ── */
const AUTO_SLEEP_MS = 120000; // 2 min

/* ── Main App ── */
export default function App() {
  const [appMode, setAppMode] = useState<'sleep' | 'active'>('sleep');
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [translated, setTranslated] = useState('');
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [listenMode, setListenMode] = useState<'es' | 'en'>('es');
  const [convoMode, setConvoMode] = useState<'guided' | 'assist' | 'manual'>('manual');
  const [currentStep, setCurrentStep] = useState<string>('greeting');
  const [autoListening, setAutoListening] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'listening' | 'processing' | 'done' | 'error'>('idle');
  const [stepHistory, setStepHistory] = useState<string[]>([]);
  const [isSpeakingState, setIsSpeakingState] = useState(false);
  const [activeMic, setActiveMic] = useState<'customer' | 'rep'>('customer');
  const [translatedText, setTranslatedText] = useState('');
  const [editingTranscript, setEditingTranscript] = useState(false);
  const [editText, setEditText] = useState('');
  const [showSetup, setShowSetup] = useState<boolean | null>(null); // null = loading
  const [showConvo, setShowConvo] = useState(false);
  const [showTeachMe, setShowTeachMe] = useState(false);
  const [showTeammate, setShowTeammate] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState<boolean | null>(null); // null = checking
  const [userSetup, setUserSetup] = useState<UserSetup | null>(null);
  const [repProfile, setRepProfile] = useState<RepProfile | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [prayerStep, setPrayerStep] = useState(-1); // -1 = not in prayer mode

  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0)).current;
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const convoModeRef = useRef<'guided' | 'assist' | 'manual'>('manual');
  const ignoreNextTranscript = useRef(false);
  const isRecordingRef = useRef(false);
  const appModeRef = useRef<'sleep' | 'active'>('sleep');
  const currentStepRef = useRef<string>('greeting');

  /* ── Load speech model with retry ── */
  const loadSpeechModel = useCallback(async (attempt = 1) => {
    const MAX_RETRIES = 3;
    try {
      await Speech.preloadModel();
      setModelReady(true);
      setStatus('idle');
      listVoices();
      console.log(`[App] Speech model loaded (attempt ${attempt})`);
    } catch (e: any) {
      console.warn(`[App] preloadModel failed (attempt ${attempt}):`, e?.message || e);
      if (attempt < MAX_RETRIES) {
        console.log(`[App] Retrying speech model load in ${attempt * 2}s...`);
        setTimeout(() => loadSpeechModel(attempt + 1), attempt * 2000);
      } else {
        const diag = Speech.diagnose();
        console.error('[App] Speech model failed after all retries. Diag:', diag);
        setModelReady(true); // Let UI proceed but recording will show diagnostic
        setStatus('idle');
      }
    }
  }, []);

  /* ── Check subscription status ── */
  useEffect(() => {
    checkSubscriptionStatus().then(active => {
      console.log('[App] Subscription status:', active ? 'active' : 'inactive');
      setIsSubscribed(active);
    }).catch(() => {
      // If check fails (e.g., first install, no network), default to not subscribed
      console.warn('[App] Subscription check failed, defaulting to inactive');
      setIsSubscribed(false);
    });

    return () => {
      disconnectStore();
    };
  }, []);

  /* ── Load saved setup + pre-load model (only after subscription confirmed) ── */
  useEffect(() => {
    if (isSubscribed !== true) return; // Don't load app stuff until subscribed

    // Check if user has completed setup
    loadSetup().then(saved => {
      if (saved && saved.setupComplete) {
        setUserSetup(saved);
        applySetup(saved);
        setShowSetup(false);
      } else {
        setShowSetup(true);
      }
    });

    // Load rep profile (for convo personalization)
    loadRepProfile().then(profile => {
      if (profile) setRepProfile(profile);
    });

    // Pre-warm Supabase translation function (avoids cold start on first real call)
    warmupTranslation();

    // Check Bluetooth availability (Meta Glasses)
    checkBluetooth().then(bt => {
      console.log('[App] Bluetooth available:', bt);
    });

    setStatus('loading');
    loadSpeechModel();
  }, [isSubscribed]);

  const applySetup = (setup: UserSetup) => {
    currentConfig = setupToConfig(setup);
    coach = generateCoachResponses(currentConfig);
    convoFlow = buildCustomFlow(setup);
    // Debug: log all step IDs in order
    const stepIds = Array.from(convoFlow.keys());
    console.log('[App] Applied setup for:', setup.repName, '@', setup.companyName);
    console.log('[App] Flow steps:', stepIds.join(', '));
    console.log('[App] Collect fields:', setup.collectFields.join(', '));
  };

  const handleSetupComplete = useCallback((setup: UserSetup) => {
    console.log('[App] handleSetupComplete called for:', setup.repName, '— setupComplete:', setup.setupComplete);
    // Batch all state updates together — critical for screen transition
    setUserSetup(setup);
    applySetup(setup);
    // Always reset to sleep mode so user starts fresh after editing settings
    // This ensures any reordering/edits in Review take effect from a clean state
    setAppMode('sleep');
    setCurrentStep('greeting');
    currentStepRef.current = 'greeting';
    setConvoMode('manual');
    convoModeRef.current = 'manual';
    setStepHistory([]);
    setTranscript('');
    setTranslated('');
    setTranslatedText('');
    setDetection(null);
    setStatus('idle');
    setIsRecording(false);
    setAutoListening(false);
    setIsSpeakingState(false);
    setActiveMic('customer');
    setPrayerStep(-1);
    stopSpeaking();
    stateMachine.reset();
    micController.reset();
    // Use setTimeout to ensure state updates flush before hiding setup
    setTimeout(() => {
      setShowSetup(false);
      console.log('[App] showSetup set to false — returning to sleep mode');
    }, 100);
  }, []);

  /* ── Timer helpers ── */
  const resetSleepTimer = useCallback(() => {
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    sleepTimerRef.current = setTimeout(() => goToSleep(), AUTO_SLEEP_MS);
  }, []);

  const goToSleep = useCallback(() => {
    stopSpeaking();
    setAppMode('sleep');
    setTranscript(''); setTranslated(''); setDetection(null);
    setCurrentStep('greeting'); setConvoMode('manual'); convoModeRef.current = 'manual'; // ← FULL RESET for next customer
    setStatus('idle'); setIsRecording(false); setAutoListening(false);
    setStepHistory([]); setIsSpeakingState(false); setActiveMic('customer'); setTranslatedText('');
    setPrayerStep(-1);
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    
    // Reset state machine + mic controller
    stateMachine.reset();
    micController.reset();
  }, []);

  /* ── Go back to previous step ── */
  const stepHistoryRef = useRef<string[]>([]);
  useEffect(() => { stepHistoryRef.current = stepHistory; }, [stepHistory]);

  const goBack = useCallback(() => {
    const history = stepHistoryRef.current;
    console.log('[goBack] History:', history.join(' → '));
    
    if (history.length === 0) {
      console.log('[goBack] No history, cannot go back');
      return;
    }

    // Walk backwards through history to find a valid step in the current flow
    let targetStep: string | null = null;
    let sliceAt = history.length;

    for (let i = history.length - 1; i >= 0; i--) {
      const candidate = history[i];
      if (convoFlow.has(candidate)) {
        targetStep = candidate;
        sliceAt = i;
        break;
      }
      console.log('[goBack] Skipping invalid step:', candidate);
    }

    if (!targetStep) {
      console.log('[goBack] No valid step found in history');
      return;
    }

    const step = convoFlow.get(targetStep)!;
    console.log('[goBack] Going to:', targetStep);
    
    setStepHistory(history.slice(0, sliceAt));
    setCurrentStep(targetStep);
    setDetection({
      intent: { id: targetStep, name: step.id.replace(/_/g, ' '), alert: step.isClose ? 'CLOSE_NOW' : step.isExit ? 'NEUTRAL' : 'INFO', phrases: [], keywords: [], spanglish: [], coachEn: step.coachEn, coachEs: step.sayEs },
      confidence: 'exact', alert: step.isClose ? 'CLOSE_NOW' : 'INFO', latencyMs: 0, matchedOn: targetStep,
    });
    resetSleepTimer();
  }, []);

  /* ── Keep currentStep ref in sync ── */
  useEffect(() => { currentStepRef.current = currentStep; }, [currentStep]);

  /* ── Advance conversation to a step ── */
  const goToStep = useCallback((stepId: string, autoSpeak: boolean = true) => {
    const step = convoFlow.get(stepId);
    if (!step) {
      console.log('[goToStep] Step not found:', stepId);
      return;
    }

    // Push current step to history for back navigation (use ref for accurate value)
    const curr = currentStepRef.current;
    setStepHistory(prev => [...prev, curr]);
    setCurrentStep(stepId);
    currentStepRef.current = stepId;
    setDetection({
      intent: { id: stepId, name: step.id.replace(/_/g, ' '), alert: step.isClose ? 'CLOSE_NOW' : step.isExit ? 'NEUTRAL' : 'INFO', phrases: [], keywords: [], spanglish: [], coachEn: step.coachEn, coachEs: step.sayEs },
      confidence: 'exact', alert: step.isClose ? 'CLOSE_NOW' : 'INFO', latencyMs: 0, matchedOn: stepId,
    });

    if (autoSpeak) {
      // Assist mode → speaker (customer hears)
      // Start/Guided mode → Bluetooth (rep hears in glasses)
      const isAssist = convoModeRef.current === 'assist';
      const speakFn = isAssist ? speakSpanishLoud : speakSpanishPrivate;
      
      setIsSpeakingState(true);
      speakFn(step.sayEs, () => {
        setIsSpeakingState(false);
        if (stateMachine.shouldAutoListen()) {
          setTimeout(() => autoListen(), 400);
        }
      });
    }

    resetSleepTimer();
  }, []);

  /* ── Keep refs in sync for use inside callbacks ── */
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => { appModeRef.current = appMode; }, [appMode]);

  /* ── Auto-listen after system speaks ── */
  const autoListen = useCallback(async () => {
    // Use refs to avoid stale closure
    if (isRecordingRef.current || appModeRef.current !== 'active') {
      console.log('[autoListen] Blocked: recording=' + isRecordingRef.current + ' appMode=' + appModeRef.current);
      return;
    }

    // Check if state machine allows auto-listen
    const currentMicMode = stateMachine.getMicMode();
    if (!micController.canAutoListen(currentMicMode)) {
      console.log('[autoListen] Blocked by micController: mode=' + currentMicMode);
      return;
    }

    const target = stateMachine.getAutoListenTarget();
    if (!target) {
      console.log('[autoListen] No auto-listen target in current state: ' + stateMachine.getState());
      return;
    }

    const micGranted = await Speech.requestMicPermission();
    if (!micGranted) return;

    if (!Speech.isReady()) {
      console.error('[autoListen] Speech module not ready — attempting reload...');
      try {
        await Speech.preloadModel();
        setModelReady(true);
        console.log('[autoListen] Speech model loaded on retry');
      } catch (e: any) {
        console.error('[autoListen] Reload failed:', e?.message);
        return;
      }
    }

    console.log('[autoListen] Starting auto-listen: target=' + target + ' state=' + stateMachine.getState());

    // Stop any lingering capture before starting a new one (iOS safety)
    await Speech.stopCapture();

    // Start auto-listen
    micController.startAutoListen(target);
    setActiveMic(target);
    setIsRecording(true);
    isRecordingRef.current = true;
    setAutoListening(true);
    setStatus('listening');
    setTranscript('');
    resetSleepTimer();

    try {
      const result = await Speech.recordAndTranscribe(15); // 15s max, VAD stops it fast
      console.log('[autoListen] Raw result: "' + result + '"');
      
      micController.stopAutoListen();
      setIsRecording(false);
      isRecordingRef.current = false;
      setAutoListening(false);

      // If Play was pressed while we were recording, discard this result
      if (ignoreNextTranscript.current) {
        ignoreNextTranscript.current = false;
        return;
      }

      // Filter hallucinations before processing
      if (isHallucination(result)) {
        console.log('[autoListen] Filtered as hallucination: "' + result + '"');
        setTranscript('');
        setStatus('idle');
        // Re-listen if state machine still expects input
        if (stateMachine.shouldAutoListen()) {
          console.log('[autoListen] Re-listening after hallucination filter');
          setTimeout(() => autoListen(), 300);
        }
        return;
      }

      console.log('[autoListen] Accepted transcript: "' + result + '"');
      setTranscript(result);
      setStatus('done');

      // Process the response — customer mic always feeds into conversation engine
      processResponse(result);
    } catch (e: any) {
      console.log('[autoListen] Error: ' + (e.message || e));
      micController.stopAutoListen();
      setIsRecording(false);
      isRecordingRef.current = false;
      setAutoListening(false);
      ignoreNextTranscript.current = false;
      setStatus('error');
    }
  }, []);

  /* ── Process customer/rep response and advance conversation ── */
  const processResponse = useCallback((text: string) => {
    const currentState = stateMachine.getState();
    console.log(`[processResponse] Current state: ${currentState}, Input: "${text}"`);

    // Check for objections first (using new objection loader)
    const objection = matchObjection(text);
    if (objection) {
      console.log(`[processResponse] Matched objection: ${objection.intent}`);
      
      // Transition to OBJECTION_RESPONSE state
      stateMachine.transition('objection_captured');

      const responseText = buildResponse(objection);
      setDetection({
        intent: { 
          id: objection.intent, 
          name: objection.intent.toUpperCase(), 
          alert: 'OBJECTION', 
          phrases: [], 
          keywords: [], 
          spanglish: [], 
          coachEn: objection.rep_response_en_summary, 
          coachEs: responseText 
        },
        confidence: 'phrase', 
        alert: 'OBJECTION', 
        latencyMs: 0, 
        matchedOn: objection.spanish_variations[0],
      });

      // Check if this is a hard stop
      if (objection.is_hard_stop) {
        console.log('[processResponse] Hard stop detected. Transitioning to EXIT.');
        stateMachine.transition('exit_now');
        // Show exit guidance
        setDetection({
          intent: {
            id: 'exit',
            name: 'EXIT',
            alert: 'NEUTRAL',
            phrases: [],
            keywords: [],
            spanglish: [],
            coachEn: 'Customer is not interested. Do not push. Exit politely.',
            coachEs: 'Gracias por su tiempo. Que tenga un buen día.',
          },
          confidence: 'exact',
          alert: 'NEUTRAL',
          latencyMs: 0,
          matchedOn: 'hard_stop',
        });
        return;
      }

      // Speak the objection response — route based on mode
      const isAssistMode = convoModeRef.current === 'assist';
      const objSpeakFn = isAssistMode ? speakSpanishLoud : speakSpanishPrivate;
      setIsSpeakingState(true);
      objSpeakFn(responseText, () => {
        setIsSpeakingState(false);
        // After response, transition back to OBJECTION_LISTEN (or EXIT if max attempts)
        const nextState = stateMachine.transition('response_given');
        if (nextState === 'EXIT') {
          setDetection({
            intent: {
              id: 'exit',
              name: 'MAX ATTEMPTS',
              alert: 'NEUTRAL',
              phrases: [],
              keywords: [],
              spanglish: [],
              coachEn: 'Max objection attempts reached. Stop pushing. Exit politely.',
              coachEs: 'Está bien. Gracias por su tiempo.',
            },
            confidence: 'exact',
            alert: 'NEUTRAL',
            latencyMs: 0,
            matchedOn: 'max_attempts',
          });
        } else if (nextState === 'OBJECTION_LISTEN') {
          // Auto-listen for next objection or response
          setTimeout(() => autoListen(), 500);
        }
      });
      return;
    }

    // Check for buying signals (highest priority)
    const signal = findSignal(text);
    if (signal) {
      if (signal.type === 'buying') {
        stateMachine.transition('yes');
        goToStep('close_offer');
        return;
      }
      if (signal.type === 'callback') {
        stateMachine.transition('yes');
        goToStep('soft_close');
        return;
      }
    }

    // Handle state-based transitions
    if (currentState === 'POST_PITCH_LISTEN') {
      // Customer replied post-pitch
      stateMachine.transition('customer_replied');
      // Classify sentiment and advance
      const sentiment = classifyResponse(text);
      if (sentiment === 'positive') {
        stateMachine.transition('yes');
        goToStep('close_offer');
      } else if (sentiment === 'negative') {
        stateMachine.transition('no');
        goToStep('handle_objection');
      } else {
        // Neutral → go to attempt close
        goToStep('attempt_close_question');
      }
      return;
    }

    if (currentState === 'ATTEMPT_CLOSE') {
      // YES/NO decision
      const sentiment = classifyResponse(text);
      if (sentiment === 'positive') {
        stateMachine.transition('yes');
        goToStep('onboarding_start');
      } else {
        stateMachine.transition('no');
        // Transition to objection prompt → listen
        stateMachine.transition('objection_captured');
        goToStep('ask_why');
      }
      return;
    }

    // Fallback: use old conversation flow
    const step = convoFlow.get(currentStep);
    if (!step) return;

    const sentiment = classifyResponse(text);
    let nextStepId: string | undefined;

    if (sentiment === 'positive') nextStepId = step.nextOnPositive;
    else if (sentiment === 'negative') nextStepId = step.nextOnNegative;
    else if (sentiment === 'question') nextStepId = step.nextOnQuestion;

    if (!nextStepId) nextStepId = step.nextOnPositive || 'switching_push';

    goToStep(nextStepId);
    resetSleepTimer();
  }, [currentStep]);

  /* ── Advance to next logical step (for Next button) ── */
  const handleNext = useCallback(() => {
    const step = convoFlow.get(currentStep);
    if (!step) return;
    
    const nextId = step.nextOnPositive || step.nextOnQuestion || 'switching_push';
    const nextStep = convoFlow.get(nextId);
    const st = stateMachine.getState();

    // Transition state machine based on step phases
    if (nextStep) {
      // Pitch step that has listenFor='customer_response' → auto-listen after text reads
      // (price_pitch_returning, price_pitch_new, switching_push, etc.)
      if (st === 'PITCH' && nextStep.phase === 'pitch' && nextStep.listenFor === 'customer_response') {
        stateMachine.transition('pitch_complete');
        // Now in POST_PITCH_LISTEN — goToStep will trigger auto-listen
      }
      // Going directly to attempt_close page
      else if (nextStep.phase === 'attempt_close') {
        // Make sure we're in ATTEMPT_CLOSE state
        if (st === 'PITCH') {
          stateMachine.transition('pitch_complete');
          stateMachine.transition('timeout');
        } else if (st === 'POST_PITCH_LISTEN') {
          stateMachine.transition('timeout');
        }
        // Now in ATTEMPT_CLOSE — goToStep will trigger auto-listen
      }
    }
    
    goToStep(nextId, true);
  }, [currentStep]);

  /* ── Yes / No fallback buttons — tap when mic doesn't catch it ── */
  const handleYes = useCallback(() => {
    const step = convoFlow.get(currentStep);
    if (!step) return;
    stopSpeaking();
    setTranscript('✅ Sí (manual)');
    
    // Drive state machine
    stateMachine.transition('yes');
    
    const nextId = step.nextOnPositive || step.nextOnQuestion || 'switching_push';
    goToStep(nextId);
    resetSleepTimer();
  }, [currentStep]);

  const handleNo = useCallback(() => {
    const step = convoFlow.get(currentStep);
    if (!step) return;
    stopSpeaking();
    setTranscript('❌ No (manual)');
    
    // Drive state machine into objection flow
    stateMachine.transition('no');
    
    const nextId = step.nextOnNegative || 'handle_objection';
    goToStep(nextId);
    resetSleepTimer();
  }, [currentStep]);

  /* ── Activate (from any trigger) ── */
  const activate = useCallback((mode: 'guided' | 'assist', startStep: string = 'greeting') => {
    setAppMode('active');
    setConvoMode(mode);
    convoModeRef.current = mode;
    setCurrentStep(startStep);
    setTranscript(''); setTranslated('');
    setStepHistory([]);

    // Reset state machine to PITCH
    stateMachine.reset();
    micController.reset();

    // Directly speak here instead of relying on goToStep's stale convoMode
    const step = convoFlow.get(startStep);
    if (!step) return;

    setDetection({
      intent: { id: startStep, name: step.id.replace(/_/g, ' '), alert: step.isClose ? 'CLOSE_NOW' : step.isExit ? 'NEUTRAL' : 'INFO', phrases: [], keywords: [], spanglish: [], coachEn: step.coachEn, coachEs: step.sayEs },
      confidence: 'exact', alert: step.isClose ? 'CLOSE_NOW' : 'INFO', latencyMs: 0, matchedOn: startStep,
    });

    // Auto-speak the greeting
    // Assist mode → speaker (customer hears the rep's lines)
    // Start/Guided mode → Bluetooth (rep hears in glasses, reads along)
    const isAssist = mode === 'assist';
    const speakFn = isAssist ? speakSpanishLoud : speakSpanishPrivate;
    
    setIsSpeakingState(true);
    speakFn(step.sayEs, () => {
      setIsSpeakingState(false);
    });

    resetSleepTimer();
  }, []);

  /* ── Determine first step from user's section order ── */
  const getFirstStep = useCallback((): string => {
    if (!userSetup?.sectionOrder || userSetup.sectionOrder.length === 0) return 'greeting';
    // Map the first section ID to the actual convo step
    const first = userSetup.sectionOrder[0];
    const sectionToStep: Record<string, string> = {
      'greeting': 'greeting',
      'ask_service': 'ask_service',
      'ask_provider': 'ask_provider',
      'ask_how_long': 'ask_how_long',
      'ask_how_much': 'ask_how_much',
      'ask_had_company': 'ask_had_optimum',
      'pitch': 'price_pitch_new',
      'close': 'close_offer',
      'extra': 'extra_info_step',
      'collect': userSetup.collectFields.length > 0 ? `collect_${userSetup.collectFields[0]}` : 'greeting',
      'install': 'shipping_info',
      'closing': 'done',
    };
    // Handle extra_N sections (extra_0 → extra_info_0, etc.)
    let stepId: string;
    if (first.startsWith('extra_')) {
      stepId = `extra_info_${first.split('_')[1]}`;
    } else {
      stepId = sectionToStep[first] || 'greeting';
    }
    // Verify it exists in the flow
    return convoFlow.has(stepId) ? stepId : 'greeting';
  }, [userSetup]);

  /* ── Start button ── */
  const handleStart = useCallback(() => {
    activate('guided', getFirstStep());
  }, [getFirstStep]);

  /* ── Assist button ── */
  const handleAssist = useCallback(() => {
    activate('assist', getFirstStep());
  }, [getFirstStep]);

  /* ── Sleep mode: wake detection disabled — button-only activation ── */
  // Wake word detection removed for field reliability. Users tap Start/Assist instead.
  // useEffect(() => {
  //   if (appMode === 'sleep' && modelReady) {
  //     const stopFn = startWakeDetection(handleWake);
  //     return () => stopFn();
  //   }
  // }, [appMode, modelReady]);

  /* ── Pulse animation ── */
  useEffect(() => {
    if (isRecording) {
      const scale = Animated.loop(Animated.sequence([
        Animated.timing(pulseScale, { toValue: 1.35, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseScale, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]));
      const opacity = Animated.loop(Animated.sequence([
        Animated.timing(pulseOpacity, { toValue: 0.25, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseOpacity, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]));
      scale.start(); opacity.start();
      return () => { scale.stop(); opacity.stop(); };
    } else { pulseScale.setValue(1); pulseOpacity.setValue(0); }
  }, [isRecording]);

  /* ── Dual mic press — customer (ES→EN) or rep (EN→ES) ── */
  const handleDualRecord = async (target: 'customer' | 'rep') => {
    // Use ref to avoid stale closure
    if (isRecordingRef.current || appModeRef.current === 'sleep') {
      console.log('[handleDualRecord] Blocked: isRecording=' + isRecordingRef.current + ' appMode=' + appModeRef.current);
      return;
    }

    const micGranted = await Speech.requestMicPermission();
    if (!micGranted) { setStatus('error'); setTranscript('Mic permission denied'); return; }

    if (!Speech.isReady()) {
      console.error('[handleDualRecord] Speech module not ready — attempting reload...');
      setStatus('loading');
      setTranscript('Loading speech engine…');
      try {
        await Speech.preloadModel();
        setModelReady(true);
        setStatus('idle');
        setTranscript('');
        console.log('[handleDualRecord] Speech model loaded on retry — tap mic again');
        return;
      } catch (e: any) {
        const diag = Speech.diagnose();
        const errMsg = e?.message || 'unknown error';
        console.error('[handleDualRecord] Reload failed:', errMsg, 'diag:', diag);
        setStatus('error');
        setTranscript(`❌ ${errMsg}\n${diag}`);
        return;
      }
    }

    console.log(`[handleDualRecord] Starting: target=${target}`);

    // Stop any lingering capture before starting a new one (iOS safety)
    await Speech.stopCapture();

    micController.startManualListen(target);
    setActiveMic(target);

    stopSpeaking();
    setIsRecording(true);
    isRecordingRef.current = true;
    setStatus('listening');
    setTranscript('');
    setTranslatedText('');
    setAutoListening(false);
    resetSleepTimer();

    try {
      // Use mic-specific transcription:
      // Customer mic: Spanish → English (Whisper translates)
      // Rep mic: English → transcribe only (we translate to Spanish in JS)
      const micMode = target === 'customer' ? 'customer' : 'rep';
      const result = await Speech.recordAndTranscribeForMic(15, micMode);
      console.log(`[handleDualRecord] Raw result (${micMode}): "${result}"`);
      
      micController.stopManualListen();
      setIsRecording(false);
      isRecordingRef.current = false;

      if (ignoreNextTranscript.current) {
        ignoreNextTranscript.current = false;
        return;
      }

      if (isHallucination(result)) {
        console.log('[handleDualRecord] Hallucination filtered');
        setTranscript('');
        setStatus('idle');
        resetSleepTimer();
        return;
      }

      setStatus('done');
      resetSleepTimer();

      // Process based on which mic — GPT translates both directions
      if (target === 'customer') {
        // Whisper heard Spanish → show Spanish, GPT translates to English
        setTranscript(result);
        setTranslatedText('⏳ Translating…');
        console.log('[handleDualRecord] Customer mic: ES→EN via GPT');
        translateSpanishToEnglish(result).then(tr => {
          if (!tr.ok) {
            setTranslatedText('⚠️ Offline — connect to Wi-Fi');
            console.log('[handleDualRecord] ES→EN offline/failed');
          } else {
            setTranslatedText(tr.translated);
            console.log(`[handleDualRecord] ES→EN done: "${tr.translated}" (${tr.latencyMs}ms)`);
          }
        }).catch(() => setTranslatedText('⚠️ Translation failed'));
      } else {
        // Whisper heard English → show English, GPT translates to Spanish
        setTranscript(result);
        setTranslatedText('⏳ Translating…');
        console.log('[handleDualRecord] Rep mic: EN→ES via GPT');
        translateEnglishToSpanish(result).then(tr => {
          if (!tr.ok) {
            setTranslatedText('⚠️ Offline — connect to Wi-Fi');
            console.log('[handleDualRecord] EN→ES offline/failed');
          } else {
            setTranslatedText(tr.translated);
            console.log(`[handleDualRecord] EN→ES done: "${tr.translated}" (${tr.latencyMs}ms)`);
          }
        }).catch(() => setTranslatedText('⚠️ Translation failed'));
      }

    } catch (e: any) {
      console.log('[handleDualRecord] Error: ' + (e.message || e));
      micController.stopManualListen();
      setIsRecording(false);
      isRecordingRef.current = false;
      ignoreNextTranscript.current = false;
      setStatus('error');
      setTranscript(e.message || 'Something went wrong');
    }
  };

  /* ── Legacy single mic (kept for backward compat) ── */
  const handleRecord = async () => handleDualRecord('customer');

  /* ── Speaker helpers ── */
  /* Stop active recording before speaking */
  const stopRecordingForSpeech = () => {
    if (isRecording) {
      ignoreNextTranscript.current = true;
      micController.stopAutoListen();
      micController.stopManualListen();
      setIsRecording(false);
      setAutoListening(false);
      setStatus('idle');
    }
  };

  // Track which button is currently speaking: 'loud' | 'replay' | 'auto' | null
  const [speakingSource, setSpeakingSource] = useState<'loud' | 'replay' | 'auto' | null>(null);

  /* Stop any active speech */
  const handleStop = () => {
    stopSpeaking();
    setIsSpeakingState(false);
    setSpeakingSource(null);
  };

  /* Play 🔊 (SPEAKER) — customer hears */
  const handlePlayLoud = () => {
    if (!detection?.intent?.coachEs) return;

    if (isSpeakingState) { handleStop(); return; }

    stopRecordingForSpeech();
    const textToSpeak = detection.intent.coachEs;

    setSpeakingSource('loud');
    setIsSpeakingState(true);
    speakSpanishLoud(textToSpeak, () => {
      setIsSpeakingState(false);
      setSpeakingSource(null);
      setTimeout(() => autoListen(), 400);
    });
    resetSleepTimer();
  };

  /* 🔁 Replay (BLUETOOTH) — rep hears privately in glasses */
  const handleReplay = () => {
    if (!detection?.intent?.coachEs) return;

    if (isSpeakingState) { handleStop(); return; }

    stopRecordingForSpeech();
    const textToSpeak = detection.intent.coachEs;

    setSpeakingSource('replay');
    setIsSpeakingState(true);
    speakSpanishPrivate(textToSpeak, () => {
      setIsSpeakingState(false);
      setSpeakingSource(null);
    });
    resetSleepTimer();
  };

  /* Legacy handler */
  const handleSpeaker = handlePlayLoud;

  /* ── Toggle listen mode ── */
  const toggleListenMode = () => {
    setListenMode(prev => prev === 'es' ? 'en' : 'es');
  };

  const statusLabel = () => {
    if (appMode === 'sleep') return modelReady ? '💤 Tap Start or Assist to begin' : 'Loading model…';
    
    const micStatus = micController.getStatus();
    const currentState = stateMachine.getState();
    
    if (micStatus.isListening) {
      const targetLabel = micStatus.target === 'customer' ? 'Spanish (Customer)' : 'English (Rep)';
      const modeLabel = micStatus.isAuto ? 'Auto' : 'Manual';
      return `🎤 ${modeLabel} listening: ${targetLabel}`;
    }
    
    switch (status) {
      case 'listening': return listenMode === 'es' ? '🎤 Listening for Spanish…' : '🎤 Listening for English…';
      case 'processing': return 'Translating…';
      case 'done': return 'Tap mic to listen';
      case 'error': return 'Tap to try again';
      default: return 'Tap mic to listen';
    }
  };

  /* ── RENDER ── */

  // Loading state — checking subscription + setup
  if (isSubscribed === null || (isSubscribed && showSetup === null)) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F5F6FB' }}>
        <StatusBar barStyle="dark-content" backgroundColor="#F5F6FB" />
      </View>
    );
  }

  // Paywall — shown when not subscribed
  if (!isSubscribed) {
    return (
      <SafeAreaProvider style={{ flex: 1 }}>
        <PaywallScreen onSubscribed={() => setIsSubscribed(true)} />
      </SafeAreaProvider>
    );
  }

  // Setup screen
  if (showSetup) {
    return (
      <SafeAreaProvider style={{ flex: 1 }}>
        <SetupScreen onComplete={handleSetupComplete} existingSetup={userSetup} />
      </SafeAreaProvider>
    );
  }

  // TeachMe screen
  if (showTeachMe) {
    return (
      <SafeAreaProvider style={{ flex: 1 }}>
        <TeachMeScreen
          existingProfile={repProfile}
          onComplete={(profile) => {
            setRepProfile(profile);
            setShowTeachMe(false);
          }}
          onBack={() => setShowTeachMe(false)}
        />
      </SafeAreaProvider>
    );
  }

  // Teammate mode: Ana, the AI Spanish rep, on speakerphone
  if (showTeammate) {
    return (
      <SafeAreaProvider style={{ flex: 1 }}>
        <TeammateFlow userSetup={userSetup} onExit={() => setShowTeammate(false)} />
      </SafeAreaProvider>
    );
  }

  // Convo Mode Screen
  if (showConvo) {
    return (
      <SafeAreaProvider style={{ flex: 1 }}>
        <ConvoScreen userSetup={userSetup} repProfile={repProfile} onBack={() => setShowConvo(false)} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider style={{ flex: 1 }}>
      <SafeAreaView style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor={appMode === 'sleep' ? '#E8E9F0' : '#F5F6FB'} />

      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <View style={s.header}>
          <Text style={s.logo}>Hola</Text>
          <Text style={s.tagline}>{appMode === 'sleep' ? 'sleeping' : 'active'}</Text>
        </View>

        {/* ── Mic Mode Indicator: Rep (left) | Customer (right) ── */}
        {appMode === 'active' && (
          <View style={s.micModeRow}>
            <View style={[s.micModePill, activeMic === 'rep' && s.micModePillRep]}>
              <Text style={[s.micModeLabel, activeMic === 'rep' && s.micModeLabelActive]}>🇺🇸 Rep</Text>
            </View>
            <View style={[s.micModePill, activeMic === 'customer' && s.micModePillCustomer]}>
              <Text style={[s.micModeLabel, activeMic === 'customer' && s.micModeLabelActive]}>🇲🇽 Customer</Text>
            </View>
          </View>
        )}

        {/* ── Transcript Card ── */}
        <View style={s.cardWrap}>
          <View style={[s.card, appMode === 'sleep' && s.cardSleep]}>
            {appMode === 'sleep' ? (
              <Text style={s.cardEmpty}>Tap Start or Assist to begin</Text>
            ) : transcript ? (
              <>
                <Text style={s.cardTag}>{activeMic === 'customer' ? '🇲🇽 HEARD (SPANISH)' : '🇺🇸 HEARD (ENGLISH)'}</Text>
                {/* Editable transcript — tap to correct misheard words */}
                {editingTranscript ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TextInput
                      style={[s.cardBody, { flex: 1, borderBottomWidth: 1, borderBottomColor: '#7C3AED', paddingVertical: 4 }]}
                      value={editText}
                      onChangeText={setEditText}
                      autoFocus
                      onSubmitEditing={() => {
                        const corrected = editText.trim();
                        if (corrected && corrected !== transcript) {
                          setTranscript(corrected);
                          setTranslatedText('⏳ Re-translating…');
                          setEditingTranscript(false);
                          // Re-translate the corrected text
                          if (activeMic === 'customer') {
                            translateSpanishToEnglish(corrected).then(tr => {
                              setTranslatedText(tr.ok ? tr.translated : '⚠️ Translation failed');
                            }).catch(() => setTranslatedText('⚠️ Translation failed'));
                          } else {
                            translateEnglishToSpanish(corrected).then(tr => {
                              setTranslatedText(tr.ok ? tr.translated : '⚠️ Translation failed');
                            }).catch(() => setTranslatedText('⚠️ Translation failed'));
                          }
                        } else {
                          setEditingTranscript(false);
                        }
                      }}
                      returnKeyType="done"
                    />
                    <TouchableOpacity onPress={() => setEditingTranscript(false)} activeOpacity={0.7}>
                      <Text style={{ fontSize: 16, color: '#999' }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => { setEditText(transcript); setEditingTranscript(true); }}
                    activeOpacity={0.7}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={[s.cardBody, { flex: 1 }]}>{transcript}</Text>
                      <Text style={{ fontSize: 12, color: '#999', marginLeft: 6 }}>✏️</Text>
                    </View>
                  </TouchableOpacity>
                )}
                {/* Show GPT translation */}
                {translatedText ? (
                  <View style={s.translationRow}>
                    <View style={s.translationDivider} />
                    <Text style={s.translationTag}>{activeMic === 'customer' ? '🇺🇸 ENGLISH' : '🇲🇽 ESPAÑOL'}</Text>
                    <View style={s.translationTextRow}>
                      <Text style={s.translationBody}>{translatedText}</Text>
                      <TouchableOpacity
                        style={s.playTranslationBtn}
                        onPress={async () => {
                          // Translation playback — force LOUD SPEAKER even with BT connected
                          stopSpeaking();
                          if (activeMic === 'customer') {
                            await speakEnglishLoud(translatedText);
                          } else {
                            await speakSpanishLoud(translatedText);
                          }
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={s.playTranslationEmoji}>🔊</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}
              </>
            ) : (
              <Text style={s.cardEmpty}>Tap the mic and speak</Text>
            )}
          </View>
        </View>

        {/* ── Coach Card ── */}
        {detection?.intent && appMode === 'active' && (
          <View style={s.cardWrap}>
            <View style={[
              s.card,
              detection.alert === 'CLOSE_NOW' && s.cardGreen,
              detection.alert === 'HOT_LEAD' && s.cardYellow,
              detection.alert === 'OBJECTION' && s.cardRed,
              detection.alert === 'INFO' && s.cardBlue,
            ]}>
              <Text style={s.cardTag}>
                {detection.alert === 'CLOSE_NOW' ? '🟢 CLOSE NOW' :
                 detection.alert === 'HOT_LEAD' ? '🟡 HOT LEAD' :
                 detection.alert === 'OBJECTION' ? '🔴 OBJECTION' : '🔵 INFO'}
                {detection.intent.name !== 'Greeting' && detection.intent.name !== 'AI Assistant' ? ` — ${detection.intent.name.toUpperCase()}` : ''}
              </Text>
              <Text style={s.coachEn}>{detection.intent.coachEn}</Text>
              <View style={s.coachDivider} />
              <Text style={s.coachTag}>SAY THIS:</Text>
              <Text style={s.coachEs}>{detection.intent.coachEs}</Text>

              {/* Action buttons row */}
              <View style={s.coachActions}>
                {/* Back arrow */}
                {stepHistory.length > 0 && (
                  <TouchableOpacity style={s.arrowBtn} onPress={goBack} activeOpacity={0.7}>
                    <Text style={s.arrowTxt}>◀</Text>
                  </TouchableOpacity>
                )}

                {/* 🔁 Replay — rep hears in Bluetooth glasses (private) */}
                <TouchableOpacity
                  style={[s.replayBtn, speakingSource === 'replay' && s.btnActive]}
                  onPress={handleReplay}
                  activeOpacity={0.7}
                >
                  <Text style={s.replayEmoji}>{speakingSource === 'replay' ? '⏹️' : '🎧'}</Text>
                  <Text style={s.replayLabel}>{speakingSource === 'replay' ? 'Stop' : 'Replay'}</Text>
                </TouchableOpacity>

                {/* 🔊 Play Loud — customer hears from phone speaker */}
                <TouchableOpacity
                  style={[s.speakerBtn, speakingSource === 'loud' && s.btnActive]}
                  onPress={handlePlayLoud}
                  activeOpacity={0.7}
                >
                  <Text style={s.speakerEmoji}>{speakingSource === 'loud' ? '⏹️' : '🔊'}</Text>
                  <Text style={s.speakerLabel}>{speakingSource === 'loud' ? 'Stop' : 'Play'}</Text>
                </TouchableOpacity>

                {/* 🙏 Prayer — ministry only */}
                {userSetup?.selectedTemplate === 'ministry' && (
                  <TouchableOpacity
                    style={[s.replayBtn, { backgroundColor: '#8B5CF6' }, prayerStep >= 0 && s.btnActive]}
                    onPress={() => {
                      if (prayerStep >= 0) {
                        // Exit prayer mode
                        stopSpeaking();
                        setIsSpeakingState(false);
                        setSpeakingSource(null);
                        setPrayerStep(-1);
                      } else {
                        setPrayerStep(0);
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={s.replayEmoji}>{prayerStep >= 0 ? '✖️' : '🙏'}</Text>
                    <Text style={s.replayLabel}>{prayerStep >= 0 ? 'Exit' : 'Prayer'}</Text>
                  </TouchableOpacity>
                )}

                {/* → Next arrow */}
                {convoFlow.get(currentStep)?.nextOnPositive && currentStep !== 'payment_check' && prayerStep < 0 && (
                  <TouchableOpacity style={s.arrowBtn} onPress={handleNext} activeOpacity={0.7}>
                    <Text style={s.arrowTxt}>▶</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* 🙏 Sinner's Prayer — line by line */}
              {prayerStep >= 0 && (() => {
                const PRAYER_LINES = [
                  { en: 'Repeat after me:', es: 'Repita conmigo:' },
                  { en: 'Heavenly Father, I come to you in prayer, asking for the forgiveness of my sins.', es: 'Padre Celestial, vengo a ti en oración, pidiendo el perdón de mis pecados.' },
                  { en: 'I confess with my mouth and believe with my heart that Jesus died for my sins.', es: 'Confieso con mi boca y creo con mi corazón que Jesús murió por mis pecados.' },
                  { en: 'I believe that Jesus rose from the dead.', es: 'Creo que Jesús resucitó de entre los muertos.' },
                  { en: 'I repent of my sins and ask you right now to come into my life and be my personal Lord and Savior.', es: 'Me arrepiento de mis pecados y te pido ahora mismo que entres en mi vida y seas mi Señor y Salvador personal.' },
                  { en: 'I give my heart completely to you.', es: 'Te entrego mi corazón completamente.' },
                  { en: 'Father, I choose to live for you forever. In Jesus name, Amen!', es: 'Padre, elijo vivir para ti por siempre. ¡En el nombre de Jesús, Amén!' },
                  { en: '🎉 You have made the best decision of your life! If you need help finding a church home, we can assist you. Today is the first day of the rest of your life!', es: '🎉 ¡Has tomado la mejor decisión de tu vida! Si necesitas ayuda para encontrar una iglesia, te podemos ayudar. ¡Hoy es el primer día del resto de tu vida!' },
                ];
                const line = PRAYER_LINES[prayerStep];
                const isLast = prayerStep === PRAYER_LINES.length - 1;
                const isFirst = prayerStep === 0;
                return (
                  <View style={{ marginTop: 10, backgroundColor: '#F5F3FF', borderRadius: 16, padding: 14, borderWidth: 2, borderColor: '#8B5CF6' }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#8B5CF6', letterSpacing: 2, marginBottom: 4 }}>🙏 PRAYER — LINE {prayerStep + 1} OF {PRAYER_LINES.length}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '500', color: '#374151', marginBottom: 4 }}>{line.en}</Text>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#1A1B2E', fontStyle: 'italic', lineHeight: 22 }}>{line.es}</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      {!isFirst && (
                        <TouchableOpacity
                          style={{ paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#E5E7EB', borderRadius: 16 }}
                          onPress={() => setPrayerStep(prayerStep - 1)}
                          activeOpacity={0.7}
                        >
                          <Text style={{ fontSize: 14, fontWeight: '600', color: '#6B7280' }}>← Back</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={{ paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#7C5CFC', borderRadius: 16, elevation: 3 }}
                        onPress={() => {
                          setIsSpeakingState(true);
                          setSpeakingSource('loud');
                          speakSpanishLoud(line.es, () => {
                            setIsSpeakingState(false);
                            setSpeakingSource(null);
                          });
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF' }}>🔊 Say It</Text>
                      </TouchableOpacity>
                      {!isLast ? (
                        <TouchableOpacity
                          style={{ paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#8B5CF6', borderRadius: 16, elevation: 3 }}
                          onPress={() => setPrayerStep(prayerStep + 1)}
                          activeOpacity={0.7}
                        >
                          <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF' }}>Next →</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={{ paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#10B981', borderRadius: 16, elevation: 3 }}
                          onPress={() => setPrayerStep(-1)}
                          activeOpacity={0.7}
                        >
                          <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF' }}>🙏 Amen!</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })()}

              {/* Payment check — amount input + Pay / Skip buttons */}
              {currentStep === 'payment_check' && (
                <View style={{ marginTop: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 }}>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: '#1A1B2E' }}>$</Text>
                    <TextInput
                      style={{ flex: 1, backgroundColor: '#FFF', borderRadius: 12, padding: 12, fontSize: 18, fontWeight: '600', borderWidth: 1, borderColor: '#E5E7EB' }}
                      placeholder="Enter amount"
                      value={paymentAmount}
                      onChangeText={setPaymentAmount}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={s.yesNoRow}>
                    <TouchableOpacity style={[s.yesBtn, !paymentAmount.trim() && { opacity: 0.4 }]} disabled={!paymentAmount.trim()} onPress={() => {
                      const amt = paymentAmount.trim();
                      // Update the payment_amount step with the entered amount
                      const payStep = convoFlow.get('payment_amount');
                      if (payStep) {
                        payStep.sayEs = `El pago de hoy es de $${amt}. ¿Prefiere pagar con tarjeta de débito o con cheque?`;
                        payStep.coachEn = `💳 Payment is $${amt} today. Ask: "Debit or checking?"\n\nNext → Autopay setup`;
                      }
                      handleYes();
                    }} activeOpacity={0.7}>
                      <Text style={s.yesBtnTxt}>💰 Pay ${paymentAmount || '...'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.noBtn} onPress={handleNo} activeOpacity={0.7}>
                      <Text style={s.noBtnTxt}>🆓 No Pay</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Yes / No buttons — only on screens where yes/no makes sense */}
              {(() => {
                if (currentStep === 'payment_check') return null; // handled above
                
                // Hide yes/no on info-gathering screens
                const step = convoFlow.get(currentStep);
                const hideYesNo = [
                  'ask_provider', 'ask_how_long', 'ask_how_much',
                  'collect_firstName', 'collect_lastName', 'collect_phone', 'collect_email',
                  'collect_address', 'collect_ssn', 'collect_pin', 'collect_dob',
                  'collect_first_name', 'collect_last_name',
                  'autopay_method', 'payment_amount',
                ];
                if (hideYesNo.includes(currentStep)) return null;
                // Also hide on any step in onboarding phase that captures data
                if (step?.phase === 'onboarding' && step?.captureAs) return null;
                // Hide on exit steps (done, thank_exit, leave_info, callback_set)
                if (step?.isExit) return null;
                // Hide if step doesn't expect a response (listenFor: 'none')
                if (step?.listenFor === 'none') return null;

                const isAttemptClose = stateMachine.getState() === 'ATTEMPT_CLOSE';
                const hasYesNo = step?.listenFor === 'customer_response' && step.nextOnPositive && step.nextOnNegative;
                if (isAttemptClose || hasYesNo) {
                  return (
                    <View style={s.yesNoRow}>
                      <TouchableOpacity style={s.yesBtn} onPress={handleYes} activeOpacity={0.7}>
                        <Text style={s.yesBtnTxt}>👍 Sí</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.noBtn} onPress={handleNo} activeOpacity={0.7}>
                        <Text style={s.noBtnTxt}>👎 No</Text>
                      </TouchableOpacity>
                    </View>
                  );
                }
                return null;
              })()}
            </View>
          </View>
        )}

        {/* ── Active mode controls — Dual Mic ── */}
        {appMode === 'active' && (
          <View style={s.activeControls}>
            {/* Two-mic row: Rep (left) | Customer (right) */}
            <View style={s.dualMicRow}>
              {/* Rep Mic (English → Spanish) — LEFT */}
              <View style={s.micColumn}>
                <Text style={s.micLabel}>🇺🇸 Rep</Text>
                <View style={s.micWrapSmall}>
                  {isRecording && activeMic === 'rep' && (
                    <Animated.View style={[s.micRingSmallRep, { transform: [{ scale: pulseScale }], opacity: pulseOpacity }]} />
                  )}
                  <TouchableOpacity
                    style={[
                      s.micBtnRep,
                      isRecording && activeMic === 'rep' && s.micBtnRepActive,
                    ]}
                    onPress={() => handleDualRecord('rep')}
                    activeOpacity={0.85}
                  >
                    <MicIcon color="#FFFFFF" size={1.3} />
                  </TouchableOpacity>
                </View>
                <Text style={s.micSubLabel}>EN → ES</Text>
              </View>

              {/* Customer Mic (Spanish → English) — RIGHT */}
              <View style={s.micColumn}>
                <Text style={s.micLabel}>🇲🇽 Customer</Text>
                <View style={s.micWrapSmall}>
                  {isRecording && activeMic === 'customer' && (
                    <Animated.View style={[s.micRingSmall, { transform: [{ scale: pulseScale }], opacity: pulseOpacity }]} />
                  )}
                  <TouchableOpacity
                    style={[
                      s.micBtnCustomer,
                      isRecording && activeMic === 'customer' && s.micBtnActive,
                    ]}
                    onPress={() => handleDualRecord('customer')}
                    activeOpacity={0.85}
                  >
                    <MicIcon color="#FFFFFF" size={1.3} />
                  </TouchableOpacity>
                </View>
                <Text style={s.micSubLabel}>ES → EN</Text>
              </View>
            </View>

            {/* Waveform */}
            <View style={s.waveRow}>
              {Array.from({ length: 24 }).map((_, i) => <WaveBar key={i} delay={i} isActive={isRecording} />)}
            </View>

            {/* Auto-listen indicator */}
            {autoListening && (
              <View style={s.autoListenIndicator}>
                <View style={s.autoListenDot} />
                <Text style={s.autoListenText}>
                  Auto-listening ({activeMic === 'customer' ? '🇲🇽 Customer' : '🇺🇸 Rep'})…
                </Text>
              </View>
            )}

            {/* Bottom row: Sleep + Setup + Convo */}
            {!isRecording && (
              <View style={s.bottomRow}>
                <TouchableOpacity style={s.sleepBtn} onPress={goToSleep} activeOpacity={0.7}>
                  <Text style={s.sleepBtnText}>😴 Sleep</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.sleepBtn} onPress={() => setShowSetup(true)} activeOpacity={0.7}>
                  <Text style={s.sleepBtnText}>⚙️ Setup</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.sleepBtn} onPress={() => setShowConvo(true)} activeOpacity={0.7}>
                  <Text style={s.sleepBtnText}>💬 Convo</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* ── Sleep mode controls ── */}
        {appMode === 'sleep' && (
          <View style={s.sleepControls}>
            <View style={s.sleepIndicator}>
              <View style={s.sleepDot} />
              <Text style={s.sleepText}>Ready — tap to begin</Text>
            </View>

            <View style={s.sleepButtons}>
              <TouchableOpacity style={s.manualWakeBtn} onPress={handleStart} activeOpacity={0.8}>
                <Text style={s.manualWakeTxt}>🎧 Start (Ear)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.assistBtnBig} onPress={handleAssist} activeOpacity={0.8}>
                <Text style={s.assistBtnBigTxt}>🔊 Assist (Loud)</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={s.teammateBtn} onPress={() => setShowTeammate(true)} activeOpacity={0.85}
              accessibilityLabel="Call Ana, your AI Spanish rep">
              <View style={s.teammateIcon}><PhoneIcon size={20} color="#050507" /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.teammateTitle}>Call Ana</Text>
                <Text style={s.teammateSub}>Your Spanish rep on speaker</Text>
              </View>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
              <TouchableOpacity style={s.sleepSettingsBtn} onPress={() => setShowSetup(true)} activeOpacity={0.7}>
                <Text style={s.sleepSettingsTxt}>⚙️ Settings</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.sleepSettingsBtn} onPress={() => setShowConvo(true)} activeOpacity={0.7}>
                <Text style={s.sleepSettingsTxt}>💬 Convo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.sleepSettingsBtn} onPress={() => setShowTeachMe(true)} activeOpacity={0.7}>
                <Text style={s.sleepSettingsTxt}>🧑 Teach Me</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Status ── */}
        <Text style={s.statusTxt}>{statusLabel()}</Text>

      </ScrollView>

      {/* ── Footer ── */}
      <View style={s.footer}>
        <View style={[s.dot, appMode === 'sleep' ? s.dotSleep : s.dotActive]} />
        <Text style={s.footerTxt}>{appMode === 'sleep' ? 'Sleep mode · Low power' : 'On-device · Offline · Private'}</Text>
      </View>
    </SafeAreaView>
    </SafeAreaProvider>
  );
}

/* ── Styles ── */
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F6FB' },
  scrollContent: { alignItems: 'center', paddingBottom: 20, flexGrow: 1 },
  header: { alignItems: 'center', paddingTop: 8, marginBottom: 12 },
  logo: { fontSize: 26, fontWeight: '700', color: '#1A1B2E', letterSpacing: -0.5 },
  tagline: { fontSize: 11, fontWeight: '600', color: '#A0A3BD', letterSpacing: 4, textTransform: 'uppercase', marginTop: 2 },

  micModeRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 12, gap: 10 },
  micModePill: { backgroundColor: '#FFFFFF', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 28, elevation: 2 },
  micModePillCustomer: { backgroundColor: '#F59E0B' },
  micModePillRep: { backgroundColor: '#7C5CFC' },
  micModeLabel: { fontSize: 13, fontWeight: '600', color: '#A0A3BD' },
  micModeLabelActive: { color: '#FFFFFF' },

  cardWrap: { paddingHorizontal: 16, marginBottom: 10, width: '100%' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, minHeight: 50, elevation: 2 },
  cardSleep: { backgroundColor: '#F0F1F7', opacity: 0.7 },
  cardTag: { fontSize: 10, fontWeight: '700', color: '#7C5CFC', letterSpacing: 2, marginBottom: 8 },
  cardBody: { fontSize: 17, fontWeight: '400', color: '#1A1B2E', lineHeight: 26 },
  cardEmpty: { fontSize: 14, color: '#C5C7D6', textAlign: 'center', paddingVertical: 8 },
  translationRow: { marginTop: 8 },
  translationDivider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 8 },
  translationTag: { fontSize: 10, fontWeight: '700', color: '#F59E0B', letterSpacing: 2, marginBottom: 4 },
  translationTextRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  translationBody: { flex: 1, fontSize: 17, fontWeight: '600', color: '#1A1B2E', lineHeight: 26, fontStyle: 'italic' },
  playTranslationBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F59E0B', justifyContent: 'center', alignItems: 'center', elevation: 3 },
  playTranslationEmoji: { fontSize: 18 },
  cardGreen: { borderLeftWidth: 4, borderLeftColor: '#4ADE80', backgroundColor: '#F0FFF4' },
  cardYellow: { borderLeftWidth: 4, borderLeftColor: '#FBBF24', backgroundColor: '#FFFBEB' },
  cardRed: { borderLeftWidth: 4, borderLeftColor: '#F87171', backgroundColor: '#FFF1F2' },
  cardBlue: { borderLeftWidth: 4, borderLeftColor: '#60A5FA', backgroundColor: '#EFF6FF' },

  coachEn: { fontSize: 13, fontWeight: '500', color: '#374151', lineHeight: 19, marginBottom: 6 },
  coachDivider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 6 },
  coachTag: { fontSize: 10, fontWeight: '700', color: '#7C5CFC', letterSpacing: 2, marginBottom: 4 },
  coachEs: { fontSize: 15, fontWeight: '600', color: '#1A1B2E', lineHeight: 22, fontStyle: 'italic' },

  coachActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, gap: 6, flexWrap: 'wrap' },
  arrowBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center', elevation: 2 },
  arrowTxt: { fontSize: 18, fontWeight: '700', color: '#6B7280' },
  replayBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#3B82F6', borderRadius: 24, gap: 4, elevation: 3 },
  replayEmoji: { fontSize: 14 },
  replayLabel: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  speakerBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#7C5CFC', borderRadius: 24, gap: 4, elevation: 3 },
  speakerEmoji: { fontSize: 14 },
  speakerLabel: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  btnActive: { backgroundColor: '#DC2626' },
  micSmallBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, backgroundColor: '#F59E0B', borderRadius: 24, gap: 4, elevation: 3 },
  micSmallBtnActive: { backgroundColor: '#DC2626' },
  micSmallEmoji: { fontSize: 14 },
  micSmallLabel: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  backBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, backgroundColor: '#6B7280', borderRadius: 24, elevation: 3 },  // kept for compat
  backLabel: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  nextBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 18, backgroundColor: '#10B981', borderRadius: 24, elevation: 3 },  // kept for compat
  nextLabel: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

  yesNoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10, gap: 14 },
  yesBtn: { flex: 1, paddingVertical: 14, backgroundColor: '#4ADE80', borderRadius: 16, alignItems: 'center', elevation: 3 },
  yesBtnTxt: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  noBtn: { flex: 1, paddingVertical: 14, backgroundColor: '#F87171', borderRadius: 16, alignItems: 'center', elevation: 3 },
  noBtnTxt: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },

  activeControls: { alignItems: 'center', width: '100%', marginTop: 8 },
  dualMicRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 32, marginBottom: 8 },
  micColumn: { alignItems: 'center' },
  micLabel: { fontSize: 14, fontWeight: '700', color: '#1A1B2E', marginBottom: 8 },
  micSubLabel: { fontSize: 11, fontWeight: '600', color: '#A0A3BD', marginTop: 6 },
  micWrapSmall: { alignItems: 'center', justifyContent: 'center', height: 80, width: 80 },
  micRingSmall: { position: 'absolute', width: 80, height: 80, borderRadius: 40, backgroundColor: '#F59E0B' },
  micRingSmallRep: { position: 'absolute', width: 80, height: 80, borderRadius: 40, backgroundColor: '#7C5CFC' },
  micBtnCustomer: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#F59E0B', justifyContent: 'center', alignItems: 'center', elevation: 8 },
  micBtnRep: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#7C5CFC', justifyContent: 'center', alignItems: 'center', elevation: 8 },
  micBtnRepActive: { backgroundColor: '#6A4DE0' },
  micWrap: { alignItems: 'center', justifyContent: 'center', height: 110 },
  micRing: { position: 'absolute', width: 110, height: 110, borderRadius: 55, backgroundColor: '#7C5CFC' },
  micBtn: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#7C5CFC', justifyContent: 'center', alignItems: 'center', elevation: 8 },
  micBtnActive: { backgroundColor: '#6A4DE0' },
  waveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 40, marginTop: 4, marginBottom: 4, paddingHorizontal: 32 },
  autoListenIndicator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4, marginBottom: 4 },
  autoListenDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#F59E0B' },
  autoListenText: { fontSize: 12, color: '#F59E0B', fontWeight: '600' },
  bottomRow: { flexDirection: 'row', marginTop: 12, gap: 10, flexWrap: 'wrap', justifyContent: 'center' },
  assistBtnSmall: { paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#10B981', borderRadius: 24, elevation: 3 },
  assistBtnSmallTxt: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  sleepBtn: { paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#F0F1F7', borderRadius: 24 },
  sleepBtnText: { fontSize: 14, fontWeight: '600', color: '#A0A3BD' },

  sleepSettingsBtn: { paddingVertical: 8, paddingHorizontal: 16 },
  sleepSettingsTxt: { fontSize: 13, fontWeight: '600', color: '#A0A3BD' },
  sleepControls: { alignItems: 'center', marginTop: 24, paddingHorizontal: 20, width: '100%' },
  sleepIndicator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 },
  sleepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FBBF24' },
  sleepText: { fontSize: 14, color: '#A0A3BD', fontWeight: '500' },
  sleepButtons: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' },
  teammateBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, alignSelf: 'stretch', marginTop: 16, paddingVertical: 14, paddingHorizontal: 18, backgroundColor: '#050507', borderRadius: 22 },
  teammateIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#30D59B', alignItems: 'center', justifyContent: 'center' },
  teammateTitle: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  teammateSub: { fontSize: 13, color: '#A1A1AA', marginTop: 2 },
  manualWakeBtn: { paddingVertical: 14, paddingHorizontal: 24, backgroundColor: '#7C5CFC', borderRadius: 28, elevation: 5 },
  manualWakeTxt: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  assistBtnBig: { paddingVertical: 14, paddingHorizontal: 24, backgroundColor: '#10B981', borderRadius: 28, elevation: 5 },
  assistBtnBigTxt: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  statusTxt: { textAlign: 'center', fontSize: 13, fontWeight: '500', color: '#A0A3BD', marginTop: 10, marginBottom: 4 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotSleep: { backgroundColor: '#FBBF24' },
  dotActive: { backgroundColor: '#4ADE80' },
  footerTxt: { fontSize: 12, color: '#B8BAC8', fontWeight: '500' },
});
