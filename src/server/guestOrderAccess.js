export const GUEST_ORDER_ACCESS_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000
export const GUEST_ACCESS_UNAVAILABLE_MESSAGE = 'Phiên xem đơn hàng này đã hết hạn hoặc không còn khả dụng.'

export function guestOrderAccessExpiresAt(createdAt) {
  return Date.parse(createdAt) + GUEST_ORDER_ACCESS_LIFETIME_MS
}

function cookieName(code, request) {
  if (!/^HF-\d{8}-[A-F0-9]{8}$/u.test(code)) return null
  return `${new URL(request.url).protocol === 'https:' ? '__Secure-' : ''}hf_guest_${code}`
}

export function readGuestOrderCookie(request, code) {
  const name = cookieName(code, request)
  if (!name) return null
  const matches = (request.headers.get('Cookie') ?? '').split(';')
    .map((entry) => entry.trim()).filter((entry) => entry.startsWith(`${name}=`))
  // Duplicate names are ambiguous: never guess which capability is intended.
  if (matches.length !== 1) return null
  const token = matches[0].slice(name.length + 1)
  return /^[A-Za-z0-9_-]{43}$/u.test(token) ? token : null
}

export function createGuestOrderCookie(request, order, token, now = Date.now()) {
  const code = order.code || order.orderCode
  const name = cookieName(code, request)
  const expiresAt = guestOrderAccessExpiresAt(order.createdAtUtc)
  const maxAge = Math.floor((expiresAt - now) / 1000)
  if (!name || !/^[A-Za-z0-9_-]{43}$/u.test(token) || !Number.isFinite(maxAge) || maxAge <= 0) {
    throw new Error('Guest order cookie cannot be issued.')
  }
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''
  return `${name}=${token}; Path=/api/v1/orders/${code}; Max-Age=${maxAge}; Expires=${new Date(expiresAt).toUTCString()}; HttpOnly; SameSite=Lax${secure}`
}

function encodeBase64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function hashGuestOrderToken(token) {
  return toHex(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))
}

export async function createGuestOrderAccess() {
  const token = encodeBase64Url(globalThis.crypto.getRandomValues(new Uint8Array(32)))
  return { hash: await hashGuestOrderToken(token), token }
}

export async function verifyGuestOrderToken(token, expectedHash) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(token)
    || typeof expectedHash !== 'string' || !/^[0-9a-f]{64}$/u.test(expectedHash)) return false
  const actualHash = await hashGuestOrderToken(token)
  let difference = 0
  for (let index = 0; index < 64; index += 1) {
    difference |= actualHash.charCodeAt(index) ^ expectedHash.charCodeAt(index)
  }
  return difference === 0
}
