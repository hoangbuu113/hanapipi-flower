import {
  createApiRouter,
  isApiPath,
  isApiV1Path,
  legacyInternalErrorResponse,
} from './server/api.js'
import {
  createRequestId,
  errorResponse,
  withApiHeaders,
  withBaselineSecurityHeaders,
} from './server/http.js'
import { logApiRequest } from './server/logger.js'
import { resolveAllowedOrigin } from './server/request.js'

const isNavigationRequest = (request, url) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false
  const accept = request.headers.get('accept') ?? ''
  const lastSegment = url.pathname.split('/').pop() ?? ''
  return accept.includes('text/html') || !lastSegment.includes('.')
}

async function serveStaticRequest(request, env) {
  const url = new URL(request.url)
  const response = await env.ASSETS.fetch(request)
  if (response.status !== 404 || !isNavigationRequest(request, url)) return response

  url.pathname = '/index.html'
  return env.ASSETS.fetch(new Request(url, request))
}

export function createWorker(options = {}) {
  const routeApiRequest = createApiRouter({
    clerkTokenVerifier: options.clerkTokenVerifier,
    conciergeHandler: options.conciergeHandler,
    databaseRepositoriesFactory: options.databaseRepositoriesFactory,
    identityVerifier: options.identityVerifier,
    rateLimitRequest: options.rateLimitRequest,
    telegramFetch: options.telegramFetch,
  })
  const logger = options.logger ?? console

  return {
    async fetch(request, env = {}, context) {
      const url = new URL(request.url)
      if (!isApiPath(url.pathname)) {
        try {
          return withBaselineSecurityHeaders(await serveStaticRequest(request, env), request)
        } catch {
          return withBaselineSecurityHeaders(new Response('Dịch vụ hiện chưa sẵn sàng.', {
            status: 500,
          }), request)
        }
      }

      const requestId = createRequestId()
      const startedAt = Date.now()
      let apiResult

      try {
        apiResult = await routeApiRequest(request, env, requestId, context)
      } catch {
        const versioned = isApiV1Path(url.pathname)
        apiResult = {
          allowedOrigin: resolveAllowedOrigin(request, env),
          errorCode: 'INTERNAL_ERROR',
          response: versioned
            ? errorResponse(
              500,
              'INTERNAL_ERROR',
              'Dịch vụ hiện chưa thể xử lý yêu cầu.',
              requestId,
            )
            : legacyInternalErrorResponse(),
          route: versioned ? '/api/v1/*' : '/api/*',
        }
      }

      const response = withApiHeaders(
        apiResult.response,
        request,
        requestId,
        apiResult.allowedOrigin,
      )
      logApiRequest({
        durationMs: Math.max(0, Date.now() - startedAt),
        errorCode: apiResult.errorCode,
        method: request.method,
        requestId,
        route: apiResult.route,
        status: response.status,
      }, logger)
      return response
    },
  }
}

export default createWorker()
