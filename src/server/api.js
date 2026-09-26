import { handleConciergeRequest } from './concierge.js'
import {
  createClerkIdentityVerifier,
  requireAdmin,
  requireAuthenticatedUser,
} from './auth.js'
import { createDatabaseRepositories } from './database.js'
import { createGuestOrderCookie, readGuestOrderCookie, GUEST_ACCESS_UNAVAILABLE_MESSAGE } from './guestOrderAccess.js'
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
import { enforceRateLimit } from './rateLimit.js'
import { routeConsultations } from './consultationApi.js'
import { MAX_PRODUCT_GALLERY_IMAGES, resolveMediaSrc } from '../utils/media.js'

import {
  createMediaStorage,
  generateMediaKey,
  isManagedMediaKey,
  isValidMediaKey,
  readValidatedImageUpload,
} from './mediaStorage.js'

export const API_VERSION = 'v1'
const API_V1_PREFIX = '/api/v1'
const LEGACY_CONCIERGE_PATH = '/api/concierge'
const V1_CONCIERGE_PATH = `${API_V1_PREFIX}/concierge`
const V1_HEALTH_PATH = `${API_V1_PREFIX}/health`
const V1_ME_PATH = `${API_V1_PREFIX}/me`
const V1_ADMIN_ME_PATH = `${API_V1_PREFIX}/admin/me`
const V1_ADMIN_PRODUCTS_PATH = `${API_V1_PREFIX}/admin/products`
const V1_ADMIN_GIFT_ADD_ONS_PATH = `${API_V1_PREFIX}/admin/gift-add-ons`
const V1_ADMIN_MEDIA_PATH = `${API_V1_PREFIX}/admin/media`
const V1_ADMIN_ORDERS_PATH = `${API_V1_PREFIX}/admin/orders`
const V1_MEDIA_PATH = `${API_V1_PREFIX}/media`
const V1_CATALOGUE_PATH = `${API_V1_PREFIX}/catalogue`
const V1_CATALOGUE_PRODUCTS_PATH = `${API_V1_PREFIX}/catalogue/products`
const V1_ORDERS_PATH = `${API_V1_PREFIX}/orders`
const V1_ADDRESSES_PATH = `${API_V1_PREFIX}/addresses`
const PREFLIGHT_HEADERS = ['authorization', 'content-type', 'idempotency-key', 'if-match', 'x-guest-order-token']

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

const RATE_LIMIT_MESSAGES = Object.freeze({
  addressMutation: 'Bạn đã thao tác địa chỉ quá nhanh. Vui lòng đợi một phút rồi thử lại.',
  adminMutation: 'Có quá nhiều thao tác quản trị. Vui lòng đợi một phút rồi thử lại.',
  concierge: 'Hut Flower đang nhận nhiều lời nhắn. Vui lòng đợi một phút rồi thử lại.',
  orderCreation: 'Bạn đã gửi quá nhiều yêu cầu đặt hoa. Vui lòng đợi một phút rồi thử lại; giỏ hàng vẫn được giữ nguyên.',
})

const RATE_LIMIT_UNAVAILABLE_MESSAGE =
  'Bảo vệ yêu cầu hiện tạm thời chưa sẵn sàng. Vui lòng thử lại sau.'

function rateLimitError(decision, requestId, route, policy, options = {}) {
  const message = decision.code === 'RATE_LIMITED'
    ? RATE_LIMIT_MESSAGES[policy]
    : RATE_LIMIT_UNAVAILABLE_MESSAGE
  const headers = {
    'Retry-After': String(decision.retryAfterSeconds ?? 60),
  }

  if (options.legacy) {
    return result(jsonResponse({ code: decision.code, message }, decision.status, headers), route, {
      errorCode: decision.code,
    })
  }

  return result(errorResponse(
    decision.status,
    decision.code,
    message,
    requestId,
    { headers },
  ), route, {
    allowedOrigin: options.allowedOrigin,
    errorCode: decision.code,
  })
}

async function limitAuthenticatedMutation(authUser, env, requestId, route, policy, dependencies) {
  const decision = await dependencies.rateLimitRequest({
    env,
    identity: authUser?.id,
    policy,
  })
  return decision.allowed ? null : rateLimitError(decision, requestId, route, policy)
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
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key, If-Match, X-Guest-Order-Token',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Max-Age': '600',
      Allow: 'POST, OPTIONS',
    },
    status: 204,
  }), V1_CONCIERGE_PATH, { allowedOrigin: origin.origin })
}

function publicUser(user) {
  return {
    displayName: user.displayName,
    id: user.id,
    locale: user.locale,
    role: user.role,
    status: user.status,
  }
}

async function handleCurrentUser(request, env, requestId, dependencies) {
  const auth = await dependencies.authenticateUser(request, env, dependencies)
  if (!auth.ok) {
    return result(errorResponse(
      auth.status,
      auth.code,
      auth.message,
      requestId,
    ), V1_ME_PATH, { errorCode: auth.code })
  }

  return result(successResponse({ user: publicUser(auth.user) }, requestId), V1_ME_PATH)
}

async function handleCreateOrder(request, env, requestId, dependencies) {
  const origin = validateMutationOrigin(request, env)
  if (!origin.ok) return originNotAllowed(requestId, V1_ORDERS_PATH)

  const hasBearer = request.headers.has('Authorization')
  const auth = hasBearer
    ? await dependencies.authenticateUser(request, env, dependencies)
    : null
  if (auth && !auth.ok) {
    return result(errorResponse(
      auth.status,
      auth.code,
      auth.message,
      requestId,
    ), V1_ORDERS_PATH, { errorCode: auth.code })
  }

  const decision = await dependencies.rateLimitRequest({
    env,
    identity: auth?.user?.id,
    policy: 'orderCreation',
    request,
  })
  if (!decision.allowed) return rateLimitError(decision, requestId, V1_ORDERS_PATH, 'orderCreation')

  let body = null
  try {
    body = await request.json()
  } catch {
    return result(errorResponse(
      400,
      'INVALID_PAYLOAD',
      'Dữ liệu yêu cầu không hợp lệ.',
      requestId,
    ), V1_ORDERS_PATH, { errorCode: 'INVALID_PAYLOAD' })
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return result(errorResponse(
      400,
      'INVALID_PAYLOAD',
      'Dữ liệu yêu cầu không hợp lệ.',
      requestId,
    ), V1_ORDERS_PATH, { errorCode: 'INVALID_PAYLOAD' })
  }

  const repositories = dependencies.createRepositories(env)

  try {
    const created = auth
      ? { order: await repositories.orders.createForUser(auth.user, body, request.headers.get('Idempotency-Key')) }
      : await repositories.orders.createForGuest(body, request.headers.get('Idempotency-Key'))
    return result(
      successResponse({ order: created.order }, requestId, {
        status: 201,
        headers: auth ? undefined : { 'Set-Cookie': createGuestOrderCookie(request, created.order, created.guestAccessToken) },
      }),
      V1_ORDERS_PATH,
    )
  } catch (err) {
    const status = err.status || 500
    const code = err.code || 'INTERNAL_ERROR'
    const message = err.message || 'Không thể tạo đơn hàng.'
    return result(errorResponse(
      status,
      code,
      message,
      requestId,
      err.fieldErrors ? { fieldErrors: err.fieldErrors } : undefined,
    ), V1_ORDERS_PATH, { errorCode: code })
  }
}

async function handleListUserOrders(request, env, requestId, dependencies) {
  const auth = await dependencies.authenticateUser(request, env, dependencies)
  if (!auth.ok) {
    return result(errorResponse(
      auth.status,
      auth.code,
      auth.message,
      requestId,
    ), V1_ORDERS_PATH, { errorCode: auth.code })
  }

  const repositories = dependencies.createRepositories(env)

  try {
    const orders = await repositories.orders.listForUser(auth.user)
    return result(
      successResponse({
        items: orders,
        orders,
        total: orders.length,
      }, requestId),
      V1_ORDERS_PATH,
    )
  } catch (err) {
    const status = err.status || 500
    const code = err.code || 'INTERNAL_ERROR'
    const message = err.message || 'Không thể tải danh sách đơn hàng.'
    return result(errorResponse(
      status,
      code,
      message,
      requestId,
    ), V1_ORDERS_PATH, { errorCode: code })
  }
}

async function handleGetUserOrder(idOrCode, request, env, requestId, dependencies) {
  const route = `${V1_ORDERS_PATH}/:id`
  const hasBearer = request.headers.has('Authorization')
  const auth = hasBearer
    ? await dependencies.authenticateUser(request, env, dependencies)
    : null
  if (auth && !auth.ok) {
    return result(errorResponse(
      auth.status,
      auth.code,
      auth.message,
      requestId,
    ), route, { errorCode: auth.code })
  }

  const guestToken = readGuestOrderCookie(request, idOrCode) || request.headers.get('X-Guest-Order-Token')
  if (!auth && !guestToken) {
    return result(errorResponse(401, 'AUTHENTICATION_REQUIRED', GUEST_ACCESS_UNAVAILABLE_MESSAGE, requestId), route, {
      errorCode: 'AUTHENTICATION_REQUIRED',
    })
  }

  const repositories = dependencies.createRepositories(env)

  try {
    const order = auth
      ? await repositories.orders.getForUser(auth.user, idOrCode)
      : await repositories.orders.getForGuest(idOrCode, guestToken)
    return result(
      successResponse({ order }, requestId, {
        headers: auth ? undefined : { 'Set-Cookie': createGuestOrderCookie(request, order, guestToken) },
      }),
      route,
    )
  } catch (err) {
    const status = err.status || 500
    const code = err.code || 'INTERNAL_ERROR'
    const message = err.message || 'Không thể tải thông tin đơn hàng.'
    return result(errorResponse(
      status,
      code,
      message,
      requestId,
    ), route, { errorCode: code })
  }
}

