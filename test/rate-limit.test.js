import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { createApiRouter } from '../src/server/api.js'
import { enforceRateLimit } from '../src/server/rateLimit.js'

const origin = 'https://hanapipi-flower-prod.hutstudio.workers.dev'
const testSecret = Buffer.from('01234567890123456789012345678901').toString('base64')

function limiterBinding(handler) {
  return { limit: handler }
}

function createRateEnv(overrides = {}) {
  return {
    ADMIN_MUTATION_RATE_LIMITER: limiterBinding(async () => ({ success: true })),
    API_ALLOWED_ORIGINS: origin,
    API_V1_ENABLED: 'true',
    CONCIERGE_RATE_LIMITER: limiterBinding(async () => ({ success: true })),
    ORDER_RATE_LIMITER: limiterBinding(async () => ({ success: true })),
    RATE_LIMITING_ENABLED: 'true',
    RATE_LIMIT_KEY_SECRET: testSecret,
    ...overrides,
  }
}

function createRequest(pathname, options = {}) {
  const headers = new Headers(options.headers)
  if (options.origin !== false) headers.set('Origin', origin)
  if (options.contentType !== false) headers.set('Content-Type', 'application/json')
  if (options.ip) headers.set('CF-Connecting-IP', options.ip)
  return new Request(`${origin}${pathname}`, {
    body: options.body,
    headers,
    method: options.method ?? 'POST',
  })
}

test('production config defines isolated limits and keeps the API gate closed', () => {
  const config = JSON.parse(fs.readFileSync(path.resolve('wrangler.jsonc'), 'utf8'))
  const limits = Object.fromEntries(config.ratelimits.map((entry) => [entry.name, entry.simple]))

  assert.equal(config.vars.API_V1_ENABLED, 'false')
  assert.equal(config.vars.RATE_LIMITING_ENABLED, 'true')
  assert.deepEqual(limits.CONCIERGE_RATE_LIMITER, { limit: 6, period: 60 })
  assert.deepEqual(limits.ORDER_RATE_LIMITER, { limit: 5, period: 60 })
  assert.deepEqual(limits.ADMIN_MUTATION_RATE_LIMITER, { limit: 60, period: 60 })
  assert.equal(config.env.staging.vars.RATE_LIMITING_ENABLED, 'false')
  assert.equal(config.env.staging.ratelimits, undefined)
})

test('requests under quota pass and exhausted quota is reported', async () => {
  let remaining = 1
  const env = createRateEnv({
    CONCIERGE_RATE_LIMITER: limiterBinding(async () => ({ success: remaining-- > 0 })),
  })
  const request = createRequest('/api/v1/concierge', { ip: '203.0.113.10' })

  const first = await enforceRateLimit({ env, policy: 'concierge', request })
  const second = await enforceRateLimit({ env, policy: 'concierge', request })

  assert.equal(first.allowed, true)
  assert.deepEqual(second, {
    allowed: false,
    code: 'RATE_LIMITED',
    retryAfterSeconds: 60,
    status: 429,
  })
})

test('identities are pseudonymous, isolated, and quotas stay endpoint-specific', async () => {
  const conciergeKeys = []
  const orderKeys = []
  const env = createRateEnv({
    CONCIERGE_RATE_LIMITER: limiterBinding(async ({ key }) => {
      conciergeKeys.push(key)
      return { success: true }
    }),
    ORDER_RATE_LIMITER: limiterBinding(async ({ key }) => {
      orderKeys.push(key)
      return { success: true }
    }),
  })

  await enforceRateLimit({
    env,
    policy: 'concierge',
    request: createRequest('/api/concierge', { ip: '203.0.113.10' }),
  })
  await enforceRateLimit({
    env,
    policy: 'concierge',
    request: createRequest('/api/concierge', { ip: '203.0.113.11' }),
  })
  await enforceRateLimit({ env, identity: 'usr_canonical_1', policy: 'orderCreation' })

  assert.equal(conciergeKeys.length, 2)
  assert.notEqual(conciergeKeys[0], conciergeKeys[1])
  assert.match(conciergeKeys[0], /^[a-f0-9]{64}$/u)
  assert.doesNotMatch(conciergeKeys[0], /203\.0\.113/u)
  assert.equal(orderKeys.length, 1)
  assert.notEqual(orderKeys[0], conciergeKeys[0])
})

test('enabled limiter fails closed when binding, key, or infrastructure is unavailable', async () => {
  const missingBinding = await enforceRateLimit({
    env: createRateEnv({ ORDER_RATE_LIMITER: undefined }),
    identity: 'usr_1',
    policy: 'orderCreation',
  })
  const invalidSecret = await enforceRateLimit({
    env: createRateEnv({ RATE_LIMIT_KEY_SECRET: 'not-a-key' }),
    identity: 'usr_1',
    policy: 'orderCreation',
  })
  const failedBinding = await enforceRateLimit({
    env: createRateEnv({
      ORDER_RATE_LIMITER: limiterBinding(async () => { throw new Error('private infrastructure detail') }),
    }),
    identity: 'usr_1',
    policy: 'orderCreation',
  })

  for (const decision of [missingBinding, invalidSecret, failedBinding]) {
    assert.equal(decision.allowed, false)
    assert.equal(decision.code, 'RATE_LIMIT_UNAVAILABLE')
    assert.equal(decision.status, 503)
  }
})

