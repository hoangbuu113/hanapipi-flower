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

export const API_VERSION = 'v1'
const API_V1_PREFIX = '/api/v1'
const LEGACY_CONCIERGE_PATH = '/api/concierge'
const V1_CONCIERGE_PATH = `${API_V1_PREFIX}/concierge`
const V1_HEALTH_PATH = `${API_V1_PREFIX}/health`
const V1_ME_PATH = `${API_V1_PREFIX}/me`
const V1_ADMIN_ME_PATH = `${API_V1_PREFIX}/admin/me`
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

  const [variants, relatedProducts] = await Promise.all([
    repositories.catalogue.getProductVariants(product.id),
    repositories.catalogue.getRelatedProducts
      ? repositories.catalogue.getRelatedProducts(product.id)
      : [],
  ])

  return result(successResponse({
    product: {
      ...product,
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
