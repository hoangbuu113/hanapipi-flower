export const ALLOWED_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

export const MAX_MEDIA_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
// Multipart framing is not image data. Bound it too, without reducing the
// existing 10 MB file limit. The Admin client sends one small file form.
const MAX_MULTIPART_OVERHEAD_BYTES = 64 * 1024

function invalidUpload(code, message) {
  return Object.assign(new Error(message), { code, status: 400 })
}

function fileTooLarge() {
  return invalidUpload('FILE_TOO_LARGE', 'Dung lượng ảnh vượt quá giới hạn tối đa (10 MB).')
}

function hasBytes(bytes, offset, values) {
  return values.every((value, index) => bytes[offset + index] === value)
}

function hasTag(bytes, offset, tag) {
  return [...tag].every((value, index) => bytes[offset + index] === value.charCodeAt(0))
}

function isJpeg(bytes) {
  if (bytes.length < 12 || !hasBytes(bytes, 0, [0xff, 0xd8, 0xff])
    || !hasBytes(bytes, bytes.length - 2, [0xff, 0xd9])) return false
  let offset = 2
  let hasFrame = false
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  while (offset < bytes.length - 2) {
    if (bytes[offset++] !== 0xff) return false
    while (bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset++]
    if (marker === 0x01) continue // JPEG TEM standalone marker.
    if (marker < 0xc0 || marker > 0xfe || (marker >= 0xd0 && marker <= 0xd9)) return false
    if (offset + 2 > bytes.length - 2) return false
    const length = view.getUint16(offset)
    if (length < 2 || offset + length > bytes.length - 2) return false
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      if (length < 8 || !view.getUint16(offset + 3) || !view.getUint16(offset + 5)) return false
      hasFrame = true
    }
    if (marker === 0xda) return hasFrame && length >= 6 && offset + length < bytes.length - 2
    offset += length
  }
  return false
}

function isPng(bytes) {
  if (bytes.length < 57 || !hasBytes(bytes, 0, [137, 80, 78, 71, 13, 10, 26, 10])) return false
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let hasImageData = false
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = view.getUint32(offset)
    const end = offset + length + 12 // Length, type, data and CRC.
    if (end > bytes.length) return false
    if (offset === 8 && (length !== 13 || !hasTag(bytes, offset + 4, 'IHDR')
      || !view.getUint32(offset + 8) || !view.getUint32(offset + 12))) return false
    if (hasTag(bytes, offset + 4, 'IDAT') && length > 0) hasImageData = true
    if (hasTag(bytes, offset + 4, 'IEND')) return hasImageData && length === 0 && end === bytes.length
    offset = end
  }
  return false
}

function hasWebpFrame(bytes, start, end, allowAnimation) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let hasFrame = false
  let offset = start
  while (offset + 8 <= end) {
    const length = view.getUint32(offset + 4, true)
    const data = offset + 8
    const next = data + length + (length % 2)
    if (!length || next > end) return false
    if (hasTag(bytes, offset, 'VP8 ')) {
      if (length < 10 || !hasBytes(bytes, data + 3, [0x9d, 0x01, 0x2a])
        || !(view.getUint16(data + 6, true) & 0x3fff) || !(view.getUint16(data + 8, true) & 0x3fff)) return false
      hasFrame = true
    } else if (hasTag(bytes, offset, 'VP8L')) {
      if (length < 5 || bytes[data] !== 0x2f) return false
      hasFrame = true
    } else if (hasTag(bytes, offset, 'VP8X')) {
      if (!allowAnimation || length !== 10) return false
    } else if (hasTag(bytes, offset, 'ANMF')) {
      if (!allowAnimation || length < 24 || !hasWebpFrame(bytes, data + 16, data + length, false)) return false
      hasFrame = true
    }
    offset = next
  }
  return hasFrame && offset === end
}

// Signature/container validation, not a full pixel decoder or malware scanner.
// Reject header-only/truncated containers as well as a forged declared MIME.
export function detectImageType(bytes) {
  if (!(bytes instanceof Uint8Array)) return null
  if (isJpeg(bytes)) return 'image/jpeg'
  if (isPng(bytes)) return 'image/png'
  if (bytes.length >= 20 && hasTag(bytes, 0, 'RIFF') && hasTag(bytes, 8, 'WEBP')
    && new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true) === bytes.length - 8
    && hasWebpFrame(bytes, 12, bytes.length, true)) return 'image/webp'
  return null
}

async function readBoundedBody(request, limit) {
  const declaredLength = request.headers.get('content-length')
  if (/^\d+$/u.test(declaredLength ?? '') && Number(declaredLength) > limit) {
    request.body?.cancel().catch(() => {})
    throw fileTooLarge()
  }
  if (!request.body) return new Uint8Array()
  const reader = request.body.getReader()
  const chunks = []
  let length = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      length += chunk.value.byteLength
      if (length > limit) {
        reader.cancel().catch(() => {})
        throw fileTooLarge()
      }
      chunks.push(chunk.value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return bytes
}

export async function readValidatedImageUpload(request) {
  const contentType = request.headers.get('content-type') || ''
  const declaredType = contentType.split(';')[0].trim().toLowerCase()
  const multipart = declaredType === 'multipart/form-data'
  if (!multipart && !ALLOWED_MEDIA_TYPES.has(declaredType)) {
    throw invalidUpload('INVALID_MEDIA_TYPE', 'Định dạng tệp không được hỗ trợ. Vui lòng chọn ảnh JPG, PNG hoặc WebP.')
  }
  let bytes
  let mimeType = declaredType
  try {
    bytes = await readBoundedBody(request, MAX_MEDIA_SIZE_BYTES + (multipart ? MAX_MULTIPART_OVERHEAD_BYTES : 0))
    if (multipart) {
      let form
      try { form = await new Response(bytes, { headers: { 'Content-Type': contentType } }).formData() } catch {
        throw invalidUpload('INVALID_MULTIPART_PAYLOAD', 'Dữ liệu tải lên không hợp lệ.')
      }
      const file = form.get('file') || form.get('image')
      if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') {
        throw invalidUpload('INVALID_PAYLOAD', 'Vui lòng chọn tệp hình ảnh để tải lên.')
      }
      mimeType = file.type.toLowerCase()
      if (!ALLOWED_MEDIA_TYPES.has(mimeType)) {
        throw invalidUpload('INVALID_MEDIA_TYPE', 'Định dạng tệp không được hỗ trợ. Vui lòng chọn ảnh JPG, PNG hoặc WebP.')
      }
      if (file.size > MAX_MEDIA_SIZE_BYTES) throw fileTooLarge()
      bytes = new Uint8Array(await file.arrayBuffer())
    }
  } catch (error) {
    if (error.status === 400) throw error
    throw invalidUpload('INVALID_MEDIA_FILE', 'Tệp ảnh không hợp lệ. Vui lòng chọn ảnh JPG, PNG hoặc WebP khác.')
  }
  if (!bytes.byteLength) throw invalidUpload('EMPTY_FILE', 'Tệp ảnh không được để trống.')
  if (bytes.byteLength > MAX_MEDIA_SIZE_BYTES) throw fileTooLarge()
  const detectedType = detectImageType(bytes)
  if (!detectedType || detectedType !== mimeType) {
    throw invalidUpload('INVALID_MEDIA_FILE', 'Tệp ảnh không hợp lệ. Vui lòng chọn ảnh JPG, PNG hoặc WebP khác.')
  }
  return { bytes, contentType: detectedType }
}

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

export function isManagedMediaKey(key) {
  return /^prod_media_[A-Za-z0-9_-]+\.(?:jpg|png|webp)$/u.test(key)
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
