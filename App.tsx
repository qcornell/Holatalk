/**
 * Hola D2D: Ana, an AI Spanish-speaking teammate on speakerphone at the door.
 *
 * First time: setup (what you sell, about you, your prices), then the free-week paywall.
 * After that: home, with Call Ana, today's counts, and Convo and Teach Me for inside the house.
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
import type { DayStats } from './src/main/stats';
import { C } from './src/main/ui';
import PaywallScreen from './src/screens/PaywallScreen';
import ConvoScreen from './src/screens/ConvoScreen';
import TeachMeScreen from './src/screens/TeachMeScreen';

type Screen = 'home' | 'call' | 'convo' | 'teach' | 'settings' | 'edit';

export default function App() {
  const [booting, setBooting] = useState(true);
  const [settings, setSettings] = useState<TeammateSettings | null>(null);
  const [older, setOlder] = useState<{ repName?: string; companyName?: string }>({});
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<RepProfile | null>(null);
  const [stats, setStats] = useState<DayStats | null>(null);
  const [screen, setScreen] = useState<Screen>('home');
  const [edit, setEdit] = useState<EditTarget | null>(null);

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
    checkSubscriptionStatus()
      .then((active) => setSubscribed(active))
      .catch(() => setSubscribed(false)); // no network on first launch: show the paywall, Restore works later
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
    body = <TeammateFlow settings={settings} onSave={save} onExit={callDone} />;
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
