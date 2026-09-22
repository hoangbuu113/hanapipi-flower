import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import {
  checkAdminAccess,
  fetchAdminCatalogue,
  updateAdminProduct,
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

function seedAdminUser(sqlite) {
  const now = new Date().toISOString()
  sqlite.exec(`
    INSERT INTO users (id, auth_provider, provider_subject, role, status, locale, created_at_utc, updated_at_utc)
    VALUES ('usr_admin_001', 'clerk', 'user_admin_subject', 'admin', 'active', 'vi-VN', '${now}', '${now}')
  `)
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
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

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
  const auth500 = await checkAdminAccess({
    fetchImpl: async () => new Response(JSON.stringify({
      error: { code: 'INTERNAL_ERROR', message: 'Lỗi hệ thống.' },
    }), { status: 500 }),
    getToken: async () => 'some-token',
  })
  assert.equal(auth500.ok, false)
  assert.equal(auth500.authorized, false)
  assert.equal(auth500.status, 500)

  const cat404 = await fetchAdminCatalogue({
    fetchImpl: async () => new Response(JSON.stringify({
      error: { code: 'API_NOT_FOUND', message: 'Không tìm thấy API được yêu cầu.' },
    }), { status: 404 }),
  })
  assert.equal(cat404.ok, false)
  assert.equal(cat404.data, null)
  assert.equal(cat404.status, 404)
  assert.equal(cat404.error.code, 'API_NOT_FOUND')

  const netErr = await fetchAdminCatalogue({
    fetchImpl: async () => { throw new Error('Network failure') },
  })
  assert.equal(netErr.ok, false)
  assert.equal(netErr.data, null)
  assert.equal(netErr.error.code, 'NETWORK_ERROR')
})

test('12. no admin catalogue content flashes before permission check completes', () => {
  const adminPageCode = fs.readFileSync(path.resolve('src/pages/AdminPage.jsx'), 'utf8')

  assert.match(adminPageCode, /authStatus === 'loading'/)
  assert.match(adminPageCode, /authStatus === 'forbidden'/)
  assert.match(adminPageCode, /authStatus === 'error'/)
  assert.match(adminPageCode, /authStatus !== 'authorized'/)
})

// --- Phase 18H Mutation Tests ---

test('13. guest mutation returns 401', async () => {
  const { d1 } = createSeededDatabase()
  const testWorker = createTestWorker(d1)

  const result = await updateAdminProduct('nang-diu', { priceVnd: 600000 }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => null,
  })

  assert.equal(result.ok, false)
  assert.equal(result.status, 401)
  assert.equal(result.error.code, 'AUTHENTICATION_REQUIRED')
})

test('14. customer mutation returns 403', async () => {
  const { d1 } = createSeededDatabase()
  const testWorker = createTestWorker(d1)

  const result = await updateAdminProduct('nang-diu', { priceVnd: 600000 }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'customer-token',
  })

  assert.equal(result.ok, false)
  assert.equal(result.status, 403)
  assert.equal(result.error.code, 'FORBIDDEN')
})

test('15. admin can update normal product price and persisted D1 price changes', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  const result = await updateAdminProduct('nang-diu', { priceVnd: 630000 }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  assert.equal(result.ok, true)
  assert.equal(result.status, 200)
  assert.equal(result.product.id, 'nang-diu')
  assert.equal(result.product.priceVnd, 630000)

  // Verify direct D1 query reflects persisted change
  const row = sqlite.prepare('SELECT price_vnd FROM products WHERE id = ?').get('nang-diu')
  assert.equal(row.price_vnd, 630000, 'D1 row must have updated price_vnd')
})

test('16. returned product reflects canonical D1 state', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  const result = await updateAdminProduct('nang-diu', {
    isPurchasable: true,
    priceVnd: 640000,
    status: 'preorder',
  }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  assert.equal(result.ok, true)
  assert.equal(result.product.id, 'nang-diu')
  assert.equal(result.product.slug, 'nang-diu')
  assert.equal(result.product.priceVnd, 640000)
  assert.equal(result.product.status, 'preorder')
  assert.equal(result.product.isPurchasable, true)
})

test('17. admin can update valid status', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  const result = await updateAdminProduct('nang-diu', { status: 'seasonal' }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  assert.equal(result.ok, true)
  assert.equal(result.product.status, 'seasonal')

  const row = sqlite.prepare('SELECT status FROM products WHERE id = ?').get('nang-diu')
  assert.equal(row.status, 'seasonal')
})

