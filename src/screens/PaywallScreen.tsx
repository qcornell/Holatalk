/**
 * Plans: the paywall after setup (start the free week), and the "change plan" screen later.
 * Each plan includes Ana minutes every month; prices and the free week come from the App Store.
 * Restore, Terms, Privacy and Apple's renewal wording are all here, as Apple requires.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Image, Pressable, StyleSheet, StatusBar, ActivityIndicator, Alert, Linking, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { connectStore, getPlans, manageSubscription, purchasePlan, restorePurchases, TRIAL_MINUTES } from '../subscription';
import type { PlanProduct } from '../subscription';
import { CheckIcon } from '../teammate/icons';
import { BackButton, Button, C } from '../main/ui';
import { PRIVACY_URL, TERMS_URL } from '../main/SettingsScreen';

const ANA = require('../../assets/teammate/ana.png');

/** Rough Spanish conversations a plan covers, from test calls of 3 to 6 minutes. */
const doors = (minutes: number) => Math.max(1, Math.round(minutes / 4));

interface PaywallScreenProps {
  onSubscribed: () => void;
  /** The assistant's name from setup */
  assistantName?: string;
  /** "change": the rep already has a plan and is switching */
  mode?: 'paywall' | 'change';
  /** The plan they're on now (change mode) */
  currentPlan?: string;
  onBack?: () => void;
}

