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
