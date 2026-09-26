import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { createWorker } from '../src/worker.js'
import { resolvePublicCommerceMode } from '../src/utils/publicCommerceMode.js'

const origin = 'https://staging.example'
const env = { API_V1_ENABLED: 'true', API_ALLOWED_ORIGINS: origin }
test('only exact checkout enables commerce; both configured environments fail safe', () => {
  for (const value of [undefined, null, '', 'unknown', 'Checkout', ' checkout ', true, 'consultation']) {
    assert.equal(resolvePublicCommerceMode(value), 'consultation')
  }
  assert.equal(resolvePublicCommerceMode('checkout'), 'checkout')
  const config = JSON.parse(fs.readFileSync('wrangler.jsonc', 'utf8'))
  assert.equal(config.vars.PUBLIC_COMMERCE_MODE, 'consultation')
  assert.equal(config.env.staging.vars.PUBLIC_COMMERCE_MODE, 'consultation')
  assert.equal(config.vars.API_V1_ENABLED, 'false')
})

for (const mode of [undefined, 'unknown', 'consultation']) {
  test(`mode ${mode}: guest/auth/manual/replayed order creation and payment reads blocked before any side effects`, async () => {
    let effects = 0
    const forbidden = () => { effects++; throw new Error('Must never reach commerce dependencies') }
    const worker = createWorker({ logger: { info() {} }, databaseRepositoriesFactory: forbidden,
      identityVerifier: forbidden, rateLimitRequest: forbidden })
    for (const path of ['/api/v1/orders', '/api/v1/orders/HF-HISTORICAL']) {
      for (const authorization of [undefined, 'Bearer fake']) {
        const response = await worker.fetch(new Request(origin + path, {
          method: path.endsWith('/orders') ? 'POST' : 'GET',
          headers: { Origin: origin, ...(authorization ? { Authorization: authorization } : {}),
            'Idempotency-Key': 'same-key-123456789', 'X-Guest-Order-Token': 'fake', Cookie: 'fake=credential' },
          ...(path.endsWith('/orders') ? { body: '{malformed' } : {}),
        }), { ...env, PUBLIC_COMMERCE_MODE: mode })
        assert.equal(response.status, 403)
        assert.equal((await response.json()).error.code, 'COMMERCE_DISABLED')
        assert.equal(response.headers.get('Set-Cookie'), null)
      }
    }
    const list = await worker.fetch(new Request(origin + '/api/v1/orders'), { ...env, PUBLIC_COMMERCE_MODE: mode })
    assert.equal(list.status, 403)
    assert.equal(effects, 0, 'No DB/repository/claims, auth mapping, credentials or limiter work')
  })
}

test('read-only mode endpoint reflects server config; client query/header cannot enable commerce; API gate intact', async () => {
  const worker = createWorker({ logger: { info() {} } })
  for (const mode of ['consultation', 'checkout', 'invalid']) {
    const response = await worker.fetch(new Request(origin + '/api/v1/public-commerce?mode=checkout', { headers: { 'X-Public-Commerce-Mode': 'checkout' } }), { ...env, PUBLIC_COMMERCE_MODE: mode })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).data.mode, resolvePublicCommerceMode(mode))
    assert.equal(response.headers.get('Cache-Control'), 'no-store')
  }
  const disabled = await worker.fetch(new Request(origin + '/api/v1/orders', { method: 'POST' }), { ...env, PUBLIC_COMMERCE_MODE: 'checkout', API_V1_ENABLED: 'false' })
  assert.equal(disabled.status, 404)
})

test('consultation mode preserves authorized Admin historical payment detail and rejects non-admin', async () => {
  const historical = { code: 'HF-HISTORY', paymentStatus: 'pending', payment: { method: 'momo', amountVnd: 590000 } }
  const worker = createWorker({ logger: { info() {} },
    identityVerifier: async (request) => request.headers.get('Authorization') === 'Bearer test-admin'
      ? { ok: true, identity: { subject: 'admin', provider: 'clerk' } }
      : { ok: false, status: 401, code: 'AUTHENTICATION_REQUIRED', message: 'Cần đăng nhập.' },
    databaseRepositoriesFactory: () => ({ users: { getOrCreateByIdentity: async () => ({ id: 'admin', role: 'admin', status: 'active' }) }, orders: { getForAdmin: async () => historical } }),
  })
  const url = origin + '/api/v1/admin/orders/HF-HISTORY'
  assert.equal((await worker.fetch(new Request(url), env)).status, 401)
  const detail = await worker.fetch(new Request(url, { headers: { Authorization: 'Bearer test-admin' } }), env)
  assert.equal(detail.status, 200)
  assert.deepEqual((await detail.json()).data.order, historical)
})
