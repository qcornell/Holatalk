/**
 * 📁 Plans & Pricing Library
 * 
 * Default plans for Optimum. Companies customize this during onboarding.
 * Each plan generates Spanish scripts automatically.
 */

export interface Plan {
  id: string;
  name: string;
  nameEs: string;
  speed: string;
  priceMonthly: number;
  features: string[];
  featuresEs: string[];
  /** Auto-generated pitch in Spanish */
  pitchEs: string;
  /** Auto-generated pitch in English (for rep) */
  pitchEn: string;
  /** Best for (upsell context) */
  bestFor: string;
  bestForEs: string;
}

export const PLANS: Plan[] = [
  {
    id: 'basic',
    name: 'Basic',
    nameEs: 'Básico',
    speed: '300 Mbps',
    priceMonthly: 39.99,
    features: ['300 Mbps download', 'Unlimited data', 'Free modem'],
    featuresEs: ['300 Mbps de descarga', 'Datos ilimitados', 'Modem gratis'],
    pitchEs: 'El plan Básico de 300 Mbps está a solo $39.99 al mes. Incluye datos ilimitados y el modem es gratis.',
    pitchEn: 'Basic plan: 300 Mbps at $39.99/mo. Unlimited data, free modem.',
    bestFor: '1-2 people, casual browsing, streaming',
    bestForEs: 'Para 1-2 personas, navegar y ver películas',
  },
  {
    id: 'plus',
    name: 'Plus',
    nameEs: 'Plus',
    speed: '500 Mbps',
    priceMonthly: 59.99,
    features: ['500 Mbps download', 'Unlimited data', 'Free modem', 'Free installation'],
    featuresEs: ['500 Mbps de descarga', 'Datos ilimitados', 'Modem gratis', 'Instalación gratis'],
    pitchEs: 'El plan Plus de 500 Mbps está a $59.99 al mes. Perfecto para familias. Todo incluido.',
    pitchEn: 'Plus plan: 500 Mbps at $59.99/mo. Great for families. Everything included.',
    bestFor: '3-5 people, multiple devices, gaming',
    bestForEs: 'Para familias de 3-5 personas, varios aparatos, videojuegos',
  },
  {
    id: 'ultra',
    name: 'Ultra',
    nameEs: 'Ultra',
    speed: '1 Gig',
    priceMonthly: 79.99,
    features: ['1 Gig download', 'Unlimited data', 'Free modem', 'Free installation', 'Priority support'],
    featuresEs: ['1 Gig de descarga', 'Datos ilimitados', 'Modem gratis', 'Instalación gratis', 'Soporte prioritario'],
    pitchEs: 'El plan Ultra de 1 Gig está a $79.99 al mes. La velocidad más rápida. Ideal para hogares grandes.',
    pitchEn: 'Ultra plan: 1 Gig at $79.99/mo. Fastest speed. Ideal for large households.',
    bestFor: '5+ people, work from home, heavy streaming + gaming',
    bestForEs: 'Para hogares grandes, trabajo desde casa, streaming y juegos',
  },
];

/** Get plan pitch for a specific plan by ID */
export function getPlanPitch(planId: string): { en: string; es: string } | null {
  const plan = PLANS.find(p => p.id === planId);
  if (!plan) return null;
  return { en: plan.pitchEn, es: plan.pitchEs };
}

/** Get the cheapest plan */
export function getCheapestPlan(): Plan {
  return PLANS.reduce((a, b) => a.priceMonthly < b.priceMonthly ? a : b);
}

/** Generate a comparison pitch (when customer has a provider) */
export function getComparisonPitch(customerPrice?: number): string {
  const cheapest = getCheapestPlan();
  if (customerPrice && customerPrice > cheapest.priceMonthly) {
    const savings = (customerPrice - cheapest.priceMonthly).toFixed(2);
    return `Con nosotros se ahorra $${savings} al mes. El plan ${cheapest.nameEs} de ${cheapest.speed} está a solo $${cheapest.priceMonthly}.`;
  }
  return cheapest.pitchEs;
}