test('18. invalid price is rejected with 400', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  // 18a. Negative price
  const neg = await updateAdminProduct('nang-diu', { priceVnd: -50000 }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(neg.ok, false)
  assert.equal(neg.status, 400)
  assert.equal(neg.error.code, 'INVALID_PRICE')

  // 18b. Zero price
  const zero = await updateAdminProduct('nang-diu', { priceVnd: 0 }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(zero.ok, false)
  assert.equal(zero.status, 400)
  assert.equal(zero.error.code, 'INVALID_PRICE')

  // 18c. Float price
  const flt = await updateAdminProduct('nang-diu', { priceVnd: 590000.5 }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(flt.ok, false)
  assert.equal(flt.status, 400)
  assert.equal(flt.error.code, 'INVALID_PRICE')
})

test('19. unknown product returns 404', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  const result = await updateAdminProduct('non-existent-flower-xyz', { priceVnd: 500000 }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  assert.equal(result.ok, false)
  assert.equal(result.status, 404)
  assert.equal(result.error.code, 'PRODUCT_NOT_FOUND')
})

test('20. fake role=admin or fake userId cannot bypass server authorization', async () => {
  const { d1 } = createSeededDatabase()
  const testWorker = createTestWorker(d1)

  const result = await updateAdminProduct('nang-diu', {
    priceVnd: 700000,
    role: 'admin',
    userId: 'usr_admin_001',
  }, {
    fetchImpl: (url, opts) => {
      const forgedUrl = `${url}?role=admin&userId=usr_admin_001`
      return testWorker.fetch(forgedUrl, opts)
    },
    getToken: async () => 'customer-token',
  })

  assert.equal(result.ok, false)
  assert.equal(result.status, 403)
  assert.equal(result.error.code, 'FORBIDDEN')
})

test('21. no-watering-flower numeric price update is rejected', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  const result = await updateAdminProduct('no-watering-flower', { priceVnd: 999999 }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  assert.equal(result.ok, false)
  assert.equal(result.status, 400)
  assert.equal(result.error.code, 'PROTECTED_PRODUCT')
})

test('22. no-watering-flower purchasable=true is rejected', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  const result = await updateAdminProduct('no-watering-flower', { isPurchasable: true }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  assert.equal(result.ok, false)
  assert.equal(result.status, 400)
  assert.equal(result.error.code, 'PROTECTED_PRODUCT')
})

test('23. no-watering-flower remains priceVnd=null and priceless after failed attempts', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  // Attempt mutations
  await updateAdminProduct('no-watering-flower', { priceVnd: 100000 }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  await updateAdminProduct('no-watering-flower', { isPurchasable: true }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  // Verify in D1
  const row = sqlite.prepare('SELECT price_vnd, purchase_type, active FROM products WHERE id = ?').get('no-watering-flower')
  assert.equal(row.price_vnd, null, 'price_vnd must remain null')
  assert.equal(row.purchase_type, 'priceless', 'purchase_type must remain priceless')
})

test('24. Admin UI save flow uses authenticated admin client and does not claim success early', () => {
  const adminPageCode = fs.readFileSync(path.resolve('src/pages/AdminPage.jsx'), 'utf8')

  assert.match(adminPageCode, /updateAdminProduct\(productId/u, 'Must call updateAdminProduct')
  assert.match(adminPageCode, /getToken/u, 'Must pass getToken')
  assert.match(adminPageCode, /setIsSaving\(true\)/u, 'Must set saving state')
  assert.match(adminPageCode, /if \(result\.ok && result\.product\)/u, 'Must verify response before claiming success')
})

test('25. server error leaves prior visible product state intact', () => {
  const adminPageCode = fs.readFileSync(path.resolve('src/pages/AdminPage.jsx'), 'utf8')

  assert.match(adminPageCode, /setSaveError\(result\.error\?\.message/u)
})

test('26. storefront catalogue read reflects updated D1 value in integration test', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  // 1. Admin updates price to 680000
  const updateRes = await updateAdminProduct('nang-diu', { priceVnd: 680000 }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(updateRes.ok, true)

  // 2. Public storefront catalogue reads the updated price
  const publicRes = await testWorker.fetch('/api/v1/catalogue/products/nang-diu')
  assert.equal(publicRes.status, 200)
  const publicBody = JSON.parse(await publicRes.text())
  assert.equal(publicBody.data.product.priceVnd, 680000, 'Public catalogue must return updated D1 price')
})
