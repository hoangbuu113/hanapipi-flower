export const DEFAULT_MAX_JSON_BYTES = 32 * 1024

const parseBoolean = (value) => value === true
  || (typeof value === 'string' && ['1', 'true'].includes(value.trim().toLowerCase()))

export function isApiV1Enabled(env) {
  return parseBoolean(env?.API_V1_ENABLED)
}

function normalizeOrigin(value) {
  if (typeof value !== 'string' || value === '*' || value.length > 2048) return null

  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    return url.origin
  } catch {
    return null
  }
}

export function getAllowedOrigins(env) {
  const configured = typeof env?.API_ALLOWED_ORIGINS === 'string'
    ? env.API_ALLOWED_ORIGINS.split(',')
    : []

  return new Set(
    configured
      .map((origin) => normalizeOrigin(origin.trim()))
      .filter(Boolean),
  )
}

export function resolveAllowedOrigin(request, env) {
  const origin = normalizeOrigin(request.headers.get('Origin'))
  if (!origin) return null

  const requestOrigin = new URL(request.url).origin
  if (origin === requestOrigin) return origin
  return getAllowedOrigins(env).has(origin) ? origin : null
}

export function validateMutationOrigin(request, env) {
  const origin = request.headers.get('Origin')
  if (!origin) {
    return { ok: false, origin: null }
  }

  const allowedOrigin = resolveAllowedOrigin(request, env)
  return { ok: Boolean(allowedOrigin), origin: allowedOrigin }
}

function hasBoundedStructure(value, options) {
  const stack = [{ depth: 0, value }]
  let visitedNodes = 0

  while (stack.length > 0) {
    const current = stack.pop()
    visitedNodes += 1
    if (visitedNodes > options.maxNodes || current.depth > options.maxDepth) return false

    if (typeof current.value === 'string') {
      if (current.value.length > options.maxStringLength) return false
      continue
    }

    if (!current.value || typeof current.value !== 'object') continue

    if (Array.isArray(current.value)) {
      if (current.value.length > options.maxArrayLength) return false
      current.value.forEach((item) => stack.push({ depth: current.depth + 1, value: item }))
      continue
    }

    const entries = Object.entries(current.value)
    if (entries.length > options.maxObjectKeys) return false
    entries.forEach(([, item]) => stack.push({ depth: current.depth + 1, value: item }))
  }

  return true
}

export async function readJsonBody(request, options = {}) {
  const limits = {
    maxArrayLength: options.maxArrayLength ?? 16,
    maxBytes: options.maxBytes ?? DEFAULT_MAX_JSON_BYTES,
    maxDepth: options.maxDepth ?? 6,
    maxNodes: options.maxNodes ?? 1024,
    maxObjectKeys: options.maxObjectKeys ?? 32,
    maxStringLength: options.maxStringLength ?? 1000,
  }
  const contentType = request.headers.get('Content-Type') ?? ''
  if (!/^application\/json(?:\s*;|$)/iu.test(contentType.trim())) {
    return {
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'Yêu cầu phải dùng định dạng JSON.',
      ok: false,
      status: 415,
    }
  }

  const contentLength = request.headers.get('Content-Length')
  const declaredLength = contentLength == null ? null : Number(contentLength)
  if (Number.isFinite(declaredLength) && declaredLength > limits.maxBytes) {
    return {
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Nội dung yêu cầu vượt quá giới hạn.',
      ok: false,
      status: 413,
    }
  }

  let rawBody
  try {
    rawBody = await request.text()
  } catch {
    return {
      code: 'INVALID_REQUEST',
      message: 'Không thể đọc nội dung yêu cầu.',
      ok: false,
      status: 400,
    }
  }

  if (new TextEncoder().encode(rawBody).byteLength > limits.maxBytes) {
    return {
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Nội dung yêu cầu vượt quá giới hạn.',
      ok: false,
      status: 413,
    }
  }

  let value
  try {
    value = JSON.parse(rawBody)
  } catch {
    return {
      code: 'INVALID_REQUEST',
      message: 'Nội dung JSON không hợp lệ.',
      ok: false,
      status: 400,
    }
  }

  if (!hasBoundedStructure(value, limits)) {
    return {
      code: 'INVALID_REQUEST',
      message: 'Cấu trúc yêu cầu không hợp lệ.',
      ok: false,
      status: 400,
    }
  }

  return { ok: true, value }
}
