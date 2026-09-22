import { handleConciergeRequest } from './concierge.js'
import {
  createClerkIdentityVerifier,
  requireAdmin,
  requireAuthenticatedUser,
} from './auth.js'
import { createDatabaseRepositories } from './database.js'
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

import {
  ALLOWED_MEDIA_TYPES,
  MAX_MEDIA_SIZE_BYTES,
  createMediaStorage,
  generateMediaKey,
  isValidMediaKey,
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
const V1_MEDIA_PATH = `${API_V1_PREFIX}/media`
const V1_CATALOGUE_PATH = `${API_V1_PREFIX}/catalogue`
const V1_CATALOGUE_PRODUCTS_PATH = `${API_V1_PREFIX}/catalogue/products`
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

  const repositories = dependencies.createRepositories(env)

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

  let mimeType = ''
  let buffer = null

  const contentTypeHeader = request.headers.get('content-type') || ''
  if (contentTypeHeader.includes('multipart/form-data')) {
    let formData
    try {
      formData = await request.formData()
    } catch {
      return result(errorResponse(
        400,
        'INVALID_MULTIPART_PAYLOAD',
        'Dữ liệu tải lên không hợp lệ.',
        requestId,
      ), V1_ADMIN_MEDIA_PATH, { errorCode: 'INVALID_MULTIPART_PAYLOAD' })
    }

    const file = formData.get('file') || formData.get('image')
    if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') {
      return result(errorResponse(
        400,
        'INVALID_PAYLOAD',
        'Vui lòng chọn tệp hình ảnh để tải lên.',
        requestId,
      ), V1_ADMIN_MEDIA_PATH, { errorCode: 'INVALID_PAYLOAD' })
    }

    mimeType = file.type?.toLowerCase() || ''
    buffer = new Uint8Array(await file.arrayBuffer())
  } else {
    mimeType = contentTypeHeader.split(';')[0]?.trim()?.toLowerCase() || ''
    buffer = new Uint8Array(await request.arrayBuffer())
  }

  if (!ALLOWED_MEDIA_TYPES.has(mimeType)) {
    return result(errorResponse(
      400,
      'INVALID_MEDIA_TYPE',
      'Định dạng tệp không được hỗ trợ. Vui lòng chọn ảnh JPG, PNG hoặc WebP.',
      requestId,
    ), V1_ADMIN_MEDIA_PATH, { errorCode: 'INVALID_MEDIA_TYPE' })
  }

  if (buffer.byteLength === 0) {
    return result(errorResponse(
      400,
      'EMPTY_FILE',
      'Tệp ảnh không được để trống.',
      requestId,
    ), V1_ADMIN_MEDIA_PATH, { errorCode: 'EMPTY_FILE' })
  }

  if (buffer.byteLength > MAX_MEDIA_SIZE_BYTES) {
    return result(errorResponse(
      400,
      'FILE_TOO_LARGE',
      'Dung lượng ảnh vượt quá giới hạn tối đa (10 MB).',
      requestId,
    ), V1_ADMIN_MEDIA_PATH, { errorCode: 'FILE_TOO_LARGE' })
  }

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

  if (!isValidMediaKey(key)) {
    return result(errorResponse(
      400,
      'INVALID_MEDIA_KEY',
      'Mã tệp hình ảnh không hợp lệ.',
      requestId,
    ), `${V1_ADMIN_MEDIA_PATH}/${key}`, { errorCode: 'INVALID_MEDIA_KEY' })
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

  if (!product || !product.active) {
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
  const verifyIdentity = options.identityVerifier ?? createClerkIdentityVerifier({
    verifyToken: options.clerkTokenVerifier,
  })
  const createRepositories = options.databaseRepositoriesFactory ?? createDatabaseRepositories
  const authenticateUser = options.authenticateUser
    ?? ((req, env, deps) => requireAuthenticatedUser(req, env, deps))
  const authorizeAdmin = options.requireAdmin
    ?? ((req, env, deps) => requireAdmin(req, env, deps))

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

    if (pathname === V1_ME_PATH) {
      if (request.method !== 'GET') return methodNotAllowed(requestId, V1_ME_PATH, 'GET')
      return handleCurrentUser(request, env, requestId, {
        authenticateUser,
        createRepositories,
        verifyIdentity,
      })
    }

    if (pathname === V1_ADMIN_ME_PATH) {
      if (request.method !== 'GET') return methodNotAllowed(requestId, V1_ADMIN_ME_PATH, 'GET')
      return handleAdminMe(request, env, requestId, {
        authorizeAdmin,
        createRepositories,
        verifyIdentity,
      })
    }

    if (pathname === V1_ADMIN_PRODUCTS_PATH) {
      if (!['GET', 'POST'].includes(request.method)) {
        return methodNotAllowed(requestId, V1_ADMIN_PRODUCTS_PATH, 'GET, POST')
      }
      const adminProductDependencies = {
        authorizeAdmin,
        createRepositories,
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
      const adminVariantDependencies = { authorizeAdmin, createRepositories, verifyIdentity }
      if (request.method === 'GET') {
        return handleGetAdminProductVariants(adminProductVariantsId, request, env, requestId, adminVariantDependencies)
      }
      return handleSaveAdminProductVariants(adminProductVariantsId, request, env, requestId, adminVariantDependencies)
    }

    if (pathname === V1_ADMIN_GIFT_ADD_ONS_PATH) {
      if (!['GET', 'POST'].includes(request.method)) {
        return methodNotAllowed(requestId, V1_ADMIN_GIFT_ADD_ONS_PATH, 'GET, POST')
      }
      const adminGiftDependencies = { authorizeAdmin, createRepositories, verifyIdentity }
      if (request.method === 'GET') {
        return handleListAdminGiftAddOns(request, env, requestId, adminGiftDependencies)
      }
      return handleCreateAdminGiftAddOn(request, env, requestId, adminGiftDependencies)
    }

    const adminGiftAddOn = matchAdminGiftAddOnId(pathname)
    if (adminGiftAddOn) {
      const adminGiftDependencies = { authorizeAdmin, createRepositories, verifyIdentity }
      if (adminGiftAddOn.action === 'toggle-active') {
        if (!['PATCH', 'POST'].includes(request.method)) {
          return methodNotAllowed(requestId, pathname, 'PATCH, POST')
        }
        return handleToggleAdminGiftAddOn(adminGiftAddOn.id, request, env, requestId, adminGiftDependencies)
      }
      if (request.method !== 'PATCH') {
        return methodNotAllowed(requestId, pathname, 'PATCH')
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
        { authorizeAdmin, createRepositories, verifyIdentity },
      )
    }

    const adminProductId = matchAdminProductParam(pathname)
    if (adminProductId) {
      if (request.method !== 'PATCH') return methodNotAllowed(requestId, pathname, 'PATCH')
      return handleUpdateAdminProduct(adminProductId, request, env, requestId, {
        authorizeAdmin,
        createRepositories,
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
