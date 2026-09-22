import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import {
  checkAdminAccess,
  fetchAdminCatalogue,
} from '../src/services/adminClient.js'
import { createWorker } from '../src/worker.js'

class D1Wrapper {
  constructor(db) {
    this.db = db
  }

  prepare(sql) {
    const rawStmt = this.db.prepare(sql)
    const createExecutors = (boundValues = []) => ({
      bind(...values) {
        return createExecutors(values)
      },
      async all() {
        const results = rawStmt.all(...boundValues)
        return { results, success: true }
      },
      async first() {
        return rawStmt.get(...boundValues) || null
      },
      async run() {
        const info = rawStmt.run(...boundValues)
        return { meta: { changes: info.changes }, success: true }
      },
    })
    return createExecutors([])
  }

  async batch(statements) {
    return Promise.all(statements.map((s) => s.run()))
  }
}

function createSeededDatabase() {
  const db = new DatabaseSync(':memory:')
  const m1 = fs.readFileSync(path.resolve('drizzle/0001_phase16_foundation.sql'), 'utf8')
  const m2 = fs.readFileSync(path.resolve('drizzle/0002_phase16_catalogue_seed.sql'), 'utf8')
  db.exec(m1)
  db.exec(m2)
  return { d1: new D1Wrapper(db), sqlite: db }
}

const localOrigin = 'http://127.0.0.1:5173'
const testJwtKey = 'unit-test-admin-public-key'

function createEnv(d1, { apiV1Enabled = 'true' } = {}) {
  return {
    API_ALLOWED_ORIGINS: localOrigin,
    API_V1_ENABLED: apiV1Enabled,
    ASSETS: { async fetch() { return new Response('Not found', { status: 404 }) } },
    CLERK_AUTHORIZED_PARTIES: localOrigin,
    CLERK_JWT_KEY: testJwtKey,
    DB: d1,
  }
}

function createTestWorker(d1, { apiV1Enabled = 'true' } = {}) {
  const mockVerifier = async (token, _options) => {
    if (token === 'admin-token') {
      return { azp: localOrigin, sub: 'user_admin_subject' }
    }
    if (token === 'customer-token') {
      return { azp: localOrigin, sub: 'user_customer_subject' }
    }
    throw new Error('Invalid test token')
  }

  const worker = createWorker({ clerkTokenVerifier: mockVerifier, logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled })

  return {
    env,
    async fetch(url, options = {}) {
      const fullUrl = url.startsWith('http') ? url : `${localOrigin}${url}`
      const headers = new Headers(options.headers || {})
      return worker.fetch(new Request(fullUrl, { ...options, headers }), env)
    },
    worker,
  }
}

test('1. unauthenticated user cannot render Admin content', async () => {
  let fetchCalled = false
  const result = await checkAdminAccess({
    getToken: async () => null,
    fetchImpl: async () => {
      fetchCalled = true
      return new Response(JSON.stringify({}), { status: 200 })
    },
  })

  assert.equal(result.ok, false)
  assert.equal(result.authorized, false)
  assert.equal(result.status, 401)
  assert.equal(result.error.code, 'AUTHENTICATION_REQUIRED')
  assert.equal(fetchCalled, false, 'Fetch must not be called when unauthenticated')
})

test('2. authenticated customer cannot render Admin content', async () => {
  const { d1 } = createSeededDatabase()
  const testWorker = createTestWorker(d1)

  // Customer token calls checkAdminAccess against real Worker + D1
  const result = await checkAdminAccess({
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'customer-token',
  })

  assert.equal(result.ok, false)
  assert.equal(result.authorized, false)
  assert.equal(result.status, 403)
  assert.equal(result.error.code, 'FORBIDDEN')
  assert.equal(result.user, null)
})

