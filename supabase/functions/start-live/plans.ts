// Hola's plans: each App Store subscription and the Ana minutes it includes every month.
// Minutes reset each billing period (no rollover). The free week includes TRIAL_MINUTES.
// To change minutes without a new build, set PLAN_MINUTES, e.g. {"hola_pro_monthly":120}.

import type { AppleTransaction } from './apple.ts'

export interface Plan {
  name: string
  minutes: number
}

export const PLANS: Record<string, Plan> = {
  hola_starter_monthly: { name: 'Starter', minutes: 40 },
  hola_pro_monthly: { name: 'Pro', minutes: 100 },
  hola_heavy_monthly: { name: 'Heavy', minutes: 250 },
  hola_max_monthly: { name: 'Max', minutes: 500 },
  hola_d2d_pro_monthly: { name: 'Starter', minutes: 40 }, // the first plan; testers may still have it
}

export const TRIAL_MINUTES = 15

export function plansWithOverrides(raw: string | undefined): Record<string, Plan> {
  if (!raw) return PLANS
  try {
    const extra = JSON.parse(raw) as Record<string, number>
    const out: Record<string, Plan> = { ...PLANS }
    for (const [id, minutes] of Object.entries(extra)) {
      if (out[id] && Number.isFinite(minutes) && minutes >= 0) out[id] = { ...out[id], minutes }
    }
    return out
  } catch {
    return PLANS
  }
}

/** What a rep is entitled to right now, from one of their App Store subscriptions. */
export interface Entitlement {
  userId: string // one account per App Store subscription: renewals and plan changes keep it
  productId: string
  plan: string
  minutes: number // in this billing period
  trial: boolean
  periodStart: number // ms
  periodEnd: number // ms
  environment: string
}

/** The best live subscription among the rep's verified transactions, or null. */
export function pickEntitlement(txs: AppleTransaction[], now: number, plans: Record<string, Plan> = PLANS): Entitlement | null {
  let best: Entitlement | null = null
  for (const t of txs) {
    const plan = plans[t.productId]
    if (!plan || t.revocationDate || !t.expiresDate || t.expiresDate <= now || t.purchaseDate > now) continue
    const trial = t.offerType === 1 || t.offerDiscountType === 'FREE_TRIAL'
    const e: Entitlement = {
      userId: `apple-${t.originalTransactionId}`,
      productId: t.productId,
      plan: plan.name,
      minutes: trial ? Math.min(TRIAL_MINUTES, plan.minutes) : plan.minutes,
      trial,
      periodStart: t.purchaseDate,
      periodEnd: t.expiresDate,
      environment: t.environment ?? '',
    }
    if (!best || e.minutes > best.minutes) best = e
  }
  return best
}

/** Whole minutes left (rounded down), and the exact seconds for Ana's timer. */
export function left(minutes: number, secondsUsed: number): { minutesLeft: number; secondsLeft: number } {
  const secondsLeft = Math.max(0, minutes * 60 - secondsUsed)
  return { minutesLeft: Math.floor(secondsLeft / 60), secondsLeft }
}