async function handleListUserAddresses(request, env, requestId, dependencies) {
  const auth = await dependencies.authenticateUser(request, env, dependencies)
  if (!auth.ok) {
    return result(errorResponse(
      auth.status,
      auth.code,
      auth.message,
      requestId,
    ), V1_ADDRESSES_PATH, { errorCode: auth.code })
  }

  const repositories = dependencies.createRepositories(env)

  try {
    const addresses = await repositories.addresses.listForUser(auth.user)
    return result(
      successResponse({
        addresses,
        items: addresses,
        total: addresses.length,
      }, requestId),
      V1_ADDRESSES_PATH,
    )
  } catch (err) {
    const status = err.status || 500
    const code = err.code || 'INTERNAL_ERROR'
    const message = err.message || 'Không thể tải danh sách địa chỉ.'
    return result(errorResponse(
      status,
      code,
      message,
      requestId,
    ), V1_ADDRESSES_PATH, { errorCode: code })
  }
}

async function handleGetUserAddress(id, request, env, requestId, dependencies) {
  const route = `${V1_ADDRESSES_PATH}/:id`
  const auth = await dependencies.authenticateUser(request, env, dependencies)
  if (!auth.ok) {
    return result(errorResponse(
      auth.status,
      auth.code,
      auth.message,
      requestId,
    ), route, { errorCode: auth.code })
  }

  const repositories = dependencies.createRepositories(env)

  try {
    const address = await repositories.addresses.getForUser(auth.user, id)
    return result(
      successResponse({ address }, requestId),
      route,
    )
  } catch (err) {
    const status = err.status || 500
    const code = err.code || 'INTERNAL_ERROR'
    const message = err.message || 'Không thể tải thông tin địa chỉ.'
    return result(errorResponse(
      status,
      code,
      message,
      requestId,
    ), route, { errorCode: code })
  }
}

async function handleCreateUserAddress(request, env, requestId, dependencies) {
  const auth = await dependencies.authenticateUser(request, env, dependencies)
  if (!auth.ok) {
    return result(errorResponse(
      auth.status,
      auth.code,
      auth.message,
      requestId,
    ), V1_ADDRESSES_PATH, { errorCode: auth.code })
  }

  const limited = await limitAuthenticatedMutation(auth.user, env, requestId, V1_ADDRESSES_PATH, 'addressMutation', dependencies)
  if (limited) return limited

  let body = null
  try {
    body = await request.json()
  } catch {
    return result(errorResponse(
      400,
      'INVALID_PAYLOAD',
      'Dữ liệu yêu cầu không hợp lệ.',
      requestId,
    ), V1_ADDRESSES_PATH, { errorCode: 'INVALID_PAYLOAD' })
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return result(errorResponse(
      400,
      'INVALID_PAYLOAD',
      'Dữ liệu yêu cầu không hợp lệ.',
      requestId,
    ), V1_ADDRESSES_PATH, { errorCode: 'INVALID_PAYLOAD' })
  }

  const repositories = dependencies.createRepositories(env)

  try {
    const created = await repositories.addresses.createForUser(auth.user, body)
    return result(
      successResponse({ address: created }, requestId, { status: 201 }),
      V1_ADDRESSES_PATH,
    )
  } catch (err) {
    const status = err.status || 500
    const code = err.code || 'INTERNAL_ERROR'
    const message = err.message || 'Không thể tạo địa chỉ mới.'
    return result(errorResponse(
      status,
      code,
      message,
      requestId,
      err.fieldErrors ? { fieldErrors: err.fieldErrors } : undefined,
    ), V1_ADDRESSES_PATH, { errorCode: code })
  }
}

async function handleUpdateUserAddress(id, request, env, requestId, dependencies) {
  const route = `${V1_ADDRESSES_PATH}/:id`
  const auth = await dependencies.authenticateUser(request, env, dependencies)
  if (!auth.ok) {
    return result(errorResponse(
      auth.status,
      auth.code,
      auth.message,
      requestId,
    ), route, { errorCode: auth.code })
  }

  const limited = await limitAuthenticatedMutation(auth.user, env, requestId, route, 'addressMutation', dependencies)
  if (limited) return limited

  let body = null
  try {
    body = await request.json()
  } catch {
    return result(errorResponse(
      400,
      'INVALID_PAYLOAD',
      'Dữ liệu yêu cầu không hợp lệ.',
      requestId,
    ), route, { errorCode: 'INVALID_PAYLOAD' })
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return result(errorResponse(
      400,
      'INVALID_PAYLOAD',
      'Dữ liệu yêu cầu không hợp lệ.',
      requestId,
    ), route, { errorCode: 'INVALID_PAYLOAD' })
  }

  const repositories = dependencies.createRepositories(env)

  try {
    const updated = await repositories.addresses.updateForUser(auth.user, id, body)
    return result(
      successResponse({ address: updated }, requestId),
      route,
    )
  } catch (err) {
    const status = err.status || 500
    const code = err.code || 'INTERNAL_ERROR'
    const message = err.message || 'Không thể cập nhật địa chỉ.'
    return result(errorResponse(
      status,
      code,
      message,
      requestId,
      err.fieldErrors ? { fieldErrors: err.fieldErrors } : undefined,
    ), route, { errorCode: code })
  }
}

async function handleDeleteUserAddress(id, request, env, requestId, dependencies) {
  const route = `${V1_ADDRESSES_PATH}/:id`
  const auth = await dependencies.authenticateUser(request, env, dependencies)
  if (!auth.ok) {
    return result(errorResponse(
      auth.status,
      auth.code,
      auth.message,
      requestId,
    ), route, { errorCode: auth.code })
  }

  const limited = await limitAuthenticatedMutation(auth.user, env, requestId, route, 'addressMutation', dependencies)
  if (limited) return limited

  const repositories = dependencies.createRepositories(env)

  try {
    const deleted = await repositories.addresses.deleteForUser(auth.user, id)
    return result(
      successResponse(deleted, requestId),
      route,
    )
  } catch (err) {
    const status = err.status || 500
    const code = err.code || 'INTERNAL_ERROR'
    const message = err.message || 'Không thể xóa địa chỉ.'
    return result(errorResponse(
      status,
      code,
      message,
      requestId,
    ), route, { errorCode: code })
  }
}

async function handleSetDefaultUserAddress(id, request, env, requestId, dependencies) {
  const route = `${V1_ADDRESSES_PATH}/:id/default`
  const auth = await dependencies.authenticateUser(request, env, dependencies)
  if (!auth.ok) {
    return result(errorResponse(
      auth.status,
      auth.code,
      auth.message,
      requestId,
    ), route, { errorCode: auth.code })
  }

  const limited = await limitAuthenticatedMutation(auth.user, env, requestId, route, 'addressMutation', dependencies)
  if (limited) return limited

  const repositories = dependencies.createRepositories(env)

  try {
    const updated = await repositories.addresses.setDefaultForUser(auth.user, id)
    return result(
      successResponse({ address: updated }, requestId),
      route,
    )
  } catch (err) {
    const status = err.status || 500
    const code = err.code || 'INTERNAL_ERROR'
    const message = err.message || 'Không thể đặt địa chỉ mặc định.'
    return result(errorResponse(
      status,
      code,
      message,
      requestId,
    ), route, { errorCode: code })
  }
}

async function handleListAdminOrders(request, env, requestId, dependencies) {
  const auth = await dependencies.authorizeAdmin(request, env, dependencies)
  if (!auth.ok) {
    return result(errorResponse(
      auth.status,
      auth.code,
      auth.message,
      requestId,
    ), V1_ADMIN_ORDERS_PATH, { errorCode: auth.code })
  }

  const repositories = dependencies.createRepositories(env)

  try {
    const orders = await repositories.orders.listForAdmin(auth.user)
    return result(
      successResponse({
        items: orders,
        orders,
        total: orders.length,
      }, requestId),
      V1_ADMIN_ORDERS_PATH,
    )
  } catch (err) {
    const status = err.status || 500
    const code = err.code || 'INTERNAL_ERROR'
    const message = err.message || 'Không thể tải danh sách đơn hàng.'
    return result(errorResponse(
      status,
      code,
      message,
      requestId,
    ), V1_ADMIN_ORDERS_PATH, { errorCode: code })
  }
}

async function handleDeleteAdminOrder(idOrCode, request, env, requestId, dependencies) {
  const route = `${V1_ADMIN_ORDERS_PATH}/:id`
  const auth = await dependencies.authorizeAdmin(request, env, dependencies)
  if (!auth.ok) {
    return result(errorResponse(auth.status, auth.code, auth.message, requestId), route, { errorCode: auth.code })
  }

  const rateLimited = await limitAuthenticatedMutation(
    auth.user, env, requestId, route, 'adminMutation', dependencies,
  )
  if (rateLimited) return rateLimited

  if (request.headers.has('Origin')) {
    const originValidation = validateMutationOrigin(request, env)
    if (!originValidation.ok) return originNotAllowed(requestId, route)
  }

  try {
    const repositories = dependencies.createRepositories(env)
    await repositories.orders.deleteForAdmin(auth.user, idOrCode)
    return result(successResponse({ deleted: true }, requestId), route)
  } catch (error) {
    const status = error.status || 500
    const code = error.code || 'INTERNAL_ERROR'
    const message = error.status && error.code ? error.message : 'Không thể xóa đơn hàng.'
    return result(errorResponse(status, code, message, requestId), route, { errorCode: code })
  }
}

