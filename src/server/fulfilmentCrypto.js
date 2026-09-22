const KEY_VERSION = 'aes-gcm-v1'

function decodeBase64(value) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function encodeBase64Url(value) {
  let binary = ''
  value.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

async function importKey(encodedKey) {
  if (typeof encodedKey !== 'string' || !encodedKey.trim()) {
    const error = new Error('Dịch vụ bảo vệ thông tin giao hoa chưa sẵn sàng.')
    error.code = 'FULFILMENT_ENCRYPTION_UNAVAILABLE'
    error.status = 503
    throw error
  }

  let rawKey
  try {
    rawKey = decodeBase64(encodedKey.trim())
  } catch {
    rawKey = null
  }
  if (rawKey?.byteLength !== 32) {
    const error = new Error('Dịch vụ bảo vệ thông tin giao hoa chưa sẵn sàng.')
    error.code = 'FULFILMENT_ENCRYPTION_UNAVAILABLE'
    error.status = 503
    throw error
  }

  return globalThis.crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt', 'encrypt'])
}

export async function encryptFulfilmentValue(value, encodedKey) {
  const key = await importKey(encodedKey)
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(value))
  const ciphertext = new Uint8Array(await globalThis.crypto.subtle.encrypt({ iv, name: 'AES-GCM' }, key, plaintext))
  return `${KEY_VERSION}.${encodeBase64Url(iv)}.${encodeBase64Url(ciphertext)}`
}

export async function decryptFulfilmentValue(value, encodedKey) {
  const [version, ivValue, ciphertextValue] = typeof value === 'string' ? value.split('.') : []
  if (version !== KEY_VERSION || !ivValue || !ciphertextValue) {
    throw new TypeError('Invalid encrypted fulfilment value.')
  }
  const key = await importKey(encodedKey)
  const plaintext = await globalThis.crypto.subtle.decrypt({
    iv: decodeBase64(ivValue),
    name: 'AES-GCM',
  }, key, decodeBase64(ciphertextValue))
  return JSON.parse(new TextDecoder().decode(plaintext))
}

export const FULFILMENT_KEY_VERSION = KEY_VERSION
