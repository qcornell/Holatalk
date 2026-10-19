/**
 * PaywallScreen — Shown when user has no active subscription.
 * Clean, friendly design that works on all iPhone sizes (including 13 mini).
 * 
 * Features:
 * - Product info from App Store (price, trial)
 * - Subscribe button (starts free trial → auto-renews)
 * - Restore purchases button
 * - Terms/Privacy links
 * - Apple-required subscription disclosure
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  connectStore,
  getProduct,
  purchaseSubscription,
  restorePurchases,
} from '../subscription';
import type { SubscriptionProduct } from '../subscription';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const isSmallScreen = SCREEN_HEIGHT < 700; // iPhone SE, 13 mini

interface PaywallScreenProps {
  onSubscribed: () => void;
}

export default function PaywallScreen({ onSubscribed }: PaywallScreenProps) {
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

      const prod = await getProduct();
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
    try {
      await purchaseSubscription();
      // Result handled by purchase listener in connectStore
    } catch (e: any) {
      setPurchasing(false);
      Alert.alert('Error', 'Could not complete purchase. Please try again.');
    }
  }, [purchasing]);

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

  const openTerms = () => Linking.openURL('https://sites.google.com/view/holad2dtranslator/terms');
  const openPrivacy = () => Linking.openURL('https://sites.google.com/view/holad2dtranslator/home');

  if (loading) {
    return (
      <SafeAreaView style={s.root}>
        <StatusBar barStyle="dark-content" backgroundColor="#F5F6FB" />
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color="#7C5CFC" />
          <Text style={s.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const priceText = product?.price || '$4.99/month';

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F6FB" />
      <ScrollView
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Hero */}
        <View style={s.heroSection}>
          <Text style={s.heroEmoji}>👋</Text>
          <Text style={s.heroTitle}>Hola D2D</Text>
          <Text style={s.heroSubtitle}>Your door-to-door sales assistant</Text>
        </View>

        {/* Features */}
        <View style={s.featuresCard}>
          <Text style={s.featuresTitle}>Everything you need</Text>
          
          <FeatureRow icon="🎤" label="Real-Time Translation" desc="Spanish ↔ English on-device speech recognition" />
          <View style={s.featureDivider} />
          <FeatureRow icon="🗣️" label="Guided Conversations" desc="AI-powered sales coaching with objection handling" />
          <View style={s.featureDivider} />
          <FeatureRow icon="📱" label="Works Offline" desc="No internet needed for speech recognition" />
          <View style={s.featureDivider} />
          <FeatureRow icon="🎧" label="Bluetooth Ready" desc="Works with smart glasses and earpieces" />
        </View>

        {/* Pricing */}
        <View style={s.pricingCard}>
          <View style={s.trialBadge}>
            <Text style={s.trialBadgeText}>1 WEEK FREE TRIAL</Text>
          </View>
          <Text style={s.priceMain}>{priceText}</Text>
          <Text style={s.priceSub}>after free trial · cancel anytime</Text>
        </View>

        {/* Subscribe Button */}
        <TouchableOpacity
          style={[s.subscribeBtn, purchasing && s.subscribeBtnDisabled]}
          onPress={handleSubscribe}
          activeOpacity={0.85}
          disabled={purchasing}
        >
          {purchasing ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={s.subscribeBtnText}>Start Free Trial</Text>
          )}
        </TouchableOpacity>

        {/* Restore */}
        <TouchableOpacity
          style={s.restoreBtn}
          onPress={handleRestore}
          activeOpacity={0.7}
          disabled={restoring}
        >
          {restoring ? (
            <ActivityIndicator color="#7C5CFC" size="small" />
          ) : (
            <Text style={s.restoreBtnText}>Restore Purchase</Text>
          )}
        </TouchableOpacity>

        {/* Legal */}
        <View style={s.legalRow}>
          <TouchableOpacity onPress={openTerms} activeOpacity={0.7}>
            <Text style={s.legalLink}>Terms of Use</Text>
          </TouchableOpacity>
          <Text style={s.legalDot}>·</Text>
          <TouchableOpacity onPress={openPrivacy} activeOpacity={0.7}>
            <Text style={s.legalLink}>Privacy Policy</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.legalDisclaimer}>
          Payment will be charged to your Apple ID account at the confirmation of purchase.
          Subscription automatically renews unless it is canceled at least 24 hours before the
          end of the current period. Your account will be charged for renewal within 24 hours
          prior to the end of the current period. You can manage and cancel your subscriptions
          by going to your App Store account settings after purchase.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

