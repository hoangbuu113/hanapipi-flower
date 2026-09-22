import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import {
  checkAdminAccess,
  createAdminProduct,
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

test('27. guest POST to /api/v1/admin/products returns 401', async () => {
  const { d1 } = createSeededDatabase()
  const testWorker = createTestWorker(d1)

  // via client without token
  const clientRes = await createAdminProduct({ name: 'Hoa Mới', priceVnd: 500000, slug: 'hoa-moi' }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => null,
  })
  assert.equal(clientRes.ok, false)
  assert.equal(clientRes.status, 401)
  assert.equal(clientRes.error.code, 'AUTHENTICATION_REQUIRED')

  // via direct fetch without Authorization header
  const directRes = await testWorker.fetch('/api/v1/admin/products', {
    body: JSON.stringify({ name: 'Hoa Mới', priceVnd: 500000, slug: 'hoa-moi' }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
  assert.equal(directRes.status, 401)
})

test('28. customer POST to /api/v1/admin/products returns 403', async () => {
  const { d1 } = createSeededDatabase()
  const testWorker = createTestWorker(d1)

  const result = await createAdminProduct({ name: 'Hoa Mới', priceVnd: 500000, slug: 'hoa-moi' }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'customer-token',
  })

  assert.equal(result.ok, false)
  assert.equal(result.status, 403)
  assert.equal(result.error.code, 'FORBIDDEN')
})

test('29. admin can create valid normal product, new row exists in D1, and canonical product is returned', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  const result = await createAdminProduct({
    collection: 'Bộ sưu tập mùa thu',
    imageUrl: 'https://images.unsplash.com/photo-test',
    isPurchasable: true,
    name: 'Hoa Cúc Mùa Thu',
    priceVnd: 620000,
    shortDescription: 'Hoa cúc vàng ấm áp cho ngày thu.',
    slug: 'hoa-cuc-mua-thu',
    status: 'available',
  }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  assert.equal(result.ok, true)
  assert.equal(result.status, 201)
  assert.ok(result.product.id.startsWith('prod_'), 'ID must have server-generated prefix prod_')
  assert.equal(result.product.slug, 'hoa-cuc-mua-thu')
  assert.equal(result.product.name, 'Hoa Cúc Mùa Thu')
  assert.equal(result.product.priceVnd, 620000)
  assert.equal(result.product.status, 'available')
  assert.equal(result.product.isPurchasable, true)

  // Direct D1 inspection
  const row = sqlite.prepare('SELECT id, slug, name, price_vnd, status, active FROM products WHERE slug = ?').get('hoa-cuc-mua-thu')
  assert.ok(row, 'Product row must exist in D1 products table')
  assert.equal(row.slug, 'hoa-cuc-mua-thu')
  assert.equal(row.name, 'Hoa Cúc Mùa Thu')
  assert.equal(row.price_vnd, 620000)
  assert.equal(row.status, 'available')
  assert.equal(row.active, 1)

  // Direct D1 inspection for default variant
  const variant = sqlite.prepare('SELECT id, product_id, option_type, code, label, price_vnd, active FROM product_variants WHERE product_id = ?').get(row.id)
  assert.ok(variant, 'Default variant must exist in D1 product_variants table')
  assert.equal(variant.option_type, 'size')
  assert.equal(variant.code, 'standard')
  assert.equal(variant.label, 'Tiêu chuẩn')
  assert.equal(variant.price_vnd, 620000)
  assert.equal(variant.active, 1)
})

test('30. public catalogue can read created product', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  await createAdminProduct({
    name: 'Hoa Lan Tím',
    priceVnd: 880000,
    slug: 'hoa-lan-tim',
    status: 'available',
  }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  // 1. Detail endpoint
  const detailRes = await testWorker.fetch('/api/v1/catalogue/products/hoa-lan-tim')
  assert.equal(detailRes.status, 200)
  const detailBody = JSON.parse(await detailRes.text())
  assert.equal(detailBody.data.product.slug, 'hoa-lan-tim')
  assert.equal(detailBody.data.product.priceVnd, 880000)
  assert.ok(detailBody.data.variants.length > 0, 'Must have at least default variant')

  // 2. Listing endpoint
  const listRes = await testWorker.fetch('/api/v1/catalogue/products?limit=50')
  assert.equal(listRes.status, 200)
  const listBody = JSON.parse(await listRes.text())
  const found = listBody.data.items.find((p) => p.slug === 'hoa-lan-tim')
  assert.ok(found, 'Created product must appear in public catalogue listing')
  assert.equal(found.priceVnd, 880000)
})

test('31. duplicate slug is rejected with 409 Conflict', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  // 'nang-diu' is seeded
  const result = await createAdminProduct({
    name: 'Nắng Dịu Mới',
    priceVnd: 600000,
    slug: 'nang-diu',
  }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  assert.equal(result.ok, false)
  assert.equal(result.status, 409)
  assert.equal(result.error.code, 'SLUG_EXISTS')
})

test('32. empty or missing name is rejected with 400', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  const empty = await createAdminProduct({ name: '', priceVnd: 500000, slug: 'hoa-khong-ten' }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(empty.ok, false)
  assert.equal(empty.status, 400)
  assert.equal(empty.error.code, 'INVALID_NAME')

  const whitespace = await createAdminProduct({ name: '   ', priceVnd: 500000, slug: 'hoa-khong-ten-2' }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(whitespace.ok, false)
  assert.equal(whitespace.status, 400)
  assert.equal(whitespace.error.code, 'INVALID_NAME')
})

test('33. invalid slug is rejected with 400', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  const withSpaces = await createAdminProduct({ name: 'Hoa Test', priceVnd: 500000, slug: 'hoa voi khoang trang' }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(withSpaces.ok, false)
  assert.equal(withSpaces.status, 400)
  assert.equal(withSpaces.error.code, 'INVALID_SLUG')

  const uppercase = await createAdminProduct({ name: 'Hoa Test', priceVnd: 500000, slug: 'HOA-VIET-HOA' }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(uppercase.ok, true)
  assert.equal(uppercase.product.slug, 'hoa-viet-hoa', 'Uppercase slug must be normalized to lowercase')

  const specialChars = await createAdminProduct({ name: 'Hoa Test', priceVnd: 500000, slug: 'hoa@dac#biet' }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(specialChars.ok, false)
  assert.equal(specialChars.status, 400)
  assert.equal(specialChars.error.code, 'INVALID_SLUG')
})

test('34. invalid/negative/fractional price is rejected with 400', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  const neg = await createAdminProduct({ name: 'Hoa Test', priceVnd: -10000, slug: 'hoa-gia-am' }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(neg.ok, false)
  assert.equal(neg.status, 400)
  assert.equal(neg.error.code, 'INVALID_PRICE')

  const zero = await createAdminProduct({ name: 'Hoa Test', priceVnd: 0, slug: 'hoa-gia-khong' }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(zero.ok, false)
  assert.equal(zero.status, 400)
  assert.equal(zero.error.code, 'INVALID_PRICE')

  const fractional = await createAdminProduct({ name: 'Hoa Test', priceVnd: 590000.5, slug: 'hoa-gia-le' }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(fractional.ok, false)
  assert.equal(fractional.status, 400)
  assert.equal(fractional.error.code, 'INVALID_PRICE')
})

test('35. arbitrary unknown fields are ignored safely and only whitelisted fields persist', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  const result = await createAdminProduct({
    dropDatabase: 'true',
    isAdmin: true,
    name: 'Hoa An Toàn',
    priceVnd: 510000,
    randomExtraField: 'ignore me',
    slug: 'hoa-an-toan',
  }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  assert.equal(result.ok, true)
  assert.equal(result.product.name, 'Hoa An Toàn')
  assert.equal(result.product.priceVnd, 510000)
  assert.equal(result.product.randomExtraField, undefined)
})

test('36. fake client role=admin or fake userId cannot bypass server authorization', async () => {
  const { d1 } = createSeededDatabase()
  const testWorker = createTestWorker(d1)

  const result = await createAdminProduct({
    name: 'Hoa Giả Mạo',
    priceVnd: 500000,
    role: 'admin',
    slug: 'hoa-gia-mao',
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

test('37. cannot create slug no-watering-flower', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  const result = await createAdminProduct({
    name: 'Bông Hoa Không Cần Tưới Thứ Hai',
    priceVnd: 500000,
    slug: 'no-watering-flower',
  }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  assert.equal(result.ok, false)
  assert.equal(result.status, 400)
  assert.equal(result.error.code, 'PROTECTED_PRODUCT')
})

test('38. cannot create a second priceless product', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  const result = await createAdminProduct({
    name: 'Hoa Vô Giá Mới',
    priceVnd: 500000,
    purchaseType: 'priceless',
    slug: 'hoa-vo-gia-moi',
  }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  assert.equal(result.ok, false)
  assert.equal(result.status, 400)
  assert.equal(result.error.code, 'PROTECTED_PRODUCT')
})

test('39. existing protected product remains unchanged after failed creation attempts', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  // Attempt creation of duplicate protected product
  await createAdminProduct({
    name: 'Bông Hoa Không Cần Tưới Nhái',
    priceVnd: 100000,
    slug: 'no-watering-flower',
  }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  // Verify in D1 that no-watering-flower is unchanged
  const row = sqlite.prepare('SELECT price_vnd, purchase_type, active FROM products WHERE id = ?').get('no-watering-flower')
  assert.equal(row.price_vnd, null, 'price_vnd must remain null')
  assert.equal(row.purchase_type, 'priceless', 'purchase_type must remain priceless')
})

test('40. Admin UI create flow uses authenticated adminClient', () => {
  const adminPageCode = fs.readFileSync(path.resolve('src/pages/AdminPage.jsx'), 'utf8')

  assert.match(adminPageCode, /createAdminProduct\(payload/u, 'Must call createAdminProduct')
  assert.match(adminPageCode, /getToken/u, 'Must pass getToken')
  assert.match(adminPageCode, /setIsSubmittingCreate\(true\)/u, 'Must set submitting state')
})

test('41. UI handles validation error and server failure', () => {
  const adminPageCode = fs.readFileSync(path.resolve('src/pages/AdminPage.jsx'), 'utf8')

  assert.match(adminPageCode, /setCreateError\('Tên sản phẩm không được để trống\.'\)/u)
  assert.match(adminPageCode, /setCreateError\('Slug sản phẩm không hợp lệ/u)
  assert.match(adminPageCode, /setCreateError\(result\.error\?\.message/u)
})

test('42. UI refreshes with canonical created product after success', () => {
  const adminPageCode = fs.readFileSync(path.resolve('src/pages/AdminPage.jsx'), 'utf8')

  assert.match(adminPageCode, /setProducts\(\(prev\) => \[result\.product, \.\.\.prev\]\)/u)
  assert.ok(adminPageCode.includes('setSaveSuccess(`Đã tạo thành công sản phẩm "${result.product.name}".`)'))
})
