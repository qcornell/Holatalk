/**
 * The paywall, after setup: Ana is ready, start the free week. Price and trial come from the App
 * Store; Restore, Terms, Privacy and Apple's renewal wording are all here, as Apple requires.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  connectStore,
  getProduct,
  purchaseSubscription,
  restorePurchases,
} from '../subscription';
import type { SubscriptionProduct } from '../subscription';
import { CheckIcon } from '../teammate/icons';
import { Button, C } from '../main/ui';
import { PRIVACY_URL, TERMS_URL } from '../main/SettingsScreen';

const ANA = require('../../assets/teammate/ana.png');

interface PaywallScreenProps {
  onSubscribed: () => void;
  /** The assistant's name from setup */
  assistantName?: string;
}

export default function PaywallScreen({ onSubscribed, assistantName = 'Ana' }: PaywallScreenProps) {
  const insets = useSafeAreaInsets();
  const [product, setProduct] = useState<SubscriptionProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    initStore();
  }, []);

  const initStore = async () => {
    try {
      await connectStore((success) => {
        setPurchasing(false);
        if (success) {
          onSubscribed();
        }
      });

      // Apple can be slow or silent; show the screen with the default price rather than spin
      const prod = await Promise.race([
        getProduct(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000)),
      ]);
      setProduct(prod);
    } catch (e: any) {
      console.warn('[Paywall] init failed:', e?.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = useCallback(async () => {
    if (purchasing) return;
    setPurchasing(true);
    // Apple's purchase sheet sometimes never answers; don't leave the button spinning forever.
    const giveUp = setTimeout(() => {
      setPurchasing(false);
      Alert.alert(
        "Apple didn't respond",
        'Please try again. If you already started your free week, tap Restore purchase.',
      );
    }, 90000);
    try {
      await purchaseSubscription();
      clearTimeout(giveUp);
      // The purchase can come back here instead of through the listener: check for it directly.
      if (await restorePurchases()) {
        setPurchasing(false);
        onSubscribed();
        return;
      }
      setPurchasing(false); // cancelled, or still pending (the listener finishes it if it comes later)
    } catch (e: any) {
      clearTimeout(giveUp);
      setPurchasing(false);
      Alert.alert('Error', 'Could not complete purchase. Please try again.');
    }
  }, [purchasing, onSubscribed]);

  const handleRestore = useCallback(async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      const restored = await restorePurchases();
      if (restored) {
        onSubscribed();
      } else {
        Alert.alert(
          'No Subscription Found',
          'We couldn\'t find an active subscription for your account. If you believe this is an error, contact Apple Support.',
        );
      }
    } catch (e: any) {
      Alert.alert('Error', 'Could not restore purchases. Please try again.');
    } finally {
      setRestoring(false);
    }
  }, [restoring, onSubscribed]);

  const openTerms = () => Linking.openURL(TERMS_URL);
  const openPrivacy = () => Linking.openURL(PRIVACY_URL);

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

  // "$4.99/month" from the store; the words around it say "a month" already
  const price = (product?.price || '$4.99').replace(/\s*\/\s*(month|mo)\.?$/i, '');
  const perks = [
    `${assistantName} on speakerphone at every Spanish-speaking door`,
    'Your prices only. She never makes up an offer.',
    'Live English captions of the whole conversation',
    'Convo and Teach Me for inside the house',
  ];

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: Math.max(insets.bottom, 12) + 16 }]} bounces={false}>
        <View style={s.avatarWrap}>
          <Image source={ANA} style={s.avatar} accessibilityLabel={assistantName} />
          <View style={s.avatarTick}>
            <CheckIcon size={16} color={C.ground} />
          </View>
        </View>
        <Text style={s.title} accessibilityRole="header">
          {assistantName}'s ready for your first door
        </Text>
        <Text style={s.sub}>Try everything free for a week.</Text>

        <View style={s.perks}>
          {perks.map((p) => (
            <View key={p} style={s.perk}>
              <CheckIcon size={22} color={C.accent} />
              <Text style={s.perkText}>{p}</Text>
            </View>
          ))}
        </View>

        <View style={{ flex: 1, minHeight: 24 }} />
        <View style={s.priceBlock}>
          <Text style={s.priceMain}>1 week free</Text>
          <Text style={s.priceSub}>then {price} a month · cancel anytime</Text>
        </View>
        <Button label="Start my free week" kind="accent" onPress={handleSubscribe} busy={purchasing} style={{ height: 60, borderRadius: 30 }} />
        <Pressable onPress={handleRestore} disabled={restoring} accessibilityRole="button" style={s.restore}>
          {restoring ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.restoreText}>Restore purchase</Text>}
        </Pressable>
        <Text style={s.legal}>
          After the free week, {price} a month is charged to your Apple ID. It renews monthly unless you cancel at least 24 hours
          before the period ends. Manage or cancel any time in your App Store account settings.
        </Text>
        <View style={s.legalRow}>
          <Pressable onPress={openTerms} hitSlop={8} accessibilityRole="link">
            <Text style={s.legalLink}>Terms of Use</Text>
          </Pressable>
          <Pressable onPress={openPrivacy} hitSlop={8} accessibilityRole="link">
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
  scroll: { flexGrow: 1, paddingTop: 36, paddingHorizontal: 22 },
  avatarWrap: { alignSelf: 'center', width: 96, height: 96 },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarTick: { position: 'absolute', right: -2, bottom: -2, width: 34, height: 34, borderRadius: 17, borderWidth: 3, borderColor: C.ground, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: 20, fontSize: 32, lineHeight: 36, fontWeight: '800', color: C.onDark, letterSpacing: -0.6, textAlign: 'center' },
  sub: { marginTop: 10, fontSize: 17, lineHeight: 24, color: C.onDark2, textAlign: 'center' },
  perks: { marginTop: 26, backgroundColor: '#111114', borderWidth: 1, borderColor: '#26262B', borderRadius: 20, padding: 18, gap: 14 },
  perk: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  perkText: { flex: 1, fontSize: 16, lineHeight: 22, color: C.chipText },
  priceBlock: { alignItems: 'center', gap: 2, marginBottom: 14 },
  priceMain: { fontSize: 20, fontWeight: '800', color: C.onDark },
  priceSub: { fontSize: 15, color: C.onDark2 },
  restore: { marginTop: 6, height: 44, alignItems: 'center', justifyContent: 'center' },
  restoreText: { fontSize: 15, fontWeight: '600', color: C.onDark },
  legal: { marginTop: 6, fontSize: 12, lineHeight: 17, color: C.onDark3, textAlign: 'center' },
  legalRow: { marginTop: 10, flexDirection: 'row', justifyContent: 'center', gap: 22 },
  legalLink: { fontSize: 13, color: C.onDark2, textDecorationLine: 'underline' },
});
