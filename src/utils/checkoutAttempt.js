import { canonicalJson, canonicalOrderItems } from './canonicalJson.js'

const memoryAttempts = new Map()
const prefix = 'hanapipi-flower:checkout-attempt:'
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

function sessionStorageIfAvailable() {
  try { return globalThis.sessionStorage } catch { return null }
}

export async function getCheckoutAttempt({ scope, order, storage = sessionStorageIfAvailable() }) {
  if (!scope) throw new Error('Checkout identity is not ready.')
  const logicalOrder = { ...order, items: canonicalOrderItems(order.items) }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(logicalOrder)))
  const fingerprint = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  let stored = memoryAttempts.get(scope)
  if (!stored) {
    try { stored = JSON.parse(storage.getItem(`${prefix}${scope}`)) } catch { /* Session storage is optional. */ }
  }
  if (stored?.fingerprint === fingerprint && uuidPattern.test(stored.key ?? '')) {
    memoryAttempts.set(scope, stored)
    return stored.key
  }
  const attempt = { fingerprint, key: crypto.randomUUID() }
  memoryAttempts.set(scope, attempt)
  try { storage.setItem(`${prefix}${scope}`, JSON.stringify(attempt)) } catch { /* Keep the same key in memory. */ }
  return attempt.key
}

export function clearCheckoutAttempt(scope, key, storage = sessionStorageIfAvailable()) {
  if (memoryAttempts.get(scope)?.key !== key) return
  memoryAttempts.delete(scope)
  try {
    if (JSON.parse(storage.getItem(`${prefix}${scope}`))?.key === key) storage.removeItem(`${prefix}${scope}`)
  } catch { /* No unrelated storage is cleared. */ }
}
