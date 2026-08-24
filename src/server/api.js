import { handleConciergeRequest } from './concierge.js'
import {
  errorResponse,
  jsonResponse,
  successResponse,
  wrapVersionedResponse,
} from './http.js'
import {
  isApiV1Enabled,
  resolveAllowedOrigin,
  validateMutationOrigin,
} from './request.js'

export const API_VERSION = 'v1'
const API_V1_PREFIX = '/api/v1'
const LEGACY_CONCIERGE_PATH = '/api/concierge'
const V1_CONCIERGE_PATH = `${API_V1_PREFIX}/concierge`
const V1_HEALTH_PATH = `${API_V1_PREFIX}/health`
const PREFLIGHT_HEADERS = ['authorization', 'content-type', 'idempotency-key', 'if-match']

export const isApiPath = (pathname) => pathname === '/api' || pathname.startsWith('/api/')
export const isApiV1Path = (pathname) => pathname === API_V1_PREFIX
  || pathname.startsWith(`${API_V1_PREFIX}/`)

function result(response, route, options = {}) {
  return {
    allowedOrigin: options.allowedOrigin ?? null,
    errorCode: options.errorCode ?? (response.status >= 400 ? 'API_ERROR' : null),
    response,
    route,
  }
}

function methodNotAllowed(requestId, route, allow) {
  return result(errorResponse(
    405,
    'METHOD_NOT_ALLOWED',
    'Phương thức yêu cầu không được hỗ trợ.',
    requestId,
    { headers: { Allow: allow } },
  ), route, { errorCode: 'METHOD_NOT_ALLOWED' })
}

function originNotAllowed(requestId, route) {
  return result(errorResponse(
    403,
    'ORIGIN_NOT_ALLOWED',
    'Nguồn yêu cầu không được chấp nhận.',
    requestId,
  ), route, { errorCode: 'ORIGIN_NOT_ALLOWED' })
}

function parseRequestedHeaders(request) {
  const rawHeaders = request.headers.get('Access-Control-Request-Headers') ?? ''
  return rawHeaders
    .split(',')
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean)
}

function handlePreflight(request, env, requestId) {
  const origin = validateMutationOrigin(request, env)
  if (!origin.ok) return originNotAllowed(requestId, V1_CONCIERGE_PATH)

  const requestedMethod = request.headers.get('Access-Control-Request-Method')?.toUpperCase()
  if (requestedMethod && requestedMethod !== 'POST') {
    return methodNotAllowed(requestId, V1_CONCIERGE_PATH, 'POST, OPTIONS')
  }

  const requestedHeaders = parseRequestedHeaders(request)
  if (requestedHeaders.some((header) => !PREFLIGHT_HEADERS.includes(header))) {
    return result(errorResponse(
      403,
      'CORS_HEADERS_NOT_ALLOWED',
      'Header yêu cầu không được chấp nhận.',
      requestId,
    ), V1_CONCIERGE_PATH, {
      allowedOrigin: origin.origin,
      errorCode: 'CORS_HEADERS_NOT_ALLOWED',
    })
  }

  return result(new Response(null, {
    headers: {
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key, If-Match',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Max-Age': '600',
      Allow: 'POST, OPTIONS',
    },
    status: 204,
  }), V1_CONCIERGE_PATH, { allowedOrigin: origin.origin })
}

export function createApiRouter(options = {}) {
  const conciergeHandler = options.conciergeHandler ?? handleConciergeRequest

  return async function routeApiRequest(request, env, requestId) {
    const { pathname } = new URL(request.url)

    if (pathname === LEGACY_CONCIERGE_PATH) {
      const response = await conciergeHandler(request, env)
      return result(response, LEGACY_CONCIERGE_PATH, {
        allowedOrigin: resolveAllowedOrigin(request, env),
        errorCode: response.status >= 400 ? 'CONCIERGE_ERROR' : null,
      })
    }

    if (!isApiPath(pathname)) return null

    if (isApiV1Path(pathname) && !isApiV1Enabled(env)) {
      return result(errorResponse(
        404,
        'API_NOT_FOUND',
        'Không tìm thấy API được yêu cầu.',
        requestId,
      ), `${API_V1_PREFIX}/*`, { errorCode: 'API_NOT_FOUND' })
    }

    if (pathname === V1_HEALTH_PATH) {
      if (request.method !== 'GET') return methodNotAllowed(requestId, V1_HEALTH_PATH, 'GET')
      return result(successResponse({ status: 'ok', version: API_VERSION }, requestId), V1_HEALTH_PATH)
    }

    if (pathname === V1_CONCIERGE_PATH) {
      if (request.method === 'OPTIONS') return handlePreflight(request, env, requestId)
      if (request.method !== 'POST') {
        return methodNotAllowed(requestId, V1_CONCIERGE_PATH, 'POST, OPTIONS')
      }

      const origin = validateMutationOrigin(request, env)
      if (!origin.ok) return originNotAllowed(requestId, V1_CONCIERGE_PATH)

      const response = await conciergeHandler(request, env, { skipOriginCheck: true })
      const versionedResponse = await wrapVersionedResponse(response, requestId)
      return result(versionedResponse, V1_CONCIERGE_PATH, {
        allowedOrigin: origin.origin,
        errorCode: versionedResponse.status >= 400 ? 'CONCIERGE_ERROR' : null,
      })
    }

    return result(errorResponse(
      404,
      'API_NOT_FOUND',
      'Không tìm thấy API được yêu cầu.',
      requestId,
    ), '/api/*', { errorCode: 'API_NOT_FOUND' })
  }
}

export function legacyInternalErrorResponse() {
  return jsonResponse({
    code: 'INTERNAL_ERROR',
    message: 'Dịch vụ hiện chưa thể xử lý yêu cầu.',
  }, 500)
}