async function handleGetAdminOrder(idOrCode, request, env, requestId, dependencies) {
  const route = `${V1_ADMIN_ORDERS_PATH}/:id`
  const auth = await dependencies.authorizeAdmin(request, env, dependencies)
  if (!auth.ok) {
    return result(errorResponse(
      auth.status,
      auth.code,
      auth.message,
      requestId,
    ), route, { errorCode: auth.code })
  }

  const repositories = dependencies.createRepositories(env)

  try {
    const order = await repositories.orders.getForAdmin(auth.user, idOrCode)
    return result(
      successResponse({ order }, requestId),
      route,
    )
  } catch (err) {
    const status = err.status || 500
    const code = err.code || 'INTERNAL_ERROR'
    const message = err.message || 'Không thể tải thông tin đơn hàng.'
    return result(errorResponse(
      status,
      code,
      message,
      requestId,
    ), route, { errorCode: code })
  }
}

async function handleConfirmAdminOrderPayment(idOrCode, request, env, requestId, dependencies) {
  const route = `${V1_ADMIN_ORDERS_PATH}/:id/confirm-payment`
  const auth = await dependencies.authorizeAdmin(request, env, dependencies)
  if (!auth.ok) {
    return result(errorResponse(
      auth.status,
      auth.code,
      auth.message,
      requestId,
    ), route, { errorCode: auth.code })
  }

  const rateLimited = await limitAuthenticatedMutation(
    auth.user, env, requestId, route, 'adminMutation', dependencies,
  )
  if (rateLimited) return rateLimited

  if (request.headers.has('Origin')) {
    const originValidation = validateMutationOrigin(request, env)
    if (!originValidation.ok) {
      return originNotAllowed(requestId, route)
    }
  }

  const repositories = dependencies.createRepositories(env)

  try {
    const order = await repositories.orders.confirmPayment(auth.user, idOrCode, { requestId })
    return result(
      successResponse({
        message: 'Đã xác nhận thanh toán thành công.',
        order,
      }, requestId),
      route,
    )
  } catch (err) {
    const status = err.status || 500
    const code = err.code || 'INTERNAL_ERROR'
    const message = err.message || 'Không thể xác nhận thanh toán.'
    return result(errorResponse(
      status,
      code,
      message,
      requestId,
    ), route, { errorCode: code })
  }
}

async function handleUpdateAdminOrderStatus(idOrCode, request, env, requestId, dependencies) {
  const route = `${V1_ADMIN_ORDERS_PATH}/:id/status`
  const auth = await dependencies.authorizeAdmin(request, env, dependencies)
  if (!auth.ok) {
    return result(errorResponse(
      auth.status,
      auth.code,
      auth.message,
      requestId,
    ), route, { errorCode: auth.code })
  }

  const rateLimited = await limitAuthenticatedMutation(
    auth.user, env, requestId, route, 'adminMutation', dependencies,
  )
  if (rateLimited) return rateLimited

  if (request.headers.has('Origin')) {
    const originValidation = validateMutationOrigin(request, env)
    if (!originValidation.ok) {
      return originNotAllowed(requestId, route)
    }
  }

  let body = null
  try {
    body = await request.json()
  } catch {
    return result(errorResponse(
      400,
      'INVALID_PAYLOAD',
      'Dữ liệu yêu cầu không hợp lệ.',
      requestId,
    ), route, { errorCode: 'INVALID_PAYLOAD' })
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return result(errorResponse(
      400,
      'INVALID_PAYLOAD',
      'Dữ liệu yêu cầu không hợp lệ.',
      requestId,
    ), route, { errorCode: 'INVALID_PAYLOAD' })
  }

  const status = body.status
  if (!status || typeof status !== 'string') {
    return result(errorResponse(
      400,
      'INVALID_STATUS',
      'Trạng thái đơn hoa không hợp lệ.',
      requestId,
    ), route, { errorCode: 'INVALID_STATUS' })
  }

  const repositories = dependencies.createRepositories(env)

  try {
    const order = await repositories.orders.updateStatus(auth.user, idOrCode, status, { requestId })
    return result(
      successResponse({
        message: 'Đã cập nhật trạng thái đơn hoa thành công.',
        order,
      }, requestId),
      route,
    )
  } catch (err) {
    const errStatus = err.status || 500
    const code = err.code || 'INTERNAL_ERROR'
    const message = err.message || 'Không thể cập nhật trạng thái đơn hoa.'
    return result(errorResponse(
      errStatus,
      code,
      message,
      requestId,
    ), route, { errorCode: code })
  }
}

async function handleAdminMe(request, env, requestId, dependencies) {
  const auth = await dependencies.authorizeAdmin(request, env, dependencies)
  if (!auth.ok) {
    return result(errorResponse(
      auth.status,
      auth.code,
      auth.message,
      requestId,
    ), V1_ADMIN_ME_PATH, { errorCode: auth.code })
  }

  return result(successResponse({
    authorized: true,
    user: {
      id: auth.user.id,
      role: auth.user.role,
      status: auth.user.status,
    },
  }, requestId), V1_ADMIN_ME_PATH)
}

async function handleListAdminProducts(request, env, requestId, dependencies) {
  const auth = await dependencies.authorizeAdmin(request, env, dependencies)
  if (!auth.ok) {
    return result(errorResponse(
      auth.status,
      auth.code,
      auth.message,
      requestId,
    ), V1_ADMIN_PRODUCTS_PATH, { errorCode: auth.code })
  }

  const url = new URL(request.url)
  const repositories = dependencies.createRepositories(env)
  const options = parseCatalogueListOptions(url)
  const [catalogueResult, version] = await Promise.all([
    repositories.catalogue.listProducts({ ...options, activeOnly: false, forAdmin: true }),
    repositories.catalogue.getCatalogueVersion(),
  ])

  return result(successResponse({
    items: catalogueResult.items,
    limit: catalogueResult.limit,
    offset: catalogueResult.offset,
    products: catalogueResult.items,
    total: catalogueResult.items.length,
    version: version?.version ?? null,
  }, requestId), V1_ADMIN_PRODUCTS_PATH)
}

