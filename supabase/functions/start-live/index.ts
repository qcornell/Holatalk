// start-live: the Hola app's door to Ana. Checks the rep's plan and minutes, and starts calls.
//
// The app POSTs { action, device_id, transactions }:
//   transactions  the StoreKit signed transactions (JWS) of the rep's subscriptions, from the phone
//   action        "status": { plan, minutesLeft, minutesInPlan, periodEnd, trial }
//                 "start":  the same, plus a LiveKit token for a fresh room with Ana dispatched in
// Each transaction is checked against Apple's signature (apple.ts). Minutes are counted per
// App Store subscription for the current billing period (plans.ts); the agent records them in
// hola_usage as calls run. Owners and testers can send { access_code } instead
// (TEAMMATE_ACCESS_CODES), with TEAMMATE_MONTHLY_MINUTES a calendar month.
//
// Secrets (supabase secrets set ...):
//   LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET   your LiveKit Cloud project (Settings > Keys)
//   APP_BUNDLE_ID                                      optional, default io.dappily.translator
//   TEAMMATE_ACCESS_CODES, TEAMMATE_MONTHLY_MINUTES    optional owner/tester codes
//   PLAN_MINUTES                                       optional JSON overrides, see plans.ts
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
//
// Deploy: supabase functions deploy start-live --no-verify-jwt  (Apple's signature is the check)

import { AccessToken, RoomAgentDispatch, RoomConfiguration } from 'npm:livekit-server-sdk@2.19.1'
import { AppleCheckError, verifyAppleTransaction } from './apple.ts'
import type { AppleTransaction } from './apple.ts'
import { left, pickEntitlement, plansWithOverrides } from './plans.ts'

const env = (k: string, d = '') => Deno.env.get(k) ?? d
const LIVEKIT_URL = env('LIVEKIT_URL')
const LIVEKIT_API_KEY = env('LIVEKIT_API_KEY')
const LIVEKIT_API_SECRET = env('LIVEKIT_API_SECRET')
const BUNDLE_ID = env('APP_BUNDLE_ID', 'io.dappily.translator')
const ACCESS_CODES = env('TEAMMATE_ACCESS_CODES').split(',').map((c) => c.trim()).filter(Boolean)
const CODE_MINUTES = Number(env('TEAMMATE_MONTHLY_MINUTES', '300'))
const AGENT_NAME = env('TEAMMATE_AGENT_NAME', 'hola-teammate')
const SUPABASE_URL = env('SUPABASE_URL')
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY')
const PLANS = plansWithOverrides(Deno.env.get('PLAN_MINUTES'))

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } })
}

/** Compares without leaking how much of the code matched. */
function sameCode(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

async function db(path: string, init: RequestInit = {}): Promise<Response> {
  return await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

/** Seconds of Ana this account used in [from, to). Calls count in the period they started. */
async function secondsUsed(userId: string, from: number, to: number): Promise<number> {
  const r = await db('rpc/hola_seconds_used', {
    method: 'POST',
    body: JSON.stringify({ p_user: userId, p_from: new Date(from).toISOString(), p_to: new Date(to).toISOString() }),
  })
  if (!r.ok) throw new Error(`minutes lookup failed: HTTP ${r.status}`)
  return Number(await r.json()) || 0
}

async function rememberAccount(row: Record<string, unknown>): Promise<void> {
  const r = await db('hola_accounts?on_conflict=user_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ ...row, updated_at: new Date().toISOString() }),
  })
  if (!r.ok) console.error(`account save failed: HTTP ${r.status}`) // the plan check still stands
}

interface Access {
  userId: string
  plan: string
  minutesInPlan: number
  periodStart: number
  periodEnd: number
  trial: boolean
}

async function accessFromApple(jwsList: string[], device: string): Promise<Access | null> {
  const txs: AppleTransaction[] = []
  for (const jws of jwsList.slice(0, 10)) {
    try {
      txs.push(await verifyAppleTransaction(jws, { bundleId: BUNDLE_ID }))
    } catch (e) {
      console.warn(e instanceof AppleCheckError ? `transaction rejected: ${e.message}` : 'transaction check failed')
    }
  }
  const ent = pickEntitlement(txs, Date.now(), PLANS)
  if (!ent) return null
  await rememberAccount({
    user_id: ent.userId,
    product_id: ent.productId,
    period_start: new Date(ent.periodStart).toISOString(),
    period_end: new Date(ent.periodEnd).toISOString(),
    plan_minutes: ent.minutes,
    trial: ent.trial,
    environment: ent.environment,
    device_id: device,
  })
  return { userId: ent.userId, plan: ent.plan, minutesInPlan: ent.minutes, periodStart: ent.periodStart, periodEnd: ent.periodEnd, trial: ent.trial }
}

function accessFromCode(device: string): Access {
  const now = new Date()
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
  return { userId: `device-${device}`, plan: 'Owner', minutesInPlan: CODE_MINUTES, periodStart: start, periodEnd: end, trial: false }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' })
  if (!SUPABASE_URL || !SERVICE_KEY) return reply(500, { error: 'not_configured', message: 'The server is missing its database settings.' })

  let body: { action?: unknown; access_code?: unknown; device_id?: unknown; transactions?: unknown }
  try {
    body = await req.json()
  } catch {
    return reply(400, { error: 'bad_request' })
  }
  const action = body.action === 'status' ? 'status' : 'start'
  const device = typeof body.device_id === 'string' ? body.device_id.trim() : ''
  if (!/^[A-Za-z0-9-]{8,64}$/.test(device)) return reply(400, { error: 'bad_device_id' })
  const code = typeof body.access_code === 'string' ? body.access_code.trim() : ''
  const jwsList = Array.isArray(body.transactions) ? body.transactions.filter((t): t is string => typeof t === 'string' && t.length < 20000) : []

  let access: Access | null = null
  if (code) {
    if (!ACCESS_CODES.some((c) => sameCode(c, code))) return reply(401, { error: 'bad_access_code', message: 'That access code is not right.' })
    access = accessFromCode(device)
  } else {
    access = await accessFromApple(jwsList, device)
    if (!access) return reply(403, { error: 'no_plan', message: 'No active Hola plan on this Apple ID.' })
  }

  let used = 0
  try {
    used = await secondsUsed(access.userId, access.periodStart, access.periodEnd)
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    return reply(503, { error: 'meter_down', message: "Couldn't check your minutes. Try again in a moment." })
  }
  const { minutesLeft, secondsLeft } = left(access.minutesInPlan, used)
  const status = {
    plan: access.plan,
    minutesLeft,
    minutesInPlan: access.minutesInPlan,
    periodEnd: new Date(access.periodEnd).toISOString(),
    trial: access.trial,
  }
  if (action === 'status') return reply(200, status)
  if (secondsLeft < 30) return reply(402, { error: 'out_of_minutes', message: `You've used your ${access.minutesInPlan} minutes for now.`, ...status })
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) return reply(500, { error: 'not_configured', message: 'The server is missing its LiveKit settings.' })

  const identity = `rep-${device}`
  const roomName = `hola-${device.slice(0, 8)}-${Date.now().toString(36)}`
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity, name: 'Rep', ttl: '30m' })
  token.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true, canPublishData: true })
  token.roomConfig = new RoomConfiguration({
    agents: [
      new RoomAgentDispatch({
        agentName: AGENT_NAME,
        metadata: JSON.stringify({ user_id: access.userId, rep_identity: identity, seconds_left: secondsLeft }),
      }),
    ],
  })
  return reply(200, { ...status, serverUrl: LIVEKIT_URL, participantToken: await token.toJwt(), roomName })
})
