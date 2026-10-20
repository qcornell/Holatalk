// start-live: lets the Hola app start a Teammate call with Ana.
//
// The app POSTs { access_code, device_id }. If the code is good and the rep has minutes left this
// month, this returns a LiveKit token for a fresh room, with Ana (the hola-teammate agent) dispatched
// into it. The app then sends Ana its playbook over the data channel when she joins.
//
// Secrets (supabase secrets set ...):
//   LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET   your LiveKit Cloud project (Settings > Keys)
//   TEAMMATE_ACCESS_CODES                              comma-separated codes that may start calls
//   TEAMMATE_MONTHLY_MINUTES                           optional cap per device, default 300
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase. Minutes come from the
// hola_minutes_this_month view, which the agent fills as calls run (migrations 002 and 003).
//
// Deploy: supabase functions deploy start-live --no-verify-jwt  (the access code is the check)

import { AccessToken, RoomAgentDispatch, RoomConfiguration } from 'npm:livekit-server-sdk@2.19.1'

const LIVEKIT_URL = Deno.env.get('LIVEKIT_URL') ?? ''
const LIVEKIT_API_KEY = Deno.env.get('LIVEKIT_API_KEY') ?? ''
const LIVEKIT_API_SECRET = Deno.env.get('LIVEKIT_API_SECRET') ?? ''
const ACCESS_CODES = (Deno.env.get('TEAMMATE_ACCESS_CODES') ?? '')
  .split(',')
  .map((c) => c.trim())
  .filter(Boolean)
const MONTHLY_MINUTES = Number(Deno.env.get('TEAMMATE_MONTHLY_MINUTES') ?? '300')
const AGENT_NAME = Deno.env.get('TEAMMATE_AGENT_NAME') ?? 'hola-teammate'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

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

async function minutesUsed(userId: string): Promise<number> {
  if (!SUPABASE_URL || !SERVICE_KEY) return 0
  const url = `${SUPABASE_URL}/rest/v1/hola_minutes_this_month?user_id=eq.${encodeURIComponent(userId)}&select=minutes`
  const r = await fetch(url, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } })
  if (!r.ok) throw new Error(`minutes lookup failed: HTTP ${r.status}`)
  const rows = (await r.json()) as { minutes: number }[]
  return rows[0]?.minutes ?? 0
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' })
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || ACCESS_CODES.length === 0) {
    return reply(500, { error: 'not_configured', message: 'Set the LiveKit secrets and TEAMMATE_ACCESS_CODES.' })
  }

  let body: { access_code?: unknown; device_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return reply(400, { error: 'bad_request' })
  }
  const code = typeof body.access_code === 'string' ? body.access_code.trim() : ''
  const device = typeof body.device_id === 'string' ? body.device_id.trim() : ''
  if (!/^[A-Za-z0-9-]{8,64}$/.test(device)) return reply(400, { error: 'bad_device_id' })
  if (!code || !ACCESS_CODES.some((c) => sameCode(c, code))) {
    return reply(401, { error: 'bad_access_code', message: 'That access code is not right.' })
  }

  const userId = `device-${device}`
  let used = 0
  try {
    used = await minutesUsed(userId)
  } catch (e) {
    console.error(e instanceof Error ? e.message : e) // don't block calls when the meter is down
  }
  if (used >= MONTHLY_MINUTES) {
    return reply(402, { error: 'out_of_minutes', message: `You've used your ${MONTHLY_MINUTES} minutes this month.` })
  }

  const identity = `rep-${device}`
  const roomName = `hola-${device.slice(0, 8)}-${Date.now().toString(36)}`
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity, name: 'Rep', ttl: '30m' })
  token.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true, canPublishData: true })
  token.roomConfig = new RoomConfiguration({
    agents: [
      new RoomAgentDispatch({
        agentName: AGENT_NAME,
        metadata: JSON.stringify({ user_id: userId, rep_identity: identity }),
      }),
    ],
  })

  return reply(200, {
    serverUrl: LIVEKIT_URL,
    participantToken: await token.toJwt(),
    roomName,
    minutesLeft: Math.max(0, MONTHLY_MINUTES - used),
  })
})