async function handleUpdateAdminProduct(idOrSlug, request, env, requestId, dependencies) {
  const auth = await dependencies.authorizeAdmin(request, env, dependencies)
  if (!auth.ok) {
    return result(errorResponse(
      auth.status,
      auth.code,
      auth.message,
      requestId,
    ), `${V1_ADMIN_PRODUCTS_PATH}/:id`, { errorCode: auth.code })
  }

  const rateLimited = await limitAuthenticatedMutation(
    auth.user, env, requestId, `${V1_ADMIN_PRODUCTS_PATH}/:id`, 'adminMutation', dependencies,
  )
  if (rateLimited) return rateLimited

  let body = null
  try {
    body = await request.json()
  } catch {
    return result(errorResponse(
      400,
      'INVALID_PAYLOAD',
      'Dữ liệu yêu cầu không hợp lệ.',
      requestId,
    ), `${V1_ADMIN_PRODUCTS_PATH}/:id`, { errorCode: 'INVALID_PAYLOAD' })
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return result(errorResponse(
      400,
      'INVALID_PAYLOAD',
      'Dữ liệu yêu cầu không hợp lệ.',
      requestId,
    ), `${V1_ADMIN_PRODUCTS_PATH}/:id`, { errorCode: 'INVALID_PAYLOAD' })
  }

  // Whitelist supported fields
  const payload = {}
  if (body.name !== undefined) payload.name = body.name
  if (body.priceVnd !== undefined) payload.priceVnd = body.priceVnd
  if (body.status !== undefined) payload.status = body.status
  if (body.isPurchasable !== undefined) payload.isPurchasable = body.isPurchasable
  if (body.shortDescription !== undefined) payload.shortDescription = body.shortDescription
  if (body.description !== undefined) payload.description = body.description
  if (body.collection !== undefined) payload.collection = body.collection
  if (body.careNote !== undefined) payload.careNote = body.careNote
  if (body.deliveryNote !== undefined) payload.deliveryNote = body.deliveryNote
  if (body.internalNote !== undefined) payload.internalNote = body.internalNote
  if (body.composition !== undefined) payload.composition = body.composition
  if (body.flowerComposition !== undefined) payload.flowerComposition = body.flowerComposition
  if (body.occasions !== undefined) payload.occasions = body.occasions
  if (body.moods !== undefined) payload.moods = body.moods
  if (body.colors !== undefined) payload.colors = body.colors
  if (body.colorPalette !== undefined) payload.colorPalette = body.colorPalette
  if (body.imageUrl !== undefined) payload.imageUrl = body.imageUrl
  if (body.media !== undefined) payload.media = body.media

  const repositories = dependencies.createRepositories(env)
  if (payload.media !== undefined) {
    if (!Array.isArray(payload.media) || payload.media.length > MAX_PRODUCT_GALLERY_IMAGES) {
      return result(errorResponse(400, 'INVALID_MEDIA_GALLERY', `Tối đa ${MAX_PRODUCT_GALLERY_IMAGES} ảnh cho mỗi sản phẩm.`, requestId), `${V1_ADMIN_PRODUCTS_PATH}/:id`, { errorCode: 'INVALID_MEDIA_GALLERY' })
    }
    const currentProduct = await repositories.catalogue.getProductById(idOrSlug)
      ?? await repositories.catalogue.getProductBySlug(idOrSlug)
    if (!currentProduct) {
      return result(errorResponse(404, 'PRODUCT_NOT_FOUND', 'Không tìm thấy sản phẩm.', requestId), `${V1_ADMIN_PRODUCTS_PATH}/:id`, { errorCode: 'PRODUCT_NOT_FOUND' })
    }
    if (currentProduct.slug === 'no-watering-flower' || currentProduct.purchaseType === 'priceless') {
      return result(errorResponse(400, 'PROTECTED_PRODUCT', 'Không thể thay đổi ảnh của sản phẩm được bảo vệ.', requestId), `${V1_ADMIN_PRODUCTS_PATH}/:id`, { errorCode: 'PROTECTED_PRODUCT' })
    }
    const currentSources = new Set(currentProduct.media.flatMap((item) => [item.src, resolveMediaSrc(item.src)]))
    const mediaStorage = dependencies.createMediaStorage
      ? dependencies.createMediaStorage(env)
      : createMediaStorage(env)
    for (const item of payload.media) {
      if (currentSources.has(item?.src)) continue
      const mediaMatch = /^\/api\/v1\/media\/([^/?#]+)$/u.exec(item?.src ?? '')
      const mediaKey = mediaMatch?.[1]
      if (!mediaKey || !isManagedMediaKey(mediaKey)) {
        return result(errorResponse(400, 'INVALID_MEDIA_URL', 'Ảnh mới phải được tải lên kho ảnh quản trị.', requestId), `${V1_ADMIN_PRODUCTS_PATH}/:id`, { errorCode: 'INVALID_MEDIA_URL' })
      }
      try {
        if (await repositories.catalogue.isProductMediaReferenced(mediaKey)) {
          return result(errorResponse(409, 'MEDIA_IN_USE', 'Ảnh này đã được gắn với sản phẩm khác.', requestId), `${V1_ADMIN_PRODUCTS_PATH}/:id`, { errorCode: 'MEDIA_IN_USE' })
        }
        if (!await mediaStorage.get(mediaKey)) {
          return result(errorResponse(400, 'MEDIA_NOT_FOUND', 'Không tìm thấy ảnh đã tải lên.', requestId), `${V1_ADMIN_PRODUCTS_PATH}/:id`, { errorCode: 'MEDIA_NOT_FOUND' })
        }
      } catch (error) {
        const code = error.code || 'STORAGE_ERROR'
        return result(errorResponse(error.status || 500, code, error.message || 'Không thể kiểm tra kho ảnh.', requestId), `${V1_ADMIN_PRODUCTS_PATH}/:id`, { errorCode: code })
      }
    }
  }

  if (typeof payload.imageUrl === 'string' && payload.imageUrl.trim()) {
    const mediaMatch = /^\/api\/v1\/media\/([^/?#]+)$/u.exec(payload.imageUrl.trim())
    const mediaKey = mediaMatch?.[1]
    if (!mediaKey || !isManagedMediaKey(mediaKey)) {
      return result(errorResponse(
        400,
        'INVALID_MEDIA_URL',
        'Tệp ảnh phải là tệp đã tải lên kho ảnh quản trị.',
        requestId,
      ), `${V1_ADMIN_PRODUCTS_PATH}/:id`, { errorCode: 'INVALID_MEDIA_URL' })
    }

    const mediaStorage = dependencies.createMediaStorage
      ? dependencies.createMediaStorage(env)
      : createMediaStorage(env)
    try {
      const storedMedia = await mediaStorage.get(mediaKey)
      if (!storedMedia) {
        return result(errorResponse(
          400,
          'MEDIA_NOT_FOUND',
          'Không tìm thấy tệp ảnh trong kho ảnh quản trị.',
          requestId,
        ), `${V1_ADMIN_PRODUCTS_PATH}/:id`, { errorCode: 'MEDIA_NOT_FOUND' })
      }
    } catch (err) {
      const status = err.status || 500
      const code = err.code || 'STORAGE_ERROR'
      const message = err.message || 'Không thể kiểm tra tệp ảnh trong kho lưu trữ.'
      return result(errorResponse(status, code, message, requestId), `${V1_ADMIN_PRODUCTS_PATH}/:id`, { errorCode: code })
    }
  }

  try {
    const updated = await repositories.catalogue.updateProductCommerceFields(idOrSlug, payload)
    if (!updated) {
      return result(errorResponse(
        404,
        'PRODUCT_NOT_FOUND',
        'Không tìm thấy sản phẩm được yêu cầu.',
        requestId,
      ), `${V1_ADMIN_PRODUCTS_PATH}/:id`, { errorCode: 'PRODUCT_NOT_FOUND' })
    }

    return result(successResponse({ product: updated }, requestId), `${V1_ADMIN_PRODUCTS_PATH}/:id`)
  } catch (err) {
    const status = err.status || 500
    const code = err.code || 'INTERNAL_ERROR'
    const message = err.message || 'Không thể cập nhật thông tin sản phẩm.'
    return result(errorResponse(
      status,
      code,
      message,
      requestId,
    ), `${V1_ADMIN_PRODUCTS_PATH}/:id`, { errorCode: code })
  }
}

async function handleSetAdminProductArchived(idOrSlug, archived, request, env, requestId, dependencies) {
  const route = `${V1_ADMIN_PRODUCTS_PATH}/:id/${archived ? 'archive' : 'restore'}`
  const auth = await dependencies.authorizeAdmin(request, env, dependencies)
  if (!auth.ok) {
    return result(errorResponse(
      auth.status,
      auth.code,
      auth.message,
      requestId,
    ), route, { errorCode: auth.code })
  }

  const rateLimited = await limitAuthenticatedMutation(
    auth.user, env, requestId, route, 'adminMutation', dependencies,
  )
  if (rateLimited) return rateLimited

  const repositories = dependencies.createRepositories(env)
  try {
    const updated = await repositories.catalogue.setProductArchived(idOrSlug, archived)
    if (!updated) {
      return result(errorResponse(
        404,
        'PRODUCT_NOT_FOUND',
        'Không tìm thấy sản phẩm được yêu cầu.',
        requestId,
      ), route, { errorCode: 'PRODUCT_NOT_FOUND' })
    }

    return result(successResponse({ product: updated }, requestId), route)
  } catch (err) {
    const status = err.status || 500
    const code = err.code || 'INTERNAL_ERROR'
    const message = err.status && err.code
      ? err.message
      : 'Không thể thay đổi trạng thái lưu trữ của sản phẩm.'
    return result(errorResponse(status, code, message, requestId), route, { errorCode: code })
  }
}

async function handleDeleteAdminProduct(idOrSlug, request, env, requestId, dependencies) {
  const route = `${V1_ADMIN_PRODUCTS_PATH}/:id`
  const auth = await dependencies.authorizeAdmin(request, env, dependencies)
  if (!auth.ok) {
    return result(errorResponse(auth.status, auth.code, auth.message, requestId), route, { errorCode: auth.code })
  }

  const rateLimited = await limitAuthenticatedMutation(
    auth.user, env, requestId, route, 'adminMutation', dependencies,
  )
  if (rateLimited) return rateLimited

  if (request.headers.has('Origin')) {
    const originValidation = validateMutationOrigin(request, env)
    if (!originValidation.ok) return originNotAllowed(requestId, route)
  }

  const repositories = dependencies.createRepositories(env)
  let deletion
  try {
    deletion = await repositories.catalogue.deleteProduct(idOrSlug)
  } catch (error) {
    const status = error.status || 500
    const code = error.code || 'INTERNAL_ERROR'
    const message = error.status && error.code ? error.message : 'Không thể xóa sản phẩm.'
    return result(errorResponse(status, code, message, requestId), route, { errorCode: code })
  }

  let mediaCleanupComplete = true
  if (deletion.mediaKeys.length > 0) {
    const mediaStorage = dependencies.createMediaStorage
      ? dependencies.createMediaStorage(env)
      : createMediaStorage(env)
    for (const key of deletion.mediaKeys) {
      try {
        if (await repositories.catalogue.isProductMediaReferenced(key)) continue
        await mediaStorage.delete(key)
      } catch {
        mediaCleanupComplete = false
      }
    }
  }

  return result(
    successResponse({ deleted: true, mediaCleanupComplete }, requestId),
    route,
  )
}

async function handleCreateAdminProduct(request, env, requestId, dependencies) {
  const auth = await dependencies.authorizeAdmin(request, env, dependencies)
  if (!auth.ok) {
    return result(errorResponse(
      auth.status,
      auth.code,
      auth.message,
      requestId,
    ), V1_ADMIN_PRODUCTS_PATH, { errorCode: auth.code })
  }

  const rateLimited = await limitAuthenticatedMutation(
    auth.user, env, requestId, V1_ADMIN_PRODUCTS_PATH, 'adminMutation', dependencies,
  )
  if (rateLimited) return rateLimited

  let body = null
  try {
    body = await request.json()
  } catch {
    return result(errorResponse(
      400,
      'INVALID_PAYLOAD',
      'Dữ liệu yêu cầu không hợp lệ.',
      requestId,
    ), V1_ADMIN_PRODUCTS_PATH, { errorCode: 'INVALID_PAYLOAD' })
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return result(errorResponse(
      400,
      'INVALID_PAYLOAD',
      'Dữ liệu yêu cầu không hợp lệ.',
      requestId,
    ), V1_ADMIN_PRODUCTS_PATH, { errorCode: 'INVALID_PAYLOAD' })
  }

  // Name validation
  if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 160) {
    return result(errorResponse(
      400,
      'INVALID_NAME',
      'Tên sản phẩm không được để trống và tối đa 160 ký tự.',
      requestId,
    ), V1_ADMIN_PRODUCTS_PATH, { errorCode: 'INVALID_NAME' })
  }

  // Slug validation
  if (typeof body.slug !== 'string' || !body.slug.trim()) {
    return result(errorResponse(
      400,
      'INVALID_SLUG',
      'Slug sản phẩm không được để trống.',
      requestId,
    ), V1_ADMIN_PRODUCTS_PATH, { errorCode: 'INVALID_SLUG' })
  }

  const slug = body.slug.trim().toLowerCase()
  const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
  if (!SLUG_REGEX.test(slug) || slug.length > 100) {
    return result(errorResponse(
      400,
      'INVALID_SLUG',
      'Slug sản phẩm không hợp lệ (chỉ chứa chữ thường, số và dấu gạch ngang, tối đa 100 ký tự).',
      requestId,
    ), V1_ADMIN_PRODUCTS_PATH, { errorCode: 'INVALID_SLUG' })
  }

  // Enforce priceless/protected product invariants
  if (slug === 'no-watering-flower' || body.purchaseType === 'priceless') {
    return result(errorResponse(
      400,
      'PROTECTED_PRODUCT',
      'Không thể tạo sản phẩm vô giá hoặc trùng lặp sản phẩm được bảo vệ.',
      requestId,
    ), V1_ADMIN_PRODUCTS_PATH, { errorCode: 'PROTECTED_PRODUCT' })
  }

  // Price validation
  const price = body.priceVnd
  if (typeof price !== 'number' || !Number.isInteger(price) || price <= 0) {
    return result(errorResponse(
      400,
      'INVALID_PRICE',
      'Giá sản phẩm phải là số nguyên dương hợp lệ.',
      requestId,
    ), V1_ADMIN_PRODUCTS_PATH, { errorCode: 'INVALID_PRICE' })
  }

  // Status validation
  const allowedStatuses = ['available', 'seasonal', 'preorder']
  if (body.status !== undefined && (typeof body.status !== 'string' || !allowedStatuses.includes(body.status))) {
    return result(errorResponse(
      400,
      'INVALID_STATUS',
      'Trạng thái sản phẩm không hợp lệ (phải là có sẵn, theo mùa hoặc đặt trước).',
      requestId,
    ), V1_ADMIN_PRODUCTS_PATH, { errorCode: 'INVALID_STATUS' })
  }

  // Purchasability validation
  if (body.isPurchasable !== undefined && typeof body.isPurchasable !== 'boolean') {
    return result(errorResponse(
      400,
      'INVALID_PURCHASABILITY',
      'Khả năng mua phải là giá trị boolean.',
      requestId,
    ), V1_ADMIN_PRODUCTS_PATH, { errorCode: 'INVALID_PURCHASABILITY' })
  }

  // Whitelist payload
  const payload = {
    name: body.name.trim(),
    slug,
    priceVnd: price,
    status: body.status ?? 'available',
    isPurchasable: body.isPurchasable !== false,
  }

  if (typeof body.shortDescription === 'string') payload.shortDescription = body.shortDescription
  if (typeof body.description === 'string') payload.description = body.description
  if (typeof body.collection === 'string') payload.collection = body.collection
  if (typeof body.imageUrl === 'string') payload.imageUrl = body.imageUrl
  if (typeof body.careNote === 'string') payload.careNote = body.careNote
  if (typeof body.deliveryNote === 'string') payload.deliveryNote = body.deliveryNote
  if (typeof body.internalNote === 'string') payload.internalNote = body.internalNote
  if (Array.isArray(body.badges)) payload.badges = body.badges
  if (Array.isArray(body.colors)) payload.colors = body.colors
  if (Array.isArray(body.moods)) payload.moods = body.moods
  if (Array.isArray(body.occasions)) payload.occasions = body.occasions
  if (Array.isArray(body.composition)) payload.composition = body.composition

  const repositories = dependencies.createRepositories(env)

  try {
    const created = await repositories.catalogue.createProduct(payload)
    return result(
      successResponse({ product: created }, requestId, { status: 201 }),
      V1_ADMIN_PRODUCTS_PATH,
    )
  } catch (err) {
    const status = err.status || 500
    const code = err.code || 'INTERNAL_ERROR'
    const message = err.message || 'Không thể tạo sản phẩm mới.'
    return result(errorResponse(
      status,
      code,
      message,
      requestId,
    ), V1_ADMIN_PRODUCTS_PATH, { errorCode: code })
  }
}

async function handleGetAdminProductVariants(productId, request, env, requestId, dependencies) {
  const route = `${V1_ADMIN_PRODUCTS_PATH}/:id/variants`
  const auth = await dependencies.authorizeAdmin(request, env, dependencies)
  if (!auth.ok) {
    return result(errorResponse(auth.status, auth.code, auth.message, requestId), route, { errorCode: auth.code })
  }

  const repositories = dependencies.createRepositories(env)
  try {
    const variants = await repositories.catalogue.getProductVariants(productId, { activeOnly: false })
    return result(successResponse({ variants }, requestId), route)
  } catch (err) {
    const status = err.status || 500
    const code = err.code || 'INTERNAL_ERROR'
    const message = err.message || 'Không thể tải danh sách tùy chọn của sản phẩm.'
    return result(errorResponse(status, code, message, requestId), route, { errorCode: code })
  }
}

async function handleSaveAdminProductVariants(productId, request, env, requestId, dependencies) {
  const route = `${V1_ADMIN_PRODUCTS_PATH}/:id/variants`
  const auth = await dependencies.authorizeAdmin(request, env, dependencies)
  if (!auth.ok) {
    return result(errorResponse(auth.status, auth.code, auth.message, requestId), route, { errorCode: auth.code })
  }

  const rateLimited = await limitAuthenticatedMutation(
    auth.user, env, requestId, route, 'adminMutation', dependencies,
  )
  if (rateLimited) return rateLimited

  let body = null
  try {
    body = await request.json()
  } catch {
    return result(errorResponse(400, 'INVALID_PAYLOAD', 'Dữ liệu yêu cầu không hợp lệ.', requestId), route, { errorCode: 'INVALID_PAYLOAD' })
  }

  const variantsList = Array.isArray(body) ? body : (Array.isArray(body?.variants) ? body.variants : null)
  if (!variantsList) {
    return result(errorResponse(400, 'INVALID_PAYLOAD', 'Danh sách tùy chọn sản phẩm không hợp lệ.', requestId), route, { errorCode: 'INVALID_PAYLOAD' })
  }

  const repositories = dependencies.createRepositories(env)
  try {
    const variants = await repositories.catalogue.saveProductVariants(productId, variantsList)
    return result(successResponse({ variants }, requestId), route)
  } catch (err) {
    const status = err.status || 500
    const code = err.code || 'INTERNAL_ERROR'
    const message = err.message || 'Không thể lưu tùy chọn của sản phẩm.'
    return result(errorResponse(status, code, message, requestId), route, { errorCode: code })
  }
}

async function handleListAdminGiftAddOns(request, env, requestId, dependencies) {
  const auth = await dependencies.authorizeAdmin(request, env, dependencies)
  if (!auth.ok) {
    return result(errorResponse(auth.status, auth.code, auth.message, requestId), V1_ADMIN_GIFT_ADD_ONS_PATH, { errorCode: auth.code })
  }

  const repositories = dependencies.createRepositories(env)
  try {
    const items = await repositories.catalogue.listAdminGiftAddOns()
    return result(successResponse({ items, total: items.length }, requestId), V1_ADMIN_GIFT_ADD_ONS_PATH)
  } catch (err) {
    const status = err.status || 500
    const code = err.code || 'INTERNAL_ERROR'
    const message = err.message || 'Không thể tải danh sách quà tặng kèm.'
    return result(errorResponse(status, code, message, requestId), V1_ADMIN_GIFT_ADD_ONS_PATH, { errorCode: code })
  }
}

async function handleCreateAdminGiftAddOn(request, env, requestId, dependencies) {
  const auth = await dependencies.authorizeAdmin(request, env, dependencies)
  if (!auth.ok) {
    return result(errorResponse(auth.status, auth.code, auth.message, requestId), V1_ADMIN_GIFT_ADD_ONS_PATH, { errorCode: auth.code })
  }

  const rateLimited = await limitAuthenticatedMutation(
    auth.user, env, requestId, V1_ADMIN_GIFT_ADD_ONS_PATH, 'adminMutation', dependencies,
  )
  if (rateLimited) return rateLimited

  let body = null
  try {
    body = await request.json()
  } catch {
    return result(errorResponse(400, 'INVALID_PAYLOAD', 'Dữ liệu yêu cầu không hợp lệ.', requestId), V1_ADMIN_GIFT_ADD_ONS_PATH, { errorCode: 'INVALID_PAYLOAD' })
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return result(errorResponse(400, 'INVALID_PAYLOAD', 'Dữ liệu yêu cầu không hợp lệ.', requestId), V1_ADMIN_GIFT_ADD_ONS_PATH, { errorCode: 'INVALID_PAYLOAD' })
  }

  const repositories = dependencies.createRepositories(env)
  try {
    const item = await repositories.catalogue.createGiftAddOn(body)
    return result(successResponse({ item }, requestId, { status: 201 }), V1_ADMIN_GIFT_ADD_ONS_PATH)
  } catch (err) {
    const status = err.status || 500
    const code = err.code || 'INTERNAL_ERROR'
    const message = err.message || 'Không thể tạo món quà mới.'
    return result(errorResponse(status, code, message, requestId), V1_ADMIN_GIFT_ADD_ONS_PATH, { errorCode: code })
  }
}

async function handleUpdateAdminGiftAddOn(id, request, env, requestId, dependencies) {
  const route = `${V1_ADMIN_GIFT_ADD_ONS_PATH}/:id`
  const auth = await dependencies.authorizeAdmin(request, env, dependencies)
  if (!auth.ok) {
    return result(errorResponse(auth.status, auth.code, auth.message, requestId), route, { errorCode: auth.code })
  }

  const rateLimited = await limitAuthenticatedMutation(
    auth.user, env, requestId, route, 'adminMutation', dependencies,
  )
  if (rateLimited) return rateLimited

  let body = null
  try {
    body = await request.json()
  } catch {
    return result(errorResponse(400, 'INVALID_PAYLOAD', 'Dữ liệu yêu cầu không hợp lệ.', requestId), route, { errorCode: 'INVALID_PAYLOAD' })
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return result(errorResponse(400, 'INVALID_PAYLOAD', 'Dữ liệu yêu cầu không hợp lệ.', requestId), route, { errorCode: 'INVALID_PAYLOAD' })
  }

  const repositories = dependencies.createRepositories(env)
  try {
    const item = await repositories.catalogue.updateGiftAddOn(id, body)
    return result(successResponse({ item }, requestId), route)
  } catch (err) {
    const status = err.status || 500
    const code = err.code || 'INTERNAL_ERROR'
    const message = err.message || 'Không thể cập nhật thông tin món quà.'
    return result(errorResponse(status, code, message, requestId), route, { errorCode: code })
  }
}

async function handleToggleAdminGiftAddOn(id, request, env, requestId, dependencies) {
  const route = `${V1_ADMIN_GIFT_ADD_ONS_PATH}/:id/toggle-active`
  const auth = await dependencies.authorizeAdmin(request, env, dependencies)
  if (!auth.ok) {
    return result(errorResponse(auth.status, auth.code, auth.message, requestId), route, { errorCode: auth.code })
  }

  const rateLimited = await limitAuthenticatedMutation(
    auth.user, env, requestId, route, 'adminMutation', dependencies,
  )
  if (rateLimited) return rateLimited

  let active = null
  try {
    const body = await request.json()
    if (typeof body?.active === 'boolean') {
      active = body.active
    }
  } catch {
    // If no body provided, can toggle
  }

  const repositories = dependencies.createRepositories(env)
  try {
    if (active === null) {
      const all = await repositories.catalogue.listAdminGiftAddOns()
      const found = all.find((g) => g.id === id)
      if (!found) {
        return result(errorResponse(404, 'GIFT_ADD_ON_NOT_FOUND', 'Không tìm thấy món quà.', requestId), route, { errorCode: 'GIFT_ADD_ON_NOT_FOUND' })
      }
      active = !found.active
    }

    const item = await repositories.catalogue.setGiftAddOnActive(id, active)
    return result(successResponse({ item }, requestId), route)
  } catch (err) {
    const status = err.status || 500
    const code = err.code || 'INTERNAL_ERROR'
    const message = err.message || 'Không thể thay đổi trạng thái món quà.'
    return result(errorResponse(status, code, message, requestId), route, { errorCode: code })
  }
}

async function handleDeleteAdminGiftAddOn(id, request, env, requestId, dependencies) {
  const route = `${V1_ADMIN_GIFT_ADD_ONS_PATH}/:id`
  const auth = await dependencies.authorizeAdmin(request, env, dependencies)
  if (!auth.ok) {
    return result(errorResponse(auth.status, auth.code, auth.message, requestId), route, { errorCode: auth.code })
  }

  const rateLimited = await limitAuthenticatedMutation(
    auth.user, env, requestId, route, 'adminMutation', dependencies,
  )
  if (rateLimited) return rateLimited

  try {
    await dependencies.createRepositories(env).catalogue.deleteGiftAddOn(id)
    return result(successResponse({ deleted: true }, requestId), route)
  } catch (error) {
    const code = error.code || 'INTERNAL_ERROR'
    const message = error.status && error.code ? error.message : 'Không thể xóa món quà.'
    return result(errorResponse(error.status || 500, code, message, requestId), route, { errorCode: code })
  }
}

async function handleUploadAdminMedia(request, env, requestId, dependencies) {
  const auth = await dependencies.authorizeAdmin(request, env, dependencies)
  if (!auth.ok) {
    return result(errorResponse(
      auth.status,
      auth.code,
      auth.message,
      requestId,
    ), V1_ADMIN_MEDIA_PATH, { errorCode: auth.code })
  }

  const rateLimited = await limitAuthenticatedMutation(
    auth.user, env, requestId, V1_ADMIN_MEDIA_PATH, 'adminMutation', dependencies,
  )
  if (rateLimited) return rateLimited

  let upload
  try {
    upload = await readValidatedImageUpload(request)
  } catch (error) {
    return result(errorResponse(error.status || 400, error.code || 'INVALID_MEDIA_FILE',
      error.message || 'Tệp ảnh không hợp lệ.', requestId), V1_ADMIN_MEDIA_PATH, { errorCode: error.code || 'INVALID_MEDIA_FILE' })
  }
  const { bytes: buffer, contentType: mimeType } = upload

  const key = generateMediaKey(mimeType)
  const mediaStorage = dependencies.createMediaStorage ? dependencies.createMediaStorage(env) : createMediaStorage(env)

  try {
    await mediaStorage.put(key, buffer, mimeType)
  } catch (err) {
    const status = err.status || 500
    const code = err.code || 'STORAGE_ERROR'
    const message = err.message || 'Không thể lưu trữ tệp hình ảnh.'
    return result(errorResponse(
      status,
      code,
      message,
      requestId,
    ), V1_ADMIN_MEDIA_PATH, { errorCode: code })
  }

  return result(
    successResponse({
      contentType: mimeType,
      key,
      size: buffer.byteLength,
      url: `/api/v1/media/${key}`,
    }, requestId, { status: 201 }),
    V1_ADMIN_MEDIA_PATH,
  )
}

async function handleDeleteAdminMedia(key, request, env, requestId, dependencies) {
  const auth = await dependencies.authorizeAdmin(request, env, dependencies)
  if (!auth.ok) {
    return result(errorResponse(
      auth.status,
      auth.code,
      auth.message,
      requestId,
    ), `${V1_ADMIN_MEDIA_PATH}/${key}`, { errorCode: auth.code })
  }

  const rateLimited = await limitAuthenticatedMutation(
    auth.user, env, requestId, `${V1_ADMIN_MEDIA_PATH}/${key}`, 'adminMutation', dependencies,
  )
  if (rateLimited) return rateLimited

  if (!isValidMediaKey(key)) {
    return result(errorResponse(
      400,
      'INVALID_MEDIA_KEY',
      'Mã tệp hình ảnh không hợp lệ.',
      requestId,
    ), `${V1_ADMIN_MEDIA_PATH}/${key}`, { errorCode: 'INVALID_MEDIA_KEY' })
  }

  const repositories = dependencies.createRepositories(env)
  if (await repositories.catalogue.isProductMediaReferenced(key)) {
    return result(errorResponse(409, 'MEDIA_IN_USE', 'Ảnh vẫn đang được một sản phẩm sử dụng.', requestId), `${V1_ADMIN_MEDIA_PATH}/${key}`, { errorCode: 'MEDIA_IN_USE' })
  }

  const mediaStorage = dependencies.createMediaStorage ? dependencies.createMediaStorage(env) : createMediaStorage(env)
  try {
    await mediaStorage.delete(key)
  } catch (err) {
    const status = err.status || 500
    const code = err.code || 'STORAGE_ERROR'
    const message = err.message || 'Không thể xóa tệp hình ảnh khỏi lưu trữ.'
    return result(errorResponse(
      status,
      code,
      message,
      requestId,
    ), `${V1_ADMIN_MEDIA_PATH}/${key}`, { errorCode: code })
  }

  return result(
    successResponse({ deleted: true, key }, requestId),
    `${V1_ADMIN_MEDIA_PATH}/${key}`,
  )
}

async function handleGetPublicMedia(key, request, env, requestId, dependencies) {
  if (!isValidMediaKey(key)) {
    return result(errorResponse(
      404,
      'MEDIA_NOT_FOUND',
      'Không tìm thấy tệp hình ảnh.',
      requestId,
    ), `${V1_MEDIA_PATH}/${key}`, { errorCode: 'MEDIA_NOT_FOUND' })
  }

  const mediaStorage = dependencies.createMediaStorage ? dependencies.createMediaStorage(env) : createMediaStorage(env)
  let item = null
  try {
    item = await mediaStorage.get(key)
  } catch (err) {
    const status = err.status || 500
    const code = err.code || 'STORAGE_ERROR'
    const message = err.message || 'Không thể tải tệp hình ảnh.'
    return result(errorResponse(
      status,
      code,
      message,
      requestId,
    ), `${V1_MEDIA_PATH}/${key}`, { errorCode: code })
  }

  if (!item) {
    return result(errorResponse(
      404,
      'MEDIA_NOT_FOUND',
      'Không tìm thấy tệp hình ảnh.',
      requestId,
    ), `${V1_MEDIA_PATH}/${key}`, { errorCode: 'MEDIA_NOT_FOUND' })
  }

  const response = new Response(item.body, {
    headers: {
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Type': item.httpMetadata?.contentType || 'image/jpeg',
    },
  })

  return result(response, `${V1_MEDIA_PATH}/${key}`)
}

function matchAdminMediaKey(pathname) {
  if (pathname.startsWith(`${V1_ADMIN_MEDIA_PATH}/`)) {
    const key = pathname.slice(V1_ADMIN_MEDIA_PATH.length + 1).trim()
    if (key.length > 0 && !key.includes('/')) return decodeURIComponent(key)
  }
  return null
}

function matchPublicMediaKey(pathname) {
  if (pathname.startsWith(`${V1_MEDIA_PATH}/`)) {
    const key = pathname.slice(V1_MEDIA_PATH.length + 1).trim()
    if (key.length > 0 && !key.includes('/')) return decodeURIComponent(key)
  }
  return null
}

function matchAdminProductVariants(pathname) {
  if (!pathname.startsWith(`${V1_ADMIN_PRODUCTS_PATH}/`)) return null
  const remainder = pathname.slice(V1_ADMIN_PRODUCTS_PATH.length + 1).trim()
  const match = remainder.match(/^([^/]+)\/variants$/u)
  if (!match) return null
  return decodeURIComponent(match[1])
}

function matchAdminGiftAddOnId(pathname) {
  if (!pathname.startsWith(`${V1_ADMIN_GIFT_ADD_ONS_PATH}/`)) return null
  const remainder = pathname.slice(V1_ADMIN_GIFT_ADD_ONS_PATH.length + 1).trim()
  if (remainder.endsWith('/toggle-active')) {
    const id = remainder.slice(0, -'/toggle-active'.length).trim()
    if (id.length > 0 && !id.includes('/')) return { action: 'toggle-active', id: decodeURIComponent(id) }
  } else if (remainder.length > 0 && !remainder.includes('/')) {
    return { action: null, id: decodeURIComponent(remainder) }
  }
  return null
}

function matchAdminProductParam(pathname) {
  if (pathname.startsWith(`${V1_ADMIN_PRODUCTS_PATH}/`)) {
    const idOrSlug = pathname.slice(V1_ADMIN_PRODUCTS_PATH.length + 1).trim()
    if (idOrSlug.length > 0 && !idOrSlug.includes('/')) return decodeURIComponent(idOrSlug)
  }
  return null
}

function matchAdminProductAction(pathname) {
  if (!pathname.startsWith(`${V1_ADMIN_PRODUCTS_PATH}/`)) return null
  const remainder = pathname.slice(V1_ADMIN_PRODUCTS_PATH.length + 1).trim()
  const match = remainder.match(/^([^/]+)\/(archive|restore)$/u)
  if (!match) return null
  return {
    action: match[2],
    idOrSlug: decodeURIComponent(match[1]),
  }
}

function matchCatalogueSlug(pathname) {
  if (pathname.startsWith(`${V1_CATALOGUE_PRODUCTS_PATH}/`)) {
    const slug = pathname.slice(V1_CATALOGUE_PRODUCTS_PATH.length + 1).trim()
    if (slug.length > 0 && !slug.includes('/')) return decodeURIComponent(slug)
  }
  if (pathname.startsWith(`${V1_CATALOGUE_PATH}/`) && !pathname.startsWith(`${V1_CATALOGUE_PRODUCTS_PATH}/`)) {
    const slug = pathname.slice(V1_CATALOGUE_PATH.length + 1).trim()
    if (slug.length > 0 && !slug.includes('/') && slug !== 'products') return decodeURIComponent(slug)
  }
  return null
}

function matchOrderIdOrCode(pathname) {
  if (pathname.startsWith(`${V1_ORDERS_PATH}/`)) {
    const idOrCode = pathname.slice(V1_ORDERS_PATH.length + 1).trim()
    if (idOrCode.length > 0 && !idOrCode.includes('/')) return decodeURIComponent(idOrCode)
  }
  return null
}

function matchAddressId(pathname) {
  if (!pathname.startsWith(`${V1_ADDRESSES_PATH}/`)) return null
  const remainder = pathname.slice(V1_ADDRESSES_PATH.length + 1).trim()
  if (remainder.endsWith('/default')) {
    const id = remainder.slice(0, -'/default'.length).trim()
    if (id.length > 0 && !id.includes('/')) return { action: 'default', id: decodeURIComponent(id) }
  } else if (remainder.length > 0 && !remainder.includes('/')) {
    return { action: null, id: decodeURIComponent(remainder) }
  }
  return null
}

function matchAdminOrderId(pathname) {
  if (!pathname.startsWith(`${V1_ADMIN_ORDERS_PATH}/`)) return null
  const remainder = pathname.slice(V1_ADMIN_ORDERS_PATH.length + 1).trim()
  if (remainder.endsWith('/confirm-payment')) {
    const id = remainder.slice(0, -'/confirm-payment'.length).trim()
    if (id.length > 0 && !id.includes('/')) return { action: 'confirm-payment', idOrCode: decodeURIComponent(id) }
  } else if (remainder.endsWith('/status')) {
    const id = remainder.slice(0, -'/status'.length).trim()
    if (id.length > 0 && !id.includes('/')) return { action: 'status', idOrCode: decodeURIComponent(id) }
  } else if (remainder.length > 0 && !remainder.includes('/')) {
    return { action: null, idOrCode: decodeURIComponent(remainder) }
  }
  return null
}

function parseCatalogueListOptions(url) {
  const params = url.searchParams
  const options = {}

  const sort = params.get('sort')
  if (sort && ['catalogue', 'newest', 'price_asc', 'price_desc'].includes(sort)) {
    options.sort = sort
  }

  const purchaseType = params.get('purchaseType')
  if (purchaseType && ['all', 'standard', 'priceless'].includes(purchaseType)) {
    options.purchaseType = purchaseType
  } else if (params.get('purchasable') === 'true') {
    options.purchaseType = 'standard'
  }

  const limitParam = params.get('limit') ?? params.get('pageSize')
  if (limitParam != null) {
    const parsed = Number.parseInt(limitParam, 10)
    if (Number.isInteger(parsed) && parsed > 0) {
      options.limit = parsed
    }
  }

  const offsetParam = params.get('offset')
  if (offsetParam != null) {
    const parsed = Number.parseInt(offsetParam, 10)
    if (Number.isInteger(parsed) && parsed >= 0) {
      options.offset = parsed
    }
  }

  const maxPriceParam = params.get('maxPriceVnd') ?? params.get('budget') ?? params.get('maxPrice')
  if (maxPriceParam != null) {
    const parsed = Number.parseInt(maxPriceParam, 10)
    if (Number.isInteger(parsed) && parsed >= 0) {
      options.maxPriceVnd = parsed
    }
  }

  return options
}

async function handleListCatalogue(request, env, requestId, dependencies) {
  const url = new URL(request.url)
  const repositories = dependencies.createRepositories(env)
  const options = parseCatalogueListOptions(url)

  const [catalogueResult, version] = await Promise.all([
    repositories.catalogue.listProducts(options),
    repositories.catalogue.getCatalogueVersion(),
  ])

  return result(successResponse({
    items: catalogueResult.items,
    limit: catalogueResult.limit,
    offset: catalogueResult.offset,
    products: catalogueResult.items,
    total: catalogueResult.items.length,
    version: version?.version ?? null,
  }, requestId), url.pathname)
}

async function handleGetProduct(slug, request, env, requestId, dependencies) {
  const url = new URL(request.url)
  const repositories = dependencies.createRepositories(env)

  const product = await repositories.catalogue.getProductBySlug(slug)
    ?? await repositories.catalogue.getProductById(slug)

  if (!product || (!product.active && product.slug !== 'no-watering-flower')) {
    return result(errorResponse(
      404,
      'PRODUCT_NOT_FOUND',
      'Không tìm thấy sản phẩm được yêu cầu.',
      requestId,
    ), url.pathname, { errorCode: 'PRODUCT_NOT_FOUND' })
  }

  const [variants, relatedProducts, giftAddOns] = await Promise.all([
    repositories.catalogue.getProductVariants(product.id),
    repositories.catalogue.getRelatedProducts
      ? repositories.catalogue.getRelatedProducts(product.id)
      : [],
    repositories.catalogue.getGiftAddOns({ activeOnly: true }),
  ])

  return result(successResponse({
    giftAddOns,
    product: {
      ...product,
      giftAddOns,
      relatedProducts,
      variants,
    },
    relatedProducts,
    variants,
  }, requestId), url.pathname)
}

export function createApiRouter(options = {}) {
  const conciergeHandler = options.conciergeHandler ?? handleConciergeRequest
  const rateLimitRequest = options.rateLimitRequest ?? enforceRateLimit
  const verifyIdentity = options.identityVerifier ?? createClerkIdentityVerifier({
    verifyToken: options.clerkTokenVerifier,
  })
  const createRepositories = options.databaseRepositoriesFactory ?? createDatabaseRepositories
  const authenticateUser = options.authenticateUser
    ?? ((req, env, deps) => requireAuthenticatedUser(req, env, deps))
  const authorizeAdmin = options.requireAdmin
    ?? ((req, env, deps) => requireAdmin(req, env, deps))

  return async function routeApiRequest(request, env, requestId, context) {
    const { pathname } = new URL(request.url)

    if (pathname === LEGACY_CONCIERGE_PATH) {
      if (request.method === 'POST') {
        const decision = await rateLimitRequest({ env, policy: 'concierge', request })
        if (!decision.allowed) {
          return rateLimitError(
            decision, requestId, LEGACY_CONCIERGE_PATH, 'concierge', { legacy: true },
          )
        }
      }
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

    const consultation = await routeConsultations(request, env, requestId, {
      authorizeAdmin, createRepositories, rateLimitRequest, verifyIdentity,
      telegramFetch: options.telegramFetch,
    }, context)
    if (consultation) return consultation

    if (pathname === V1_ME_PATH) {
      if (request.method !== 'GET') return methodNotAllowed(requestId, V1_ME_PATH, 'GET')
      return handleCurrentUser(request, env, requestId, {
        authenticateUser,
        createRepositories,
        verifyIdentity,
      })
    }

    if (pathname === V1_ORDERS_PATH) {
      if (!['GET', 'POST'].includes(request.method)) {
        return methodNotAllowed(requestId, V1_ORDERS_PATH, 'GET, POST')
      }
      const orderDependencies = {
        authenticateUser,
        createRepositories,
        rateLimitRequest,
        verifyIdentity,
      }
      if (request.method === 'GET') {
        return handleListUserOrders(request, env, requestId, orderDependencies)
      }
      return handleCreateOrder(request, env, requestId, orderDependencies)
    }

    const orderIdOrCode = matchOrderIdOrCode(pathname)
    if (orderIdOrCode) {
      if (request.method !== 'GET') {
        return methodNotAllowed(requestId, `${V1_ORDERS_PATH}/:id`, 'GET')
      }
      return handleGetUserOrder(orderIdOrCode, request, env, requestId, {
        authenticateUser,
        createRepositories,
        verifyIdentity,
      })
    }

    if (pathname === V1_ADDRESSES_PATH) {
      if (!['GET', 'POST'].includes(request.method)) {
        return methodNotAllowed(requestId, V1_ADDRESSES_PATH, 'GET, POST')
      }
      const addressDependencies = {
        authenticateUser,
        createRepositories,
        rateLimitRequest,
        verifyIdentity,
      }
      if (request.method === 'GET') {
        return handleListUserAddresses(request, env, requestId, addressDependencies)
      }
      return handleCreateUserAddress(request, env, requestId, addressDependencies)
    }

    const addressMatch = matchAddressId(pathname)
    if (addressMatch) {
      const addressDependencies = {
        authenticateUser,
        createRepositories,
        rateLimitRequest,
        verifyIdentity,
      }
      if (addressMatch.action === 'default') {
        if (request.method !== 'POST') {
          return methodNotAllowed(requestId, `${V1_ADDRESSES_PATH}/:id/default`, 'POST')
        }
        return handleSetDefaultUserAddress(addressMatch.id, request, env, requestId, addressDependencies)
      }

      if (!['GET', 'PATCH', 'DELETE'].includes(request.method)) {
        return methodNotAllowed(requestId, `${V1_ADDRESSES_PATH}/:id`, 'GET, PATCH, DELETE')
      }
      if (request.method === 'GET') {
        return handleGetUserAddress(addressMatch.id, request, env, requestId, addressDependencies)
      }
      if (request.method === 'PATCH') {
        return handleUpdateUserAddress(addressMatch.id, request, env, requestId, addressDependencies)
      }
      return handleDeleteUserAddress(addressMatch.id, request, env, requestId, addressDependencies)
    }

    if (pathname === V1_ADMIN_ME_PATH) {
      if (request.method !== 'GET') return methodNotAllowed(requestId, V1_ADMIN_ME_PATH, 'GET')
      return handleAdminMe(request, env, requestId, {
        authorizeAdmin,
        createRepositories,
        verifyIdentity,
      })
    }

    if (pathname === V1_ADMIN_ORDERS_PATH) {
      if (request.method !== 'GET') return methodNotAllowed(requestId, V1_ADMIN_ORDERS_PATH, 'GET')
      const adminOrderDependencies = {
        authorizeAdmin,
        createRepositories,
        rateLimitRequest,
        verifyIdentity,
      }
      return handleListAdminOrders(request, env, requestId, adminOrderDependencies)
    }

    const adminOrderMatch = matchAdminOrderId(pathname)
    if (adminOrderMatch) {
      const adminOrderDependencies = {
        authorizeAdmin,
        createRepositories,
        rateLimitRequest,
        verifyIdentity,
      }
      if (adminOrderMatch.action === 'confirm-payment') {
        if (request.method !== 'POST') {
          return methodNotAllowed(requestId, `${V1_ADMIN_ORDERS_PATH}/:id/confirm-payment`, 'POST')
        }
        return handleConfirmAdminOrderPayment(adminOrderMatch.idOrCode, request, env, requestId, adminOrderDependencies)
      }
      if (adminOrderMatch.action === 'status') {
        if (request.method !== 'POST') {
          return methodNotAllowed(requestId, `${V1_ADMIN_ORDERS_PATH}/:id/status`, 'POST')
        }
        return handleUpdateAdminOrderStatus(adminOrderMatch.idOrCode, request, env, requestId, adminOrderDependencies)
      }
      if (request.method === 'DELETE') {
        return handleDeleteAdminOrder(adminOrderMatch.idOrCode, request, env, requestId, adminOrderDependencies)
      }
      if (request.method !== 'GET') {
        return methodNotAllowed(requestId, `${V1_ADMIN_ORDERS_PATH}/:id`, 'GET, DELETE')
      }
      return handleGetAdminOrder(adminOrderMatch.idOrCode, request, env, requestId, adminOrderDependencies)
    }

    if (pathname === V1_ADMIN_PRODUCTS_PATH) {
      if (!['GET', 'POST'].includes(request.method)) {
        return methodNotAllowed(requestId, V1_ADMIN_PRODUCTS_PATH, 'GET, POST')
      }
      const adminProductDependencies = {
        authorizeAdmin,
        createRepositories,
        rateLimitRequest,
        verifyIdentity,
      }
      if (request.method === 'GET') {
        return handleListAdminProducts(request, env, requestId, adminProductDependencies)
      }
      return handleCreateAdminProduct(request, env, requestId, adminProductDependencies)
    }

    if (pathname === V1_ADMIN_MEDIA_PATH) {
      if (request.method !== 'POST') {
        return methodNotAllowed(requestId, V1_ADMIN_MEDIA_PATH, 'POST')
      }
      return handleUploadAdminMedia(request, env, requestId, {
        authorizeAdmin,
        createMediaStorage: options.mediaStorageFactory ?? createMediaStorage,
        rateLimitRequest,
        verifyIdentity,
      })
    }

    const adminMediaKey = matchAdminMediaKey(pathname)
    if (adminMediaKey) {
      if (request.method !== 'DELETE') {
        return methodNotAllowed(requestId, pathname, 'DELETE')
      }
      return handleDeleteAdminMedia(adminMediaKey, request, env, requestId, {
        authorizeAdmin,
        createMediaStorage: options.mediaStorageFactory ?? createMediaStorage,
        createRepositories,
        rateLimitRequest,
        verifyIdentity,
      })
    }

    const publicMediaKey = matchPublicMediaKey(pathname)
    if (publicMediaKey) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return methodNotAllowed(requestId, pathname, 'GET, HEAD')
      }
      return handleGetPublicMedia(publicMediaKey, request, env, requestId, {
        createMediaStorage: options.mediaStorageFactory ?? createMediaStorage,
      })
    }

    const adminProductVariantsId = matchAdminProductVariants(pathname)
    if (adminProductVariantsId) {
      if (!['GET', 'PUT', 'POST'].includes(request.method)) {
        return methodNotAllowed(requestId, pathname, 'GET, PUT, POST')
      }
      const adminVariantDependencies = {
        authorizeAdmin,
        createRepositories,
        rateLimitRequest,
        verifyIdentity,
      }
      if (request.method === 'GET') {
        return handleGetAdminProductVariants(adminProductVariantsId, request, env, requestId, adminVariantDependencies)
      }
      return handleSaveAdminProductVariants(adminProductVariantsId, request, env, requestId, adminVariantDependencies)
    }

    if (pathname === V1_ADMIN_GIFT_ADD_ONS_PATH) {
      if (!['GET', 'POST'].includes(request.method)) {
        return methodNotAllowed(requestId, V1_ADMIN_GIFT_ADD_ONS_PATH, 'GET, POST')
      }
      const adminGiftDependencies = {
        authorizeAdmin,
        createRepositories,
        rateLimitRequest,
        verifyIdentity,
      }
      if (request.method === 'GET') {
        return handleListAdminGiftAddOns(request, env, requestId, adminGiftDependencies)
      }
      return handleCreateAdminGiftAddOn(request, env, requestId, adminGiftDependencies)
    }

    const adminGiftAddOn = matchAdminGiftAddOnId(pathname)
    if (adminGiftAddOn) {
      const adminGiftDependencies = {
        authorizeAdmin,
        createRepositories,
        rateLimitRequest,
        verifyIdentity,
      }
      if (adminGiftAddOn.action === 'toggle-active') {
        if (!['PATCH', 'POST'].includes(request.method)) {
          return methodNotAllowed(requestId, pathname, 'PATCH, POST')
        }
        return handleToggleAdminGiftAddOn(adminGiftAddOn.id, request, env, requestId, adminGiftDependencies)
      }
      if (request.method === 'DELETE') {
        return handleDeleteAdminGiftAddOn(adminGiftAddOn.id, request, env, requestId, adminGiftDependencies)
      }
      if (request.method !== 'PATCH') {
        return methodNotAllowed(requestId, pathname, 'PATCH, DELETE')
      }
      return handleUpdateAdminGiftAddOn(adminGiftAddOn.id, request, env, requestId, adminGiftDependencies)
    }

    const adminProductAction = matchAdminProductAction(pathname)
    if (adminProductAction) {
      if (request.method !== 'PATCH') return methodNotAllowed(requestId, pathname, 'PATCH')
      return handleSetAdminProductArchived(
        adminProductAction.idOrSlug,
        adminProductAction.action === 'archive',
        request,
        env,
        requestId,
        { authorizeAdmin, createRepositories, rateLimitRequest, verifyIdentity },
      )
    }

    const adminProductId = matchAdminProductParam(pathname)
    if (adminProductId) {
      if (request.method === 'DELETE') {
        return handleDeleteAdminProduct(adminProductId, request, env, requestId, {
          authorizeAdmin,
          createMediaStorage: options.mediaStorageFactory ?? createMediaStorage,
          createRepositories,
          rateLimitRequest,
          verifyIdentity,
        })
      }
      if (request.method !== 'PATCH') return methodNotAllowed(requestId, pathname, 'PATCH, DELETE')
      return handleUpdateAdminProduct(adminProductId, request, env, requestId, {
        authorizeAdmin,
        createRepositories,
        createMediaStorage: options.mediaStorageFactory ?? createMediaStorage,
        rateLimitRequest,
        verifyIdentity,
      })
    }

    if (pathname === V1_CATALOGUE_PATH || pathname === V1_CATALOGUE_PRODUCTS_PATH) {
      if (request.method !== 'GET') return methodNotAllowed(requestId, pathname, 'GET')
      return handleListCatalogue(request, env, requestId, { createRepositories })
    }

    const catalogueSlug = matchCatalogueSlug(pathname)
    if (catalogueSlug) {
      if (request.method !== 'GET') return methodNotAllowed(requestId, pathname, 'GET')
      return handleGetProduct(catalogueSlug, request, env, requestId, { createRepositories })
    }

    if (pathname === V1_CONCIERGE_PATH) {
      if (request.method === 'OPTIONS') return handlePreflight(request, env, requestId)
      if (request.method !== 'POST') {
        return methodNotAllowed(requestId, V1_CONCIERGE_PATH, 'POST, OPTIONS')
      }

      const origin = validateMutationOrigin(request, env)
      if (!origin.ok) return originNotAllowed(requestId, V1_CONCIERGE_PATH)

      const decision = await rateLimitRequest({ env, policy: 'concierge', request })
      if (!decision.allowed) {
        return rateLimitError(
          decision,
          requestId,
          V1_CONCIERGE_PATH,
          'concierge',
          { allowedOrigin: origin.origin },
        )
      }

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
