import assert from 'node:assert/strict'
import test from 'node:test'

import { createWorker } from '../src/worker.js'

const localOrigin = 'http://127.0.0.1:5173'
const silentLogger = { info() {} }

function createAssetsBinding() {
  return {
    async fetch(request) {
      const { pathname } = new URL(request.url)
      if (pathname === '/assets/site.js') {
        return new Response('export const ready = true', {
          headers: { 'Content-Type': 'text/javascript' },
        })
      }
      if (pathname === '/index.html') {
        return new Response('<!doctype html><html lang="vi"><body>Hanapipi Flower</body></html>', {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      }
      return new Response('Not found', { status: 404 })
    },
  }
}

function createEnv(overrides = {}) {
  return {
    API_ALLOWED_ORIGINS: localOrigin,
    API_V1_ENABLED: 'true',
    ASSETS: createAssetsBinding(),
    ...overrides,
  }
}

function createApiRequest(path, options = {}) {
  const headers = new Headers(options.headers)
  if (options.origin !== false) headers.set('Origin', options.origin ?? localOrigin)
  if (options.contentType !== false) headers.set('Content-Type', options.contentType ?? 'application/json')

  return new Request(`${localOrigin}${path}`, {
    body: options.body,
    headers,
    method: options.method ?? 'POST',
  })
}

async function readJson(response) {
  return JSON.parse(await response.text())
}

test('GET /api/v1/health returns the versioned envelope and a server request ID', async () => {
  const worker = createWorker({ logger: silentLogger })
  const response = await worker.fetch(new Request(`${localOrigin}/api/v1/health`, {
    headers: { 'X-Request-ID': 'client-controlled' },
  }), createEnv())
  const body = await readJson(response)
  const requestId = response.headers.get('X-Request-ID')

  assert.equal(response.status, 200)
  assert.deepEqual(body.data, { status: 'ok', version: 'v1' })
  assert.equal(body.meta.requestId, requestId)
  assert.notEqual(requestId, 'client-controlled')
  assert.match(requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u)
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff')
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY')
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
})

test('unknown API routes return a JSON 404 instead of SPA HTML', async () => {
  const worker = createWorker({ logger: silentLogger })
  const response = await worker.fetch(new Request(`${localOrigin}/api/v1/missing`, {
    headers: { Accept: 'text/html' },
  }), createEnv())
  const body = await readJson(response)

  assert.equal(response.status, 404)
  assert.equal(response.headers.get('Content-Type'), 'application/json; charset=utf-8')
  assert.equal(body.error.code, 'API_NOT_FOUND')
  assert.equal(body.error.requestId, response.headers.get('X-Request-ID'))
})

test('known routes reject unsupported methods with an Allow header', async () => {
  const worker = createWorker({ logger: silentLogger })
  const response = await worker.fetch(new Request(`${localOrigin}/api/v1/concierge`), createEnv())
  const body = await readJson(response)

  assert.equal(response.status, 405)
  assert.equal(response.headers.get('Allow'), 'POST, OPTIONS')
  assert.equal(body.error.code, 'METHOD_NOT_ALLOWED')
})

test('concierge rejects malformed JSON, wrong content type and oversized bodies', async () => {
  const worker = createWorker({ logger: silentLogger })
  const env = createEnv()

  const malformed = await worker.fetch(createApiRequest('/api/v1/concierge', {
    body: '{',
  }), env)
  assert.equal(malformed.status, 400)
  assert.equal((await readJson(malformed)).error.code, 'INVALID_REQUEST')

  const wrongType = await worker.fetch(createApiRequest('/api/v1/concierge', {
    body: '{}',
    contentType: 'text/plain',
  }), env)
  assert.equal(wrongType.status, 415)
  assert.equal((await readJson(wrongType)).error.code, 'UNSUPPORTED_MEDIA_TYPE')

  const oversized = await worker.fetch(createApiRequest('/api/v1/concierge', {
    body: 'a'.repeat((32 * 1024) + 1),
  }), env)
  assert.equal(oversized.status, 413)
  assert.equal((await readJson(oversized)).error.code, 'PAYLOAD_TOO_LARGE')
})

test('state-changing v1 requests reject missing or unapproved origins', async () => {
  const worker = createWorker({ logger: silentLogger })
  const env = createEnv()

  const missingOrigin = await worker.fetch(createApiRequest('/api/v1/concierge', {
    body: '{}',
    origin: false,
  }), env)
  assert.equal(missingOrigin.status, 403)

  const foreignOrigin = await worker.fetch(createApiRequest('/api/v1/concierge', {
    body: '{}',
    origin: 'https://example.invalid',
  }), env)
  assert.equal(foreignOrigin.status, 403)
  assert.equal(foreignOrigin.headers.get('Access-Control-Allow-Origin'), null)
})

test('controlled preflight reflects only an allowlisted origin', async () => {
  const worker = createWorker({ logger: silentLogger })
  const request = new Request(`${localOrigin}/api/v1/concierge`, {
    headers: {
      'Access-Control-Request-Headers': 'content-type',
      'Access-Control-Request-Method': 'POST',
      Origin: localOrigin,
    },
    method: 'OPTIONS',
  })
  const response = await worker.fetch(request, createEnv())

  assert.equal(response.status, 204)
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), localOrigin)
  assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'POST, OPTIONS')
})

