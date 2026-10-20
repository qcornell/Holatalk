// Checks that an App Store transaction really came from Apple, for this app.
//
// StoreKit 2 gives the app each transaction as a JWS (a signed JSON token). Its header carries the
// certificate chain Apple signed it with: leaf -> Apple WWDR intermediate -> Apple Root CA - G3.
// We check every link of that chain, that the root is Apple's (by its published SHA-256
// fingerprint), the Apple-specific marker on the leaf and intermediate, and the signature itself.
// No Apple API key is needed for this.

import * as x509 from 'npm:@peculiar/x509@1.14.3'

/** Apple Root CA - G3, as listed at support.apple.com/121728 (expires Apr 30, 2039). */
export const APPLE_ROOT_G3_SHA256 = '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179'
const LEAF_MARKER = '1.2.840.113635.100.6.11.1' // on Apple's App Store receipt-signing certificates
const INTERMEDIATE_MARKER = '1.2.840.113635.100.6.2.1' // on Apple's WWDR intermediate

x509.cryptoProvider.set(crypto)

/** The fields of a StoreKit transaction we use (JWSTransactionDecodedPayload). */
export interface AppleTransaction {
  transactionId: string
  originalTransactionId: string
  bundleId: string
  productId: string
  purchaseDate: number // ms since 1970
  expiresDate?: number // subscriptions only
  signedDate: number
  type?: string // "Auto-Renewable Subscription", "Consumable", ...
  environment?: string // "Production" | "Sandbox" | "Xcode"
  offerType?: number // 1 = introductory offer (our free week)
  offerDiscountType?: string // "FREE_TRIAL", ...
  revocationDate?: number
  appAccountToken?: string
}

export class AppleCheckError extends Error {}

function b64url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

async function sha256hex(data: ArrayBuffer): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', data))
  return Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function verifyAppleTransaction(
  jws: string,
  opts: { bundleId: string; rootSha256?: string },
): Promise<AppleTransaction> {
  const parts = jws.split('.')
  if (parts.length !== 3) throw new AppleCheckError('not a signed transaction')
  let header: { alg?: string; x5c?: string[] }
  let payload: AppleTransaction
  try {
    header = JSON.parse(new TextDecoder().decode(b64url(parts[0])))
    payload = JSON.parse(new TextDecoder().decode(b64url(parts[1])))
  } catch {
    throw new AppleCheckError('unreadable transaction')
  }
  if (header.alg !== 'ES256' || !Array.isArray(header.x5c) || header.x5c.length !== 3) {
    throw new AppleCheckError('unexpected signature format')
  }
  const [leaf, intermediate, root] = header.x5c.map((c) => new x509.X509Certificate(c))

  // the chain ends at Apple's root
  if ((await sha256hex(root.rawData)) !== (opts.rootSha256 ?? APPLE_ROOT_G3_SHA256)) {
    throw new AppleCheckError('not signed by Apple')
  }
  if (!leaf.getExtension(LEAF_MARKER) || !intermediate.getExtension(INTERMEDIATE_MARKER)) {
    throw new AppleCheckError('not an App Store certificate')
  }
  // each certificate signed by the next one, and valid when Apple signed the transaction
  const at = new Date(typeof payload.signedDate === 'number' ? payload.signedDate : Date.now())
  const links: [x509.X509Certificate, x509.X509Certificate][] = [[leaf, intermediate], [intermediate, root], [root, root]]
  for (const [cert, issuer] of links) {
    const ok = await cert.verify({ publicKey: issuer.publicKey, date: at })
    if (!ok) throw new AppleCheckError('certificate chain does not check out')
  }
  // the transaction signed by the leaf
  const key = await crypto.subtle.importKey('spki', leaf.publicKey.rawData, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64url(parts[2]), signed)
  if (!ok) throw new AppleCheckError('signature does not match')

  if (payload.bundleId !== opts.bundleId) throw new AppleCheckError('transaction is for another app')
  if (!payload.originalTransactionId || !payload.productId) throw new AppleCheckError('transaction is missing fields')
  return payload
}