test('v1 concierge returns the API error envelope, Retry-After, and skips provider work', async () => {
  let handlerCalls = 0
  const route = createApiRouter({
    conciergeHandler: async () => {
      handlerCalls += 1
      return Response.json({ message: 'should not run' })
    },
    rateLimitRequest: async () => ({
      allowed: false,
      code: 'RATE_LIMITED',
      retryAfterSeconds: 60,
      status: 429,
    }),
  })
  const routed = await route(
    createRequest('/api/v1/concierge', { body: '{}', ip: '203.0.113.10' }),
    createRateEnv(),
    'request-rate-limit',
  )
  const body = await routed.response.json()

  assert.equal(routed.response.status, 429)
  assert.equal(routed.response.headers.get('Retry-After'), '60')
  assert.equal(body.error.code, 'RATE_LIMITED')
  assert.match(body.error.message, /thử lại/u)
  assert.equal(handlerCalls, 0)

  const legacy = await route(
    createRequest('/api/concierge', { body: '{}', ip: '203.0.113.10' }),
    createRateEnv(),
    'request-rate-limit-legacy',
  )
  const legacyBody = await legacy.response.json()
  assert.equal(legacy.response.status, 429)
  assert.equal(legacy.response.headers.get('Retry-After'), '60')
  assert.equal(legacyBody.code, 'RATE_LIMITED')
  assert.equal(handlerCalls, 0)
})

test('order limiter uses network context for guests and canonical identity for signed-in customers', async () => {
  let limiterCalls = 0
  const captured = []
  const route = createApiRouter({
    authenticateUser: async (request) => {
      if (!request.headers.has('Authorization')) {
        return { code: 'AUTHENTICATION_REQUIRED', message: 'Login required.', ok: false, status: 401 }
      }
      return { ok: true, user: { id: 'usr_canonical_1' } }
    },
    rateLimitRequest: async ({ identity, policy, request }) => {
      limiterCalls += 1
      captured.push({ identity, ip: request?.headers.get('CF-Connecting-IP') })
      assert.equal(policy, 'orderCreation')
      return { allowed: false, code: 'RATE_LIMITED', retryAfterSeconds: 60, status: 429 }
    },
  })
  const env = createRateEnv()

  const guest = await route(createRequest('/api/v1/orders', { body: '{}', ip: '203.0.113.10' }), env, 'guest')
  assert.equal(guest.response.status, 429)
  assert.equal(captured[0].identity, undefined)
  assert.equal(captured[0].ip, '203.0.113.10')

  const customer = await route(createRequest('/api/v1/orders', {
    body: JSON.stringify({ userId: 'forged-user' }),
    headers: {
      Authorization: 'Bearer opaque-token',
      'X-User-Id': 'forged-user',
    },
  }), env, 'customer')
  const body = await customer.response.json()

  assert.equal(customer.response.status, 429)
  assert.equal(customer.response.headers.get('Retry-After'), '60')
  assert.equal(body.error.code, 'RATE_LIMITED')
  assert.equal(captured[1].identity, 'usr_canonical_1')
  assert.equal(limiterCalls, 2)
})

test('admin authorization precedes limiting and catalogue GET remains unaffected', async () => {
  let authorized = false
  let limiterCalls = 0
  const repositories = {
    catalogue: {
      async getCatalogueVersion() { return { version: 1 } },
      async listProducts() { return { items: [], limit: 50, offset: 0 } },
    },
  }
  const route = createApiRouter({
    databaseRepositoriesFactory: () => repositories,
    rateLimitRequest: async () => {
      limiterCalls += 1
      return { allowed: false, code: 'RATE_LIMITED', retryAfterSeconds: 60, status: 429 }
    },
    requireAdmin: async () => authorized
      ? { ok: true, user: { id: 'usr_admin_1', role: 'admin' } }
      : { code: 'FORBIDDEN', message: 'Forbidden.', ok: false, status: 403 },
  })
  const env = createRateEnv()

  const rejected = await route(createRequest('/api/v1/admin/products', { body: '{}' }), env, 'guest')
  assert.equal(rejected.response.status, 403)
  assert.equal(limiterCalls, 0)

  authorized = true
  const limited = await route(createRequest('/api/v1/admin/products', { body: '{}' }), env, 'admin')
  assert.equal(limited.response.status, 429)
  assert.equal(limiterCalls, 1)

  const catalogue = await route(new Request(`${origin}/api/v1/catalogue`), env, 'catalogue')
  assert.equal(catalogue.response.status, 200)
  assert.equal(limiterCalls, 1)
})
