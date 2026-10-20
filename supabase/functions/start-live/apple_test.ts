// deno test --allow-net=registry.npmjs.org supabase/functions/start-live/
// Builds a stand-in for Apple's certificate chain, signs transactions with it, and checks that only
// a correctly signed transaction for this app from the expected root gets through.

import * as x509 from 'npm:@peculiar/x509@1.14.3'
import { assertEquals, assertRejects } from 'jsr:@std/assert@1.0.13'
import { AppleCheckError, verifyAppleTransaction } from './apple.ts'
import { left, pickEntitlement, TRIAL_MINUTES } from './plans.ts'
import type { AppleTransaction } from './apple.ts'

x509.cryptoProvider.set(crypto)
const P384 = { name: 'ECDSA', namedCurve: 'P-384', hash: 'SHA-384' }
const P256 = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' }
const LEAF = '1.2.840.113635.100.6.11.1'
const INTER = '1.2.840.113635.100.6.2.1'
const marker = (oid: string) => new x509.Extension(oid, false, new Uint8Array([5, 0]))
const from = new Date('2020-01-01'), to = new Date('2040-01-01')

async function chain(opts: { leafMarker?: boolean; interMarker?: boolean } = {}) {
  const rootKeys = await crypto.subtle.generateKey(P384, true, ['sign', 'verify'])
  const root = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: '01', name: 'CN=Test Root', notBefore: from, notAfter: to, signingAlgorithm: P384, keys: rootKeys,
    extensions: [new x509.BasicConstraintsExtension(true, undefined, true)],
  })
  const interKeys = await crypto.subtle.generateKey(P384, true, ['sign', 'verify'])
  const inter = await x509.X509CertificateGenerator.create({
    serialNumber: '02', subject: 'CN=Test WWDR', issuer: root.subject, notBefore: from, notAfter: to,
    signingAlgorithm: P384, publicKey: interKeys.publicKey, signingKey: rootKeys.privateKey,
    extensions: [new x509.BasicConstraintsExtension(true, 0, true), ...(opts.interMarker === false ? [] : [marker(INTER)])],
  })
  const leafKeys = await crypto.subtle.generateKey(P256, true, ['sign', 'verify'])
  const leaf = await x509.X509CertificateGenerator.create({
    serialNumber: '03', subject: 'CN=Test App Store', issuer: inter.subject, notBefore: from, notAfter: to,
    signingAlgorithm: P384, publicKey: leafKeys.publicKey, signingKey: interKeys.privateKey,
    extensions: opts.leafMarker === false ? [] : [marker(LEAF)],
  })
  const rootSha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', root.rawData)), (b) => b.toString(16).padStart(2, '0')).join('')
  return { root, inter, leaf, leafKey: leafKeys.privateKey, rootSha }
}

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const der = (c: x509.X509Certificate) => btoa(String.fromCharCode(...new Uint8Array(c.rawData)))

async function sign(c: Awaited<ReturnType<typeof chain>>, payload: Record<string, unknown>, x5c?: string[]) {
  const head = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'ES256', x5c: x5c ?? [der(c.leaf), der(c.inter), der(c.root)] })))
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)))
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, c.leafKey, new TextEncoder().encode(`${head}.${body}`)))
  return `${head}.${body}.${b64url(sig)}`
}

const now = Date.now()
const TX = {
  transactionId: '2000000123', originalTransactionId: '2000000100', bundleId: 'io.dappily.translator',
  productId: 'hola_pro_monthly', purchaseDate: now - 86400000, expiresDate: now + 29 * 86400000, signedDate: now,
  type: 'Auto-Renewable Subscription', environment: 'Sandbox',
}
const BUNDLE = 'io.dappily.translator'

Deno.test('a transaction signed through the expected root passes', async () => {
  const c = await chain()
  const t = await verifyAppleTransaction(await sign(c, TX), { bundleId: BUNDLE, rootSha256: c.rootSha })
  assertEquals(t.productId, 'hola_pro_monthly')
  assertEquals(t.originalTransactionId, '2000000100')
})

Deno.test("a chain that doesn't end at Apple's root is rejected", async () => {
  const c = await chain()
  await assertRejects(async () => verifyAppleTransaction(await sign(c, TX), { bundleId: BUNDLE }), AppleCheckError, 'not signed by Apple')
})

Deno.test('a changed transaction is rejected', async () => {
  const c = await chain()
  const [h, , s] = (await sign(c, TX)).split('.')
  const forged = b64url(new TextEncoder().encode(JSON.stringify({ ...TX, productId: 'hola_max_monthly' })))
  await assertRejects(() => verifyAppleTransaction(`${h}.${forged}.${s}`, { bundleId: BUNDLE, rootSha256: c.rootSha }), AppleCheckError, 'signature')
})

Deno.test('a transaction for another app is rejected', async () => {
  const c = await chain()
  await assertRejects(async () => verifyAppleTransaction(await sign(c, { ...TX, bundleId: 'com.other.app' }), { bundleId: BUNDLE, rootSha256: c.rootSha }), AppleCheckError, 'another app')
})

Deno.test('certificates without the App Store markers are rejected', async () => {
  for (const o of [{ leafMarker: false }, { interMarker: false }]) {
    const c = await chain(o)
    await assertRejects(async () => verifyAppleTransaction(await sign(c, TX), { bundleId: BUNDLE, rootSha256: c.rootSha }), AppleCheckError, 'App Store certificate')
  }
})

Deno.test('an intermediate from another root is rejected', async () => {
  const c = await chain()
  const other = await chain()
  const jws = await sign(c, TX, [der(c.leaf), der(c.inter), der(other.root)])
  await assertRejects(() => verifyAppleTransaction(jws, { bundleId: BUNDLE, rootSha256: other.rootSha }), AppleCheckError, 'chain')
})

Deno.test('plans: the free week, expired and refunded subscriptions, the bigger of two', () => {
  const tx = TX as AppleTransaction
  assertEquals(pickEntitlement([tx], now)?.minutes, 100)
  assertEquals(pickEntitlement([{ ...tx, offerType: 1 }], now)?.minutes, TRIAL_MINUTES)
  assertEquals(pickEntitlement([{ ...tx, expiresDate: now - 1 }], now), null)
  assertEquals(pickEntitlement([{ ...tx, revocationDate: now - 5 }], now), null)
  assertEquals(pickEntitlement([{ ...tx, productId: 'not_ours' }], now), null)
  const both = pickEntitlement([{ ...tx, productId: 'hola_starter_monthly' }, { ...tx, productId: 'hola_heavy_monthly' }], now)
  assertEquals(both?.plan, 'Heavy')
  assertEquals(both?.userId, 'apple-2000000100')
  assertEquals(left(100, 61 * 60 + 30), { minutesLeft: 38, secondsLeft: 2310 })
  assertEquals(left(15, 20 * 60), { minutesLeft: 0, secondsLeft: 0 })
})
