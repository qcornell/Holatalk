/**
 * Subscription configuration: Hola's plans in the App Store.
 *
 * Each plan includes Ana minutes every month (they reset each billing period). The server
 * (supabase/functions/start-live/plans.ts) is what actually counts them; keep the two lists the same.
 */

export interface PlanInfo {
  id: string;
  name: string;
  minutes: number;
  /** Shown as "Most popular" */
  popular?: boolean;
}

export const PLANS: PlanInfo[] = [
  { id: 'hola_starter_monthly', name: 'Starter', minutes: 40 },
  { id: 'hola_pro_monthly', name: 'Pro', minutes: 100, popular: true },
  { id: 'hola_heavy_monthly', name: 'Heavy', minutes: 250 },
  { id: 'hola_max_monthly', name: 'Max', minutes: 500 },
];

/** The first subscription, before plans. Still honored for testers who have it. */
export const PRODUCT_ID = 'hola_d2d_pro_monthly';
export const LEGACY_PLAN: PlanInfo = { id: PRODUCT_ID, name: 'Starter', minutes: 40 };

export const ALL_SUBSCRIPTION_IDS = [...PLANS.map((p) => p.id), PRODUCT_ID];

/** Ana minutes in the free week */
export const TRIAL_MINUTES = 15;

// Storage keys for caching subscription status
export const SUB_CACHE_KEY = '@hola_subscription_status';
export const SUB_CACHE_EXPIRY_KEY = '@hola_subscription_expiry';

// Cache duration: 1 hour (re-validate periodically)
export const CACHE_DURATION_MS = 60 * 60 * 1000;