export default function PaywallScreen({ onSubscribed, assistantName = 'Ana', mode = 'paywall', currentPlan, onBack }: PaywallScreenProps) {
  const insets = useSafeAreaInsets();
  const [plans, setPlans] = useState<PlanProduct[]>([]);
  const [picked, setPicked] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const changing = mode === 'change';

  useEffect(() => {
    (async () => {
      try {
        await connectStore((success) => {
          setPurchasing(false);
          if (success) onSubscribed();
        });
        // Apple can be slow or silent; show what we have rather than spin
        const got = await Promise.race([getPlans(), new Promise<PlanProduct[]>((resolve) => setTimeout(() => resolve([]), 15000))]);
        setPlans(got);
        const start = got.find((p) => p.popular) ?? got[0];
        const mine = got.find((p) => p.name === currentPlan);
        setPicked((changing ? got.find((p) => p !== mine && p.minutes > (mine?.minutes ?? 0)) ?? start : start)?.id ?? '');
      } catch (e: any) {
        console.warn('[Paywall] init failed:', e?.message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const plan = plans.find((p) => p.id === picked) ?? null;
  const trial = !changing && !!plan?.freeTrial;

  const handleSubscribe = useCallback(async () => {
    if (purchasing || !plan) return;
    setPurchasing(true);
    // Apple's purchase sheet sometimes never answers; don't leave the button spinning forever.
    const giveUp = setTimeout(() => {
      setPurchasing(false);
      Alert.alert("Apple didn't respond", 'Please try again. If you already started your plan, tap Restore purchase.');
    }, 90000);
    try {
      await purchasePlan(plan.id);
      clearTimeout(giveUp);
      // The purchase can come back here instead of through the listener: check for it directly.
      if (await restorePurchases()) {
        setPurchasing(false);
        onSubscribed();
        return;
      }
      setPurchasing(false); // cancelled, or still pending (the listener finishes it if it comes later)
    } catch {
      clearTimeout(giveUp);
      setPurchasing(false);
      Alert.alert('Purchase not completed', 'Nothing was charged. Please try again.');
    }
  }, [purchasing, plan, onSubscribed]);

  const handleRestore = useCallback(async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      if (await restorePurchases()) onSubscribed();
      else Alert.alert('No plan found', "We couldn't find a Hola plan on this Apple ID.");
    } catch {
      Alert.alert('Restore failed', 'Please try again.');
    } finally {
      setRestoring(false);
    }
  }, [restoring, onSubscribed]);

  if (loading) {
    return (
      <SafeAreaView style={s.root}>
        <StatusBar barStyle="light-content" />
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      </SafeAreaView>
    );
  }

  const cta = !plan
    ? 'Plans unavailable'
    : changing
      ? plan.name === currentPlan
        ? `You're on ${plan.name}`
        : `Switch to ${plan.name}`
      : trial
        ? 'Start my free week'
        : `Get ${plan.name}`;

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: Math.max(insets.bottom, 12) + 16 }]} bounces={false}>
        {changing && onBack ? (
          <View style={s.topRow}>
            <BackButton onPress={onBack} />
          </View>
        ) : (
          <View style={s.avatarWrap}>
            <Image source={ANA} style={s.avatar} accessibilityLabel={assistantName} />
            <View style={s.avatarTick}>
              <CheckIcon size={16} color={C.ground} />
            </View>
          </View>
        )}
        <Text style={[s.title, changing && s.titleLeft]} accessibilityRole="header">
          {changing ? 'Your plan' : `${assistantName}'s ready for your first door`}
        </Text>
        <Text style={[s.sub, changing && s.subLeft]}>
          {changing
            ? `${currentPlan ? `You're on ${currentPlan}. ` : ''}Minutes reset every month. Switching up starts right away.`
            : `Pick how many minutes you need. Every plan has Convo and Teach Me.`}
        </Text>

        <View style={s.plans} accessibilityRole="radiogroup">
          {plans.map((p) => {
            const on = p.id === picked;
            const mine = changing && p.name === currentPlan;
            return (
              <Pressable
                key={p.id}
                onPress={() => setPicked(p.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${p.name}, ${p.minutes} minutes a month, ${p.price} a month`}
                style={({ pressed }) => [s.plan, on && s.planOn, pressed && { opacity: 0.9 }]}
              >
                <View style={[s.radio, on && s.radioOn]}>{on ? <View style={s.radioDot} /> : null}</View>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={s.planHead}>
                    <Text style={s.planName}>{p.name}</Text>
                    {mine ? (
                      <View style={s.tagMine}>
                        <Text style={s.tagMineText}>Current</Text>
                      </View>
                    ) : p.popular ? (
                      <View style={s.tag}>
                        <Text style={s.tagText}>Most popular</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={s.planMeta}>
                    {p.minutes} minutes of calls a month · about {doors(p.minutes)} conversations
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.planPrice}>{p.price}</Text>
                  <Text style={s.planPer}>a month</Text>
                </View>
              </Pressable>
            );
          })}
          {!plans.length ? <Text style={s.empty}>Plans couldn't load from the App Store. Check your connection and try again.</Text> : null}
        </View>
        {plans.length ? (
          <View style={s.notes}>
            {['Minutes reset monthly', 'Switch anytime', 'English captions'].map((t) => (
              <View key={t} style={s.note}>
                <CheckIcon size={16} color={C.accent} />
                <Text style={s.noteText}>{t}</Text>
              </View>
            ))}
          </View>
        ) : null}


        <View style={{ flex: 1, minHeight: 20 }} />
        {trial && plan ? (
          <View style={s.priceBlock}>
            <Text style={s.priceMain}>1 week free</Text>
            <Text style={s.priceSub}>
              {TRIAL_MINUTES} minutes to try, then {plan.price} a month
            </Text>
          </View>
        ) : null}
        <Button
          label={cta}
          kind="accent"
          onPress={handleSubscribe}
          busy={purchasing}
          disabled={!plan || (changing && plan.name === currentPlan)}
          style={{ height: 60, borderRadius: 30 }}
        />
        {changing ? (
          <Pressable onPress={manageSubscription} accessibilityRole="button" style={s.restore}>
            <Text style={s.restoreText}>Manage or cancel in the App Store</Text>
          </Pressable>
        ) : (
          <Pressable onPress={handleRestore} disabled={restoring} accessibilityRole="button" style={s.restore}>
            {restoring ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.restoreText}>Restore purchase</Text>}
          </Pressable>
        )}
        {plan ? (
          <Text style={s.legal}>
            {trial ? `After the free week, ${plan.price} a month is charged to your Apple ID. ` : `${plan.price} a month is charged to your Apple ID. `}
            It renews monthly unless you cancel at least 24 hours before the period ends. Unused minutes don't carry over. Manage or cancel any time
            in your App Store account settings.
          </Text>
        ) : null}
        <View style={s.legalRow}>
          <Pressable onPress={() => Linking.openURL(TERMS_URL)} hitSlop={8} accessibilityRole="link">
            <Text style={s.legalLink}>Terms of Use</Text>
          </Pressable>
          <Pressable onPress={() => Linking.openURL(PRIVACY_URL)} hitSlop={8} accessibilityRole="link">
            <Text style={s.legalLink}>Privacy Policy</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.ground },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexGrow: 1, paddingTop: 24, paddingHorizontal: 20 },
  topRow: { flexDirection: 'row', marginBottom: 18 },
  avatarWrap: { alignSelf: 'center', width: 72, height: 72 },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avatarTick: { position: 'absolute', right: -2, bottom: -2, width: 30, height: 30, borderRadius: 15, borderWidth: 3, borderColor: C.ground, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: 14, fontSize: 28, lineHeight: 32, fontWeight: '800', color: C.onDark, letterSpacing: -0.6, textAlign: 'center' },
  titleLeft: { marginTop: 0, textAlign: 'left' },
  sub: { marginTop: 8, fontSize: 16, lineHeight: 22, color: C.onDark2, textAlign: 'center' },
  subLeft: { textAlign: 'left' },
  plans: { marginTop: 18, gap: 10 },
  plan: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 18, borderWidth: 2, borderColor: '#26262B', backgroundColor: '#111114', paddingVertical: 12, paddingHorizontal: 16 },
  planOn: { borderColor: C.accent, backgroundColor: '#0E1D17' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#52525B', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: C.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.accent },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planName: { fontSize: 18, fontWeight: '800', color: C.onDark },
  planMeta: { fontSize: 14, lineHeight: 19, color: C.onDark2 },
  planPrice: { fontSize: 18, fontWeight: '800', color: C.onDark },
  planPer: { fontSize: 12, color: C.onDark3 },
  tag: { height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: C.accent, justifyContent: 'center' },
  tagText: { fontSize: 12, fontWeight: '800', color: C.ground },
  tagMine: { height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: '#2A2A30', justifyContent: 'center' },
  tagMineText: { fontSize: 12, fontWeight: '700', color: C.chipText },
  empty: { fontSize: 15, lineHeight: 21, color: C.onDark2 },
  notes: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 14, rowGap: 6 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noteText: { fontSize: 14, color: C.onDark2 },
  priceBlock: { alignItems: 'center', gap: 2, marginBottom: 14 },
  priceMain: { fontSize: 20, fontWeight: '800', color: C.onDark },
  priceSub: { fontSize: 15, color: C.onDark2, textAlign: 'center' },
  restore: { marginTop: 6, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  restoreText: { fontSize: 15, fontWeight: '600', color: C.onDark },
  legal: { marginTop: 6, fontSize: 12, lineHeight: 17, color: C.onDark3, textAlign: 'center' },
  legalRow: { marginTop: 10, flexDirection: 'row', justifyContent: 'center', gap: 22 },
  legalLink: { fontSize: 13, color: C.onDark2, textDecorationLine: 'underline' },
});
