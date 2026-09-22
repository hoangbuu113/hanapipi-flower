export const ALLOWED_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

export const MAX_MEDIA_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

const MIME_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const MEDIA_KEY_REGEX = /^[a-zA-Z0-9_-]+\.[a-z0-9]+$/

export function isValidMediaKey(key) {
  if (typeof key !== 'string' || !key || key.length > 120) return false
  return MEDIA_KEY_REGEX.test(key)
}

export function generateMediaKey(mimeType) {
  const ext = MIME_EXTENSIONS[mimeType] || 'jpg'
  const random = globalThis.crypto.randomUUID().replaceAll('-', '')
  return `prod_media_${random}.${ext}`
}

// In-memory bucket for explicit test injection only.
// Normal Worker runtime MUST NOT silently use volatile in-memory storage.
export class MemoryMediaBucket {
  constructor() {
    this.objects = new Map()
  }

  async put(key, value, options = {}) {
    let buffer
    if (value instanceof Uint8Array) {
      buffer = value
    } else if (value instanceof ArrayBuffer) {
      buffer = new Uint8Array(value)
    } else {
      buffer = new Uint8Array(await new Response(value).arrayBuffer())
    }

    this.objects.set(key, {
      body: buffer,
      httpMetadata: options.httpMetadata || {},
      size: buffer.byteLength,
    })
    return { key }
  }

  async get(key) {
    const obj = this.objects.get(key)
    if (!obj) return null
    return {
      body: obj.body,
      httpMetadata: obj.httpMetadata,
      size: obj.size,
    }
  }

  async delete(key) {
    this.objects.delete(key)
  }
}

function createStorageUnavailableError() {
  const err = new Error('Dịch vụ lưu trữ hình ảnh chưa được cấu hình.')
  err.code = 'MEDIA_STORAGE_UNAVAILABLE'
  err.status = 503
  return err
}

export function createMediaStorage(env = {}) {
  const bucket = env.MEDIA_BUCKET

  return {
    async put(key, body, contentType) {
      if (!bucket) {
        throw createStorageUnavailableError()
      }
      if (!isValidMediaKey(key)) {
        throw new TypeError('Invalid media storage key.')
      }
      return bucket.put(key, body, {
        httpMetadata: {
          contentType,
        },
      })
    },

    async get(key) {
      if (!bucket) {
        throw createStorageUnavailableError()
      }
      if (!isValidMediaKey(key)) return null
      return bucket.get(key)
    },

    async delete(key) {
      if (!bucket) {
        throw createStorageUnavailableError()
      }
      if (!isValidMediaKey(key)) return
      return bucket.delete(key)
    },
  }
}