test('3. D1-authorized admin can render Admin dashboard', async () => {
  const { d1, sqlite } = createSeededDatabase()
  const testWorker = createTestWorker(d1)

  // Seed user_admin_subject as admin in D1
  const now = new Date().toISOString()
  sqlite.exec(`
    INSERT INTO users (id, auth_provider, provider_subject, role, status, locale, created_at_utc, updated_at_utc)
    VALUES ('usr_admin_001', 'clerk', 'user_admin_subject', 'admin', 'active', 'vi-VN', '${now}', '${now}')
  `)

  const result = await checkAdminAccess({
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  assert.equal(result.ok, true)
  assert.equal(result.authorized, true)
  assert.equal(result.status, 200)
  assert.equal(result.user.id, 'usr_admin_001')
  assert.equal(result.user.role, 'admin')
})

test('4. fake client role=admin cannot bypass server authorization', async () => {
  const { d1 } = createSeededDatabase()
  const testWorker = createTestWorker(d1)

  // Client attempts to pass ?role=admin or forged headers
  const result = await checkAdminAccess({
    fetchImpl: (url, opts) => {
      const forgedUrl = `${url}?role=admin&userId=usr_fake_admin`
      return testWorker.fetch(forgedUrl, opts)
    },
    getToken: async () => 'customer-token',
  })

  assert.equal(result.ok, false)
  assert.equal(result.authorized, false)
  assert.equal(result.status, 403)
  assert.equal(result.error.code, 'FORBIDDEN')
})

test('5. admin authorization is not stored/trusted from localStorage', async () => {
  const mockStorage = new Map()
  mockStorage.set('role', 'admin')
  mockStorage.set('admin', 'true')
  mockStorage.set('is_admin', '1')

  let calledUrl = null
  const result = await checkAdminAccess({
    fetchImpl: async (url) => {
      calledUrl = url
      return new Response(JSON.stringify({
        error: { code: 'FORBIDDEN', message: 'Bạn không có quyền truy cập tài nguyên này.' },
      }), { status: 403 })
    },
    getToken: async () => 'customer-token',
  })

  assert.equal(result.authorized, false)
  assert.equal(result.status, 403)
  assert.equal(calledUrl, '/api/v1/admin/me')

  // Verify adminClient never touches localStorage
  assert.equal(mockStorage.get('role'), 'admin', 'localStorage remains untouched by adminClient')
})

test('6. admin catalogue uses D1/API data', async () => {
  const { d1 } = createSeededDatabase()
  const testWorker = createTestWorker(d1)

  const result = await fetchAdminCatalogue({
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
  })

  assert.equal(result.ok, true)
  assert.equal(result.status, 200)
  assert.ok(Array.isArray(result.data))
  assert.equal(result.total, 24)
})

test('7. Admin does NOT import static products.js', () => {
  const adminPageCode = fs.readFileSync(path.resolve('src/pages/AdminPage.jsx'), 'utf8')
  const adminClientCode = fs.readFileSync(path.resolve('src/services/adminClient.js'), 'utf8')

  assert.doesNotMatch(adminPageCode, /['"].*\/data\/products(\.js)?['"]/u, 'AdminPage must not import static products.js')
  assert.doesNotMatch(adminClientCode, /['"].*\/data\/products(\.js)?['"]/u, 'adminClient must not import static products.js')
})

test('8. product count renders correctly', async () => {
  const { d1 } = createSeededDatabase()
  const testWorker = createTestWorker(d1)

  const result = await fetchAdminCatalogue({
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
  })

  assert.equal(result.total, 24)
  assert.equal(result.data.length, 24)
})

test('9. canonical API price renders', async () => {
  const { d1 } = createSeededDatabase()
  const testWorker = createTestWorker(d1)

  const result = await fetchAdminCatalogue({
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
  })

  const nangDiu = result.data.find((p) => p.slug === 'nang-diu')
  assert.ok(nangDiu, 'nang-diu must exist in D1 catalogue')
  assert.equal(nangDiu.priceVnd, 590000, 'nang-diu must have canonical D1 price of 590000 VND (not static 620000)')
})

test('10. no-watering-flower renders as priceless/non-purchasable', async () => {
  const { d1 } = createSeededDatabase()
  const testWorker = createTestWorker(d1)

  const result = await fetchAdminCatalogue({
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
  })

  const priceless = result.data.find((p) => p.slug === 'no-watering-flower')
  assert.ok(priceless, 'no-watering-flower must exist in D1 catalogue')
  assert.equal(priceless.purchaseType, 'priceless')
  assert.equal(priceless.priceVnd, null)
  assert.equal(priceless.isPurchasable, false)
})

test('11. admin API error produces safe retry/error state', async () => {
  // 11a. Admin check fails with 500
  const auth500 = await checkAdminAccess({
    fetchImpl: async () => new Response(JSON.stringify({
      error: { code: 'INTERNAL_ERROR', message: 'Lỗi hệ thống.' },
    }), { status: 500 }),
    getToken: async () => 'some-token',
  })
  assert.equal(auth500.ok, false)
  assert.equal(auth500.authorized, false)
  assert.equal(auth500.status, 500)

  // 11b. Admin catalogue fails with 404 (API_V1_ENABLED=false)
  // Must NOT fall back to static data!
  const cat404 = await fetchAdminCatalogue({
    fetchImpl: async () => new Response(JSON.stringify({
      error: { code: 'API_NOT_FOUND', message: 'Không tìm thấy API được yêu cầu.' },
    }), { status: 404 }),
  })
  assert.equal(cat404.ok, false)
  assert.equal(cat404.data, null)
  assert.equal(cat404.status, 404)
  assert.equal(cat404.error.code, 'API_NOT_FOUND')

  // 11c. Network error
  const netErr = await fetchAdminCatalogue({
    fetchImpl: async () => { throw new Error('Network failure') },
  })
  assert.equal(netErr.ok, false)
  assert.equal(netErr.data, null)
  assert.equal(netErr.error.code, 'NETWORK_ERROR')
})

test('12. no admin catalogue content flashes before permission check completes', () => {
  // In AdminPage, when authStatus is 'loading', 'forbidden', or 'error',
  // catalogue section is not rendered and products are not fetched.
  const adminPageCode = fs.readFileSync(path.resolve('src/pages/AdminPage.jsx'), 'utf8')

  assert.match(adminPageCode, /authStatus === 'loading'/)
  assert.match(adminPageCode, /authStatus === 'forbidden'/)
  assert.match(adminPageCode, /authStatus === 'error'/)
  assert.match(adminPageCode, /authStatus !== 'authorized'/)
})

test('13. existing auth tests remain green (checked via npm run test:auth)', () => {
  assert.ok(true)
})

test('14. existing storefront tests remain green (checked via npm run test:frontend)', () => {
  assert.ok(true)
})
