/**
 * Subscription store — handles IAP purchases, restore, and status checks.
 * Uses expo-iap (StoreKit 2 on iOS, Play Billing on Android).
 */

import {
  initConnection,
  endConnection,
  fetchProducts,
  requestPurchase,
  getAvailablePurchases,
  hasActiveSubscriptions,
  finishTransaction,
  purchaseUpdatedListener,
  purchaseErrorListener,
  deepLinkToSubscriptions,
} from 'expo-iap';
import type { Purchase } from 'expo-iap';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';
import {
  ALL_SUBSCRIPTION_IDS,
  LEGACY_PLAN,
  PLANS,
  PRODUCT_ID,
  SUB_CACHE_KEY,
  SUB_CACHE_EXPIRY_KEY,
  CACHE_DURATION_MS,
} from './config';
import type { PlanInfo } from './config';

export interface SubscriptionProduct {
  title: string;
  description: string;
  price: string;
  productId: string;
}

/** A plan as the App Store sells it: our name and minutes, Apple's price. */
export interface PlanProduct extends PlanInfo {
  /** Localized price from the App Store, e.g. "$19.99" */
  price: string;
  /** The plan has a free-trial introductory offer */
  freeTrial: boolean;
}

let connected = false;
let purchaseUpdateSub: { remove: () => void } | null = null;
let purchaseErrorSub: { remove: () => void } | null = null;

/**
 * Connect to the store and set up purchase listener
 */
export async function connectStore(
  onPurchaseComplete: (success: boolean) => void
): Promise<void> {
  if (connected) return;

  try {
    await initConnection();
    connected = true;
    console.log('[Store] Connected to IAP service');

    // Listen for purchase results
    purchaseUpdateSub = purchaseUpdatedListener(async (purchase: Purchase) => {
      console.log('[Store] Purchase update:', purchase.productId, purchase.purchaseState);
      
      if (purchase.purchaseState === 'purchased' && ALL_SUBSCRIPTION_IDS.includes(purchase.productId)) {
        // Finish the transaction
        try {
          await finishTransaction({ purchase, isConsumable: false });
          console.log('[Store] Transaction finished');
        } catch (e: any) {
          console.warn('[Store] finishTransaction error:', e?.message);
        }
        
        // Cache the subscription status
        await cacheSubscriptionStatus(true);
        onPurchaseComplete(true);
      }
    });

    purchaseErrorSub = purchaseErrorListener((error) => {
      console.warn('[Store] Purchase error:', error.code, error.message);
      if (error.code === 'user-cancelled') {
        onPurchaseComplete(false);
      } else {
        onPurchaseComplete(false);
      }
    });
  } catch (e: any) {
    console.warn('[Store] initConnection failed:', e?.message);
  }
}

/**
 * Disconnect from store
 */
export async function disconnectStore(): Promise<void> {
  if (!connected) return;
  try {
    purchaseUpdateSub?.remove();
    purchaseErrorSub?.remove();
    purchaseUpdateSub = null;
    purchaseErrorSub = null;
    await endConnection();
    connected = false;
  } catch (e: any) {
    console.warn('[Store] endConnection failed:', e?.message);
  }
}

/**
 * Get subscription product details from App Store
 */
export async function getProduct(): Promise<SubscriptionProduct | null> {
  try {
    if (!connected) {
      await initConnection();
      connected = true;
    }

    // expo-iap fetchProducts updates internal state; for direct API we use it differently
    // Use the direct API which returns products
    const products = await fetchProducts({ skus: [PRODUCT_ID], type: 'subs' });

    if (products && products.length > 0) {
      const p = products[0];
      return {
        title: p.title,
        description: p.description,
        price: p.displayPrice,
        productId: p.id,
      };
    }
    console.warn('[Store] No products found for:', PRODUCT_ID);
    return null;
  } catch (e: any) {
    console.warn('[Store] getProduct failed:', e?.message);
    return null;
  }
}

/**
 * The plans for sale, cheapest first, with App Store prices. Until the plans exist in App Store
 * Connect this falls back to the first subscription, so the paywall always has something to sell.
 */
export async function getPlans(): Promise<PlanProduct[]> {
  try {
    if (!connected) {
      await initConnection();
      connected = true;
    }
    const products = ((await fetchProducts({ skus: ALL_SUBSCRIPTION_IDS, type: 'subs' })) ?? []) as any[];
    const byId = new Map(products.map((p) => [p.id, p]));
    const toPlan = (info: PlanInfo): PlanProduct | null => {
      const p = byId.get(info.id);
      if (!p) return null;
      const trial = p.introductoryPricePaymentModeIOS === 'free-trial' || p.subscriptionInfoIOS?.introductoryOffer?.paymentMode === 'free-trial';
      return { ...info, price: p.displayPrice, freeTrial: !!trial };
    };
    const plans = PLANS.map(toPlan).filter((p): p is PlanProduct => !!p);
    if (plans.length) return plans;
    const legacy = toPlan(LEGACY_PLAN);
    return legacy ? [legacy] : [];
  } catch (e: any) {
    console.warn('[Store] getPlans failed:', e?.message);
    return [];
  }
}