test('legacy and v1 concierge routes invoke the same injected handler', async () => {
  let calls = 0
  const sharedHandler = async () => {
    calls += 1
    return new Response(JSON.stringify({
      linkIds: [],
      message: 'Xin chào.',
      note: null,
      productIds: [],
      quickReplies: [],
      type: 'answer',
    }), { headers: { 'Content-Type': 'application/json' } })
  }
  const worker = createWorker({ conciergeHandler: sharedHandler, logger: silentLogger })
  const env = createEnv()

  const legacyResponse = await worker.fetch(createApiRequest('/api/concierge', {
    body: '{}',
  }), env)
  const v1Response = await worker.fetch(createApiRequest('/api/v1/concierge', {
    body: '{}',
  }), env)
  const legacyBody = await readJson(legacyResponse)
  const v1Body = await readJson(v1Response)

  assert.equal(calls, 2)
  assert.equal(legacyBody.type, 'answer')
  assert.equal(v1Body.data.type, 'answer')
})

test('valid concierge input without a key fails safely without a live upstream call', async () => {
  const worker = createWorker({ logger: silentLogger })
  const response = await worker.fetch(createApiRequest('/api/v1/concierge', {
    body: JSON.stringify({
      history: [],
      locale: 'vi-VN',
      message: 'Tư vấn giúp mình.',
      pageContext: { productId: null, route: '/' },
    }),
  }), createEnv())
  const body = await readJson(response)

  assert.equal(response.status, 503)
  assert.equal(body.error.code, 'AI_UNAVAILABLE')
})

test('static assets and React deep routes remain outside the API router', async () => {
  const worker = createWorker({ logger: silentLogger })
  const env = createEnv()

  const asset = await worker.fetch(new Request(`${localOrigin}/assets/site.js`), env)
  assert.equal(asset.status, 200)
  assert.match(await asset.text(), /ready = true/u)

  const deepRoute = await worker.fetch(new Request(`${localOrigin}/shop`, {
    headers: { Accept: 'text/html' },
  }), env)
  assert.equal(deepRoute.status, 200)
  assert.match(await deepRoute.text(), /Hanapipi Flower/u)
})

test('internal failures never expose stack or secret-like error details', async () => {
  const worker = createWorker({
    conciergeHandler: async () => {
      throw new Error('PRIVATE_SECRET_MARKER')
    },
    logger: silentLogger,
  })
  const response = await worker.fetch(createApiRequest('/api/v1/concierge', {
    body: '{}',
  }), createEnv())
  const text = await response.text()

  assert.equal(response.status, 500)
  assert.doesNotMatch(text, /PRIVATE_SECRET_MARKER|stack|GROQ_API_KEY/iu)
  assert.match(text, /INTERNAL_ERROR/u)
})

test('API_V1_ENABLED defaults closed while compatibility concierge remains routable', async () => {
  const sharedHandler = async () => new Response(JSON.stringify({ type: 'answer' }), {
    headers: { 'Content-Type': 'application/json' },
  })
  const worker = createWorker({ conciergeHandler: sharedHandler, logger: silentLogger })
  const env = createEnv({ API_V1_ENABLED: undefined })

  const health = await worker.fetch(new Request(`${localOrigin}/api/v1/health`), env)
  const legacy = await worker.fetch(createApiRequest('/api/concierge', { body: '{}' }), env)

  assert.equal(health.status, 404)
  assert.equal(legacy.status, 200)
})
