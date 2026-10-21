/**
 * Hola D2D: Ana, an AI Spanish-speaking teammate on speakerphone at the door.
 *
 * First time: setup (what you sell, about you, your prices), then the plans.
 * After that: home, with Call Ana, today's counts, and Convo and Teach Me for inside the house.
 * The owner build (src/main/owner.ts) skips the plans and uses the owner code instead.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AppState, StatusBar, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { checkSubscriptionStatus, disconnectStore } from './src/subscription';
import { loadRepProfile, loadSetup } from './src/config/storage';
import type { RepProfile } from './src/config/storage';
import { warmupTranslation } from './src/translate';
import type { TeammateSettings } from './src/teammate/settings';
import { loadTeammateSettings, saveTeammateSettings } from './src/teammate/settings';
import type { CallResult } from './src/teammate/useTeammateCall';
import TeammateFlow from './src/teammate/TeammateFlow';
import TeammateSetupScreen from './src/teammate/TeammateSetupScreen';
import OnboardingFlow from './src/main/OnboardingFlow';
import HomeScreen from './src/main/HomeScreen';
import SettingsScreen from './src/main/SettingsScreen';
import type { EditTarget } from './src/main/SettingsScreen';
import { loadToday, recordCall } from './src/main/stats';
import { AccountError, planStatus, usingTestConnection } from './src/main/account';
import type { PlanStatus } from './src/main/account';
import type { DayStats } from './src/main/stats';
import { C } from './src/main/ui';
import { OWNER_BUILD } from './src/main/owner';
import PaywallScreen from './src/screens/PaywallScreen';
import ConvoScreen from './src/screens/ConvoScreen';
import TeachMeScreen from './src/screens/TeachMeScreen';

type Screen = 'home' | 'call' | 'convo' | 'teach' | 'settings' | 'edit' | 'plans';

export default function App() {
  const [booting, setBooting] = useState(true);
  const [settings, setSettings] = useState<TeammateSettings | null>(null);
  const [older, setOlder] = useState<{ repName?: string; companyName?: string }>({});
  const [subscribed, setSubscribed] = useState<boolean | null>(OWNER_BUILD ? true : null);
  const [profile, setProfile] = useState<RepProfile | null>(null);
  const [stats, setStats] = useState<DayStats | null>(null);
  const [screen, setScreen] = useState<Screen>('home');
  const [edit, setEdit] = useState<EditTarget | null>(null);
  const [plan, setPlan] = useState<PlanStatus | null>(null);
  const [planNote, setPlanNote] = useState('');

  useEffect(() => {
    (async () => {
      const [saved, oldSetup, rep, today] = await Promise.all([loadTeammateSettings(), loadSetup(), loadRepProfile(), loadToday()]);
      setSettings(saved);
      // reps coming from the old translator keep their name and company
      if (oldSetup) setOlder({ repName: oldSetup.repName, companyName: oldSetup.companyName });
      setProfile(rep);
      setStats(today);
      setBooting(false);
    })();
    if (!OWNER_BUILD) {
      checkSubscriptionStatus()
        .then((active) => setSubscribed(active))
        .catch(() => setSubscribed(false)); // no network on first launch: show the paywall, Restore works later
    }
    warmupTranslation(); // Convo's "add a phrase" translates; wake the function up early
    return () => {
      disconnectStore();
    };
  }, []);

  // a new day starts the counts over, even if the app stayed open overnight
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') loadToday().then(setStats);
    });
    return () => sub.remove();
  }, []);

  // minutes left on the plan, from the Hola server
  const refreshPlan = useCallback(async (s: TeammateSettings | null) => {
    if (!s) return;
    if (usingTestConnection(s)) {
      setPlan(null);
      setPlanNote('Testing connection: minutes not counted');
      return;
    }
    if (OWNER_BUILD && !s.connection.accessCode.trim()) {
      setPlan(null);
      setPlanNote('Add your owner code in Settings to start calling');
      return;
    }
    try {
      setPlan(await planStatus(s));
      setPlanNote('');
    } catch (e) {
      if (e instanceof AccountError && e.status) {
        setPlan(e.status); // out of minutes still tells us the plan
        setPlanNote('');
      } else {
        setPlan(null);
        setPlanNote(e instanceof AccountError && e.code === 'no_plan' ? 'No Hola plan found on this Apple ID' : "Couldn't check your minutes");
      }
    }
  }, []);

  useEffect(() => {
    if (subscribed === true && screen === 'home') refreshPlan(settings);
  }, [subscribed, screen, settings, refreshPlan]);

  const save = useCallback(async (next: TeammateSettings) => {
    await saveTeammateSettings(next);
    setSettings(next);
  }, []);

  const callDone = useCallback(async (r?: CallResult) => {
    if (r) setStats(await recordCall(r));
    setScreen('home');
  }, []);

  let body: React.ReactNode;
  if (booting || !stats) {
    body = <View style={{ flex: 1, backgroundColor: C.ground }} />;
  } else if (!settings) {
    body = <OnboardingFlow initial={older} onDone={save} />;
  } else if (subscribed !== true) {
    body =
      subscribed === null ? (
        <View style={{ flex: 1, backgroundColor: C.ground }} />
      ) : (
        <PaywallScreen assistantName={settings.assistantName} onSubscribed={() => setSubscribed(true)} />
      );
  } else if (screen === 'call') {
    body = <TeammateFlow settings={settings} onSave={save} onExit={callDone} onPlans={() => setScreen('plans')} />;
  } else if (screen === 'plans') {
    body = (
      <PaywallScreen
        mode="change"
        currentPlan={plan?.trial ? undefined : plan?.plan}
        assistantName={settings.assistantName}
        onBack={() => setScreen('home')}
        onSubscribed={() => setScreen('home')}
      />
    );
  } else if (screen === 'convo') {
    body = <ConvoScreen repName={settings.repName} industryId={settings.industry} repProfile={profile} onBack={() => setScreen('home')} />;
  } else if (screen === 'teach') {
    body = (
      <TeachMeScreen
        existingProfile={profile}
        onComplete={(p) => {
          setProfile(p);
          setScreen('home');
        }}
        onBack={() => setScreen('home')}
      />
    );
  } else if (screen === 'edit' && edit) {
    body = (
      <TeammateSetupScreen
        initial={settings}
        title={edit.title}
        sections={edit.sections}
        onSave={async (next) => {
          await save(next);
          setScreen('settings');
        }}
        onBack={() => setScreen('settings')}
      />
    );
  } else if (screen === 'settings') {
    body = (
      <SettingsScreen
        settings={settings}
        onBack={() => setScreen('home')}
        planName={plan ? (plan.trial ? 'Free week' : plan.plan) : undefined}
        onPlans={() => setScreen('plans')}
        onEdit={(t) => {
          setEdit(t);
          setScreen('edit');
        }}
      />
    );
  } else {
    body = (
      <HomeScreen
        settings={settings}
        stats={stats}
        plan={plan}
        planNote={planNote}
        onPlans={() => setScreen('plans')}
        onCall={() => setScreen('call')}
        onConvo={() => setScreen('convo')}
        onTeachMe={() => setScreen('teach')}
        onSettings={() => setScreen('settings')}
      />
    );
  }

  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: C.ground }}>
      <StatusBar barStyle="light-content" backgroundColor={C.ground} />
      {body}
    </SafeAreaProvider>
  );
}
