import { canonicalJson, canonicalOrderItems } from '../utils/canonicalJson.js'

export const ORDER_REPLAY_WINDOW_MS = 24 * 60 * 60 * 1000
export const ORDER_IDEMPOTENCY_ACTION = 'create-order'

export function idempotencyError(code, message, status = 409) {
  return Object.assign(new Error(message), { code, status })
}

export function validateOrderIdempotencyKey(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw idempotencyError('INVALID_IDEMPOTENCY_KEY', 'Vui lòng gửi lại yêu cầu đặt hoa với mã yêu cầu hợp lệ.', 400)
  }
  return value.toLowerCase()
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function createOrderFingerprint(user, normalizedRequest, keyValue, fulfilmentKey) {
  const key = validateOrderIdempotencyKey(keyValue)
  const scope = user ? `user:${user.id}` : 'guest'
  const keyHash = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)))
  let secret
  try {
    secret = Uint8Array.from(atob(fulfilmentKey), (character) => character.charCodeAt(0))
  } catch { /* Fail closed without disclosing configuration. */ }
  if (secret?.length !== 32) {
    throw idempotencyError('FULFILMENT_ENCRYPTION_UNAVAILABLE', 'Dịch vụ bảo vệ thông tin giao hoa chưa sẵn sàng.', 503)
  }
  const hmacKey = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const items = canonicalOrderItems(normalizedRequest.items)
  // HMAC, rather than a plain PII digest, prevents offline guessing of contact
  // fields. This domain is separate from AES-GCM fulfilment encryption.
  const requestHash = hex(await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(
    `hanapipi-order-request-v1:${canonicalJson({ scope, request: { ...normalizedRequest, items } })}`,
  )))
  return { keyHash, requestHash, scope }
}
