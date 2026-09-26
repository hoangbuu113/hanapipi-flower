const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on'])

export const RATE_LIMIT_POLICIES = Object.freeze({
  adminMutation: Object.freeze({
    binding: 'ADMIN_MUTATION_RATE_LIMITER',
    retryAfterSeconds: 60,
  }),
  concierge: Object.freeze({
    binding: 'CONCIERGE_RATE_LIMITER',
    retryAfterSeconds: 60,
  }),
  orderCreation: Object.freeze({
    binding: 'ORDER_RATE_LIMITER',
    retryAfterSeconds: 60,
  }),
})

function isRateLimitingEnabled(env, policy) {
  const enabled = (value) => ENABLED_VALUES.has(String(value ?? '').trim().toLowerCase())
  return enabled(env?.RATE_LIMITING_ENABLED)
    || (policy === 'concierge' && enabled(env?.CONCIERGE_RATE_LIMITING_ENABLED))
}

function decodeBase64Secret(value) {
  if (typeof value !== 'string' || !value.trim()) return null

  try {
    const decoded = globalThis.atob(value.trim())
    if (decoded.length !== 32) return null
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0))
  } catch {
    return null
  }
}

function toHex(bytes) {
  return [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

async function createOpaqueKey(secret, policyName, identity) {
  const secretBytes = decodeBase64Secret(secret)
  if (!secretBytes || typeof identity !== 'string' || !identity.trim()) return null

  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    secretBytes,
    { hash: 'SHA-256', name: 'HMAC' },
    false,
    ['sign'],
  )
  const payload = new TextEncoder().encode(`${policyName}:${identity.trim()}`)
  return toHex(await globalThis.crypto.subtle.sign('HMAC', key, payload))
}

function unavailable(policy) {
  return {
    allowed: false,
    code: 'RATE_LIMIT_UNAVAILABLE',
    retryAfterSeconds: policy.retryAfterSeconds,
    status: 503,
  }
}

/**
 * Enforces a Cloudflare Rate Limiting binding without retaining raw IPs,
 * provider subjects, user IDs, or bearer tokens in limiter keys.
 */
export async function enforceRateLimit({ env, identity, policy: policyName, request }) {
  if (!isRateLimitingEnabled(env, policyName)) {
    return { allowed: true, enabled: false }
  }

  const policy = RATE_LIMIT_POLICIES[policyName]
  if (!policy) return unavailable({ retryAfterSeconds: 60 })

  const limiter = env?.[policy.binding]
  if (!limiter || typeof limiter.limit !== 'function') return unavailable(policy)

  const resolvedIdentity = identity
    ?? request?.headers.get('CF-Connecting-IP')
  const opaqueKey = await createOpaqueKey(
    env?.RATE_LIMIT_KEY_SECRET,
    policyName,
    resolvedIdentity,
  ).catch(() => null)
  if (!opaqueKey) return unavailable(policy)

  try {
    const outcome = await limiter.limit({ key: opaqueKey })
    if (outcome?.success === true) {
      return { allowed: true, enabled: true }
    }
    if (outcome?.success === false) {
      return {
        allowed: false,
        code: 'RATE_LIMITED',
        retryAfterSeconds: policy.retryAfterSeconds,
        status: 429,
      }
    }
    return unavailable(policy)
  } catch {
    return unavailable(policy)
  }
}
