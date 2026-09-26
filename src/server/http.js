import { REPORT_ONLY_POLICY } from './csp.js'

const BASELINE_HEADERS = {
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
}

function appendVary(headers, value) {
  const current = headers.get('Vary')
  const values = new Set((current ? current.split(',') : []).map((item) => item.trim()).filter(Boolean))
  values.add(value)
  headers.set('Vary', [...values].join(', '))
}

function isProductionHttps(request) {
  const url = new URL(request.url)
  return url.protocol === 'https:'
    && url.hostname !== 'localhost'
    && url.hostname !== '127.0.0.1'
    && url.hostname !== '[::1]'
}

export function createRequestId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }

  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function jsonResponse(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
  })
}

export function successResponse(data, requestId, options = {}) {
  return jsonResponse({
    data,
    meta: {
      requestId,
      ...(options.meta ?? {}),
    },
  }, options.status ?? 200, options.headers)
}

export function errorResponse(status, code, message, requestId, options = {}) {
  return jsonResponse({
    error: {
      code,
      message,
      requestId,
      ...(options.fieldErrors ? { fieldErrors: options.fieldErrors } : {}),
    },
  }, status, options.headers)
}

export async function wrapVersionedResponse(response, requestId) {
  let payload
  try {
    payload = await response.json()
  } catch {
    return errorResponse(
      502,
      'INVALID_UPSTREAM_RESPONSE',
      'Dịch vụ hiện trả về dữ liệu không hợp lệ.',
      requestId,
    )
  }

  const headers = {}
  const allow = response.headers.get('Allow')
  const retryAfter = response.headers.get('Retry-After')
  if (allow) headers.Allow = allow
  if (retryAfter) headers['Retry-After'] = retryAfter
  const forwardedHeaders = Object.keys(headers).length > 0 ? headers : undefined
  if (response.ok) {
    return successResponse(payload, requestId, { headers: forwardedHeaders, status: response.status })
  }

  return errorResponse(
    response.status,
    typeof payload?.code === 'string' ? payload.code : 'API_ERROR',
    typeof payload?.message === 'string' ? payload.message : 'Yêu cầu chưa thể được xử lý.',
    requestId,
    { headers: forwardedHeaders },
  )
}

export function withBaselineSecurityHeaders(response, request) {
  const headers = new Headers(response.headers)
  Object.entries(BASELINE_HEADERS).forEach(([name, value]) => headers.set(name, value))
  // A document policy belongs on pages, not image/video binaries or API JSON.
  const contentType = headers.get('Content-Type') ?? ''
  if (/^(?:text\/(?:html|css|javascript)|application\/javascript)(?:;|$)/iu.test(contentType)) {
    headers.set('Content-Security-Policy-Report-Only', REPORT_ONLY_POLICY)
  }
  if (isProductionHttps(request)) {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
}

export function withApiHeaders(response, request, requestId, allowedOrigin = null) {
  const headers = new Headers(response.headers)
  if (!headers.has('Cache-Control')) {
    headers.set('Cache-Control', 'no-store')
  }
  headers.set('X-Request-ID', requestId)
  headers.set('Access-Control-Expose-Headers', 'X-Request-ID')
  if (allowedOrigin) {
    headers.set('Access-Control-Allow-Origin', allowedOrigin)
    appendVary(headers, 'Origin')
  }

  return withBaselineSecurityHeaders(new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  }), request)
}