/** Buy a plan, or switch to it (Apple handles upgrades and downgrades within the plans). */
export async function purchasePlan(productId: string): Promise<void> {
  await requestPurchase({
    request: { apple: { sku: productId }, google: { skus: [productId] } },
    type: 'subs',
  });
}

/**
 * The rep's live subscriptions as Apple-signed transactions (JWS), for the Hola server to check.
 * Empty when there are none or the store can't be reached.
 */
export async function planTransactions(): Promise<string[]> {
  try {
    if (!connected) {
      await initConnection();
      connected = true;
    }
    const purchases = ((await getAvailablePurchases()) ?? []) as Purchase[];
    return purchases
      .filter((p) => ALL_SUBSCRIPTION_IDS.includes(p.productId) && typeof p.purchaseToken === 'string' && p.purchaseToken.length > 0)
      .map((p) => p.purchaseToken as string);
  } catch (e: any) {
    console.warn('[Store] planTransactions failed:', e?.message);
    return [];
  }
}

/** Apple's own screen to change or cancel the plan. */
export async function manageSubscription(): Promise<void> {
  try {
    await deepLinkToSubscriptions();
  } catch {
    await Linking.openURL('https://apps.apple.com/account/subscriptions');
  }
}

/**
 * Initiate a purchase of the first subscription (kept for older callers)
 */
export async function purchaseSubscription(): Promise<void> {
  try {
    await requestPurchase({
      request: {
        apple: { sku: PRODUCT_ID },
        google: { skus: [PRODUCT_ID] },
      },
      type: 'subs',
    });
    // Result comes via the purchase listener
  } catch (e: any) {
    console.warn('[Store] purchase failed:', e?.message);
    throw e;
  }
}

/**
 * Restore purchases — checks for existing subscription
 */
export async function restorePurchases(): Promise<boolean> {
  try {
    if (!connected) {
      await initConnection();
      connected = true;
    }

    const hasActive = await hasActiveSubscriptions(ALL_SUBSCRIPTION_IDS);
    
    if (hasActive) {
      await cacheSubscriptionStatus(true);
      return true;
    }

    // Fallback: check available purchases
    const purchases = await getAvailablePurchases();
    
    if (purchases && purchases.length > 0) {
      for (const purchase of purchases) {
        if (ALL_SUBSCRIPTION_IDS.includes(purchase.productId) && purchase.purchaseState === 'purchased') {
          try {
            await finishTransaction({ purchase, isConsumable: false });
          } catch (e) {
            // May already be finished
          }
          await cacheSubscriptionStatus(true);
          return true;
        }
      }
    }

    await cacheSubscriptionStatus(false);
    return false;
  } catch (e: any) {
    console.warn('[Store] restore failed:', e?.message);
    return false;
  }
}

/**
 * Check if user has active subscription (cached + fresh check)
 */
export async function checkSubscriptionStatus(): Promise<boolean> {
  // Check cache first
  const cached = await getCachedStatus();
  if (cached !== null) return cached;

  // No valid cache — do a fresh restore check
  return restorePurchases();
}

/**
 * Cache subscription status locally
 */
async function cacheSubscriptionStatus(active: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(SUB_CACHE_KEY, active ? 'active' : 'inactive');
    await AsyncStorage.setItem(SUB_CACHE_EXPIRY_KEY, String(Date.now() + CACHE_DURATION_MS));
  } catch (e) {
    // Non-critical
  }
}

/**
 * Get cached status (returns null if expired/missing)
 */
async function getCachedStatus(): Promise<boolean | null> {
  try {
    const status = await AsyncStorage.getItem(SUB_CACHE_KEY);
    const expiry = await AsyncStorage.getItem(SUB_CACHE_EXPIRY_KEY);

    if (!status || !expiry) return null;
    if (Date.now() > Number(expiry)) return null; // expired

    return status === 'active';
  } catch (e) {
    return null;
  }
}

/**
 * Clear cached subscription (for testing/debug)
 */
export async function clearCache(): Promise<void> {
  await AsyncStorage.removeItem(SUB_CACHE_KEY);
  await AsyncStorage.removeItem(SUB_CACHE_EXPIRY_KEY);
}