/* Feature row component for cleaner JSX */
function FeatureRow({ icon, label, desc }: { icon: string; label: string; desc: string }) {
  return (
    <View style={s.featureRow}>
      <Text style={s.featureIcon}>{icon}</Text>
      <View style={s.featureTextWrap}>
        <Text style={s.featureLabel}>{label}</Text>
        <Text style={s.featureDesc}>{desc}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F5F6FB',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    flexGrow: 1,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    color: '#A0A3BD',
    fontWeight: '500',
  },

  // Hero
  heroSection: {
    alignItems: 'center',
    paddingTop: isSmallScreen ? 12 : 28,
    marginBottom: isSmallScreen ? 14 : 22,
  },
  heroEmoji: {
    fontSize: isSmallScreen ? 44 : 56,
    marginBottom: 6,
  },
  heroTitle: {
    fontSize: isSmallScreen ? 26 : 32,
    fontWeight: '800',
    color: '#1A1B2E',
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontSize: isSmallScreen ? 13 : 15,
    color: '#6B7280',
    marginTop: 4,
    fontWeight: '500',
  },

  // Features card
  featuresCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: isSmallScreen ? 14 : 18,
    marginBottom: isSmallScreen ? 10 : 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  featuresTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7C5CFC',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: isSmallScreen ? 10 : 14,
    textAlign: 'center',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: isSmallScreen ? 5 : 7,
  },
  featureIcon: {
    fontSize: isSmallScreen ? 20 : 24,
    width: 32,
    textAlign: 'center',
  },
  featureTextWrap: {
    flex: 1,
  },
  featureLabel: {
    fontSize: isSmallScreen ? 14 : 15,
    fontWeight: '700',
    color: '#1A1B2E',
  },
  featureDesc: {
    fontSize: isSmallScreen ? 11 : 12,
    color: '#6B7280',
    marginTop: 1,
    lineHeight: isSmallScreen ? 15 : 17,
  },
  featureDivider: {
    height: 1,
    backgroundColor: '#F0F1F7',
    marginVertical: 2,
  },

  // Pricing card
  pricingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: isSmallScreen ? 14 : 18,
    marginBottom: isSmallScreen ? 14 : 18,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    borderWidth: 2,
    borderColor: '#7C5CFC',
  },
  trialBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 10,
  },
  trialBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  priceMain: {
    fontSize: isSmallScreen ? 26 : 32,
    fontWeight: '800',
    color: '#1A1B2E',
  },
  priceSub: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 3,
    fontWeight: '500',
  },

  // Subscribe button
  subscribeBtn: {
    backgroundColor: '#7C5CFC',
    borderRadius: 16,
    paddingVertical: isSmallScreen ? 15 : 17,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#7C5CFC',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    marginBottom: 10,
  },
  subscribeBtnDisabled: {
    opacity: 0.7,
  },
  subscribeBtnText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

  // Restore button
  restoreBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  restoreBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7C5CFC',
  },

  // Legal
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  legalLink: {
    fontSize: 12,
    color: '#7C5CFC',
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  legalDot: {
    fontSize: 12,
    color: '#A0A3BD',
  },
  legalDisclaimer: {
    fontSize: 10,
    color: '#A0A3BD',
    textAlign: 'center',
    lineHeight: 15,
    paddingHorizontal: 4,
  },
});
