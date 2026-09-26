import { errorResponse, successResponse } from './http.js'
import { validateMutationOrigin } from './request.js'
import { consultationError, publicConsultation } from './repositories/consultationRepository.js'
import { notifyConsultation } from './telegramConsultations.js'

const PUBLIC_PATH = '/api/v1/consultations'
const ADMIN_PATH = '/api/v1/admin/consultations'
const MAX_BODY_BYTES = 16384
async function readPayload(request) {
  if (!/^application\/json(?:;|$)/iu.test(request.headers.get('Content-Type') ?? '')) throw consultationError(415, 'INVALID_CONTENT_TYPE', 'Vui lòng gửi thông tin ở định dạng phù hợp.')
  if (Number(request.headers.get('Content-Length')) > MAX_BODY_BYTES) throw consultationError(413, 'PAYLOAD_TOO_LARGE', 'Thông tin lựa chọn quá dài.')
  const reader = request.body?.getReader()
  if (!reader) throw consultationError(400, 'INVALID_CONSULTATION', 'Chưa có thông tin lựa chọn.')
  const chunks = []
  let length = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_BODY_BYTES) {
        await reader.cancel()
        throw consultationError(413, 'PAYLOAD_TOO_LARGE', 'Thông tin lựa chọn quá dài.')
      }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } catch { throw consultationError(400, 'INVALID_CONSULTATION', 'Thông tin lựa chọn chưa hợp lệ.') }
}

export async function routeConsultations(request, env, requestId, dependencies, context) {
  const pathname = new URL(request.url).pathname
  const adminMatch = pathname.match(/^\/api\/v1\/admin\/consultations(?:\/([a-zA-Z0-9_-]{1,100})(\/status)?)?$/u)
  if (pathname !== PUBLIC_PATH && !adminMatch) return null
  const route = adminMatch ? `${ADMIN_PATH}${adminMatch[1] ? '/:id' : ''}${adminMatch[2] ?? ''}` : PUBLIC_PATH
  let allowedOrigin = null
  const result = (response, errorCode = null) => ({ response, errorCode, route, allowedOrigin })
  const failure = (status, code, message, headers) => result(errorResponse(status, code, message, requestId, { headers }), code)
  const mutation = request.method === 'POST'
  try {
    const allowedMethod = adminMatch ? (adminMatch[2] ? 'POST' : 'GET') : 'POST'
    if (request.method === 'OPTIONS' && !adminMatch) {
      const origin = validateMutationOrigin(request, env)
      if (!origin.ok) return failure(403, 'ORIGIN_NOT_ALLOWED', 'Nguồn yêu cầu không được cho phép.')
      allowedOrigin = origin.origin
      if (request.headers.get('Access-Control-Request-Method') !== 'POST'
        || (request.headers.get('Access-Control-Request-Headers') ?? '').split(',').filter(Boolean).some((header) => !['content-type', 'idempotency-key'].includes(header.trim().toLowerCase()))) {
        return failure(403, 'ORIGIN_NOT_ALLOWED', 'Nguồn yêu cầu không được cho phép.')
      }
      return result(new Response(null, { status: 204, headers: { 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key', 'Access-Control-Max-Age': '600' } }))
    }
    if (request.method !== allowedMethod) return failure(405, 'METHOD_NOT_ALLOWED', 'Phương thức không được hỗ trợ.', { Allow: allowedMethod })
    if (mutation) {
      const origin = validateMutationOrigin(request, env)
      if (!origin.ok) return failure(403, 'ORIGIN_NOT_ALLOWED', 'Nguồn yêu cầu không được cho phép.')
      allowedOrigin = origin.origin
    }
    let auth
    if (adminMatch) {
      auth = await dependencies.authorizeAdmin(request, env, dependencies)
      if (!auth.ok) return failure(auth.status, auth.code, auth.message)
    }
    if (mutation) {
      const decision = await dependencies.rateLimitRequest({ env, policy: adminMatch ? 'adminMutation' : 'consultationCreation', request,
        ...(adminMatch ? { identity: auth.user.id } : {}) })
      if (!decision.allowed) return failure(decision.status, decision.code, 'Chưa thể gửi yêu cầu. Vui lòng thử lại sau một phút.', { 'Retry-After': String(decision.retryAfterSeconds ?? 60) })
    }
    const repository = dependencies.createRepositories(env).consultations
    if (adminMatch) {
      if (!adminMatch[1]) return result(successResponse({ items: await repository.list() }, requestId))
      const consultation = mutation
        ? await repository.updateStatus(adminMatch[1], (await readPayload(request)).status)
        : await repository.detail(adminMatch[1])
      return result(successResponse({ consultation }, requestId))
    }
    const created = await repository.create(await readPayload(request), request.headers.get('Idempotency-Key'))
    if (created.created) {
      // Only the successful transactional creator schedules a notification, never an idempotent replay.
      const notification = notifyConsultation(created.request, env, repository, new URL(request.url).origin, dependencies.telegramFetch)
      if (context?.waitUntil) context.waitUntil(notification)
      else await notification // Safe local/testing fallback without background execution support.
    }
    return result(successResponse({ consultation: publicConsultation(created.request) }, requestId, { status: created.created ? 201 : 200 }))
  } catch (error) {
    return error?.consultationError
      ? failure(error.status, error.code, error.message)
      : failure(503, 'CONSULTATION_UNAVAILABLE', 'Chưa thể xử lý yêu cầu. Lựa chọn của bạn vẫn được giữ lại. Vui lòng thử lại.')
  }
}
