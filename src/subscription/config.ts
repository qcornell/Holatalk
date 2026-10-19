/**
 * Subscription configuration
 */

// App Store Connect product ID
export const PRODUCT_ID = 'hola_d2d_pro_monthly';

// Storage keys for caching subscription status
export const SUB_CACHE_KEY = '@hola_subscription_status';
export const SUB_CACHE_EXPIRY_KEY = '@hola_subscription_expiry';

// Cache duration: 1 hour (re-validate periodically)
export const CACHE_DURATION_MS = 60 * 60 * 1000;
