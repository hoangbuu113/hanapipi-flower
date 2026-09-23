import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import {
  checkAdminAccess,
  createAdminGiftAddOn,
  createAdminProduct,
  deleteAdminMedia,
  fetchAdminCatalogue,
  fetchAdminGiftAddOns,
  fetchAdminProductVariants,
  saveAdminProductVariants,
  setAdminProductArchived,
  toggleAdminGiftAddOnActive,
  updateAdminGiftAddOn,
  updateAdminProduct,
  uploadAdminMedia,
} from '../src/services/adminClient.js'
import { MemoryMediaBucket } from '../src/server/mediaStorage.js'
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
  const m3 = fs.readFileSync(path.resolve('drizzle/0003_add_product_internal_note.sql'), 'utf8')
  db.exec(m1)
  db.exec(m2)
  db.exec(m3)
  return { d1: new D1Wrapper(db), sqlite: db }
}

const localOrigin = 'http://127.0.0.1:5173'
const testJwtKey = 'unit-test-admin-public-key'

function createEnv(d1, { apiV1Enabled = 'true', mediaBucket } = {}) {
  const env = {
    API_ALLOWED_ORIGINS: localOrigin,
    API_V1_ENABLED: apiV1Enabled,
    ASSETS: { async fetch() { return new Response('Not found', { status: 404 }) } },
    CLERK_AUTHORIZED_PARTIES: localOrigin,
    CLERK_JWT_KEY: testJwtKey,
    DB: d1,
  }
  if (mediaBucket !== null) {
    env.MEDIA_BUCKET = mediaBucket ?? new MemoryMediaBucket()
  }
  return env
}

function createTestWorker(d1, { apiV1Enabled = 'true', mediaBucket } = {}) {
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
  const env = createEnv(d1, { apiV1Enabled, mediaBucket })

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
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  const result = await fetchAdminCatalogue({
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
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
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  const result = await fetchAdminCatalogue({
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  assert.equal(result.total, 24)
  assert.equal(result.data.length, 24)
})

test('9. canonical API price renders', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  const result = await fetchAdminCatalogue({
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  const nangDiu = result.data.find((p) => p.slug === 'nang-diu')
  assert.ok(nangDiu, 'nang-diu must exist in D1 catalogue')
  assert.equal(nangDiu.priceVnd, 590000, 'nang-diu must have canonical D1 price of 590000 VND (not static 620000)')
})

test('10. no-watering-flower renders as priceless/non-purchasable', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  const result = await fetchAdminCatalogue({
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
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
    getToken: async () => 'some-token',
  })
  assert.equal(cat404.ok, false)
  assert.equal(cat404.data, null)
  assert.equal(cat404.status, 404)
  assert.equal(cat404.error.code, 'API_NOT_FOUND')

  const netErr = await fetchAdminCatalogue({
    fetchImpl: async () => { throw new Error('Network failure') },
    getToken: async () => 'some-token',
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

// --- Phase 18J Archive / Restore Tests ---

test('43. guest archive returns 401 without issuing a request', async () => {
  let fetchCalled = false
  const result = await setAdminProductArchived('nang-diu', true, {
    fetchImpl: async () => {
      fetchCalled = true
      return new Response(null, { status: 500 })
    },
    getToken: async () => null,
  })

  assert.equal(result.status, 401)
  assert.equal(result.error.code, 'AUTHENTICATION_REQUIRED')
  assert.equal(fetchCalled, false)
})

test('44. customer archive returns 403', async () => {
  const { d1 } = createSeededDatabase()
  const testWorker = createTestWorker(d1)
  const result = await setAdminProductArchived('nang-diu', true, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'customer-token',
  })

  assert.equal(result.status, 403)
  assert.equal(result.error.code, 'FORBIDDEN')
})

test('45. admin archives a normal product in D1 without mutating protected product data', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)
  const before = { ...sqlite.prepare(`
    SELECT slug, name, price_vnd, media_json FROM products WHERE id = 'nang-diu'
  `).get() }
  const variantsBefore = sqlite.prepare(`
    SELECT COUNT(*) AS count FROM product_variants WHERE product_id = 'nang-diu'
  `).get().count
  const relationsBefore = sqlite.prepare(`
    SELECT COUNT(*) AS count FROM product_relations
    WHERE product_id = 'nang-diu' OR related_product_id = 'nang-diu'
  `).get().count

  const result = await setAdminProductArchived('nang-diu', true, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  assert.equal(result.ok, true)
  assert.equal(result.product.active, false)
  assert.equal(result.product.isPurchasable, false)
  const after = sqlite.prepare(`
    SELECT active, slug, name, price_vnd, media_json FROM products WHERE id = 'nang-diu'
  `).get()
  assert.equal(after.active, 0)
  assert.deepEqual(
    { slug: after.slug, name: after.name, price_vnd: after.price_vnd, media_json: after.media_json },
    before,
  )
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS count FROM product_variants WHERE product_id = 'nang-diu'`).get().count, variantsBefore)
  assert.equal(sqlite.prepare(`
    SELECT COUNT(*) AS count FROM product_relations
    WHERE product_id = 'nang-diu' OR related_product_id = 'nang-diu'
  `).get().count, relationsBefore)
})

test('46. archived product is hidden publicly but remains visible to Admin', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)
  await setAdminProductArchived('nang-diu', true, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  const publicResponse = await testWorker.fetch('/api/v1/catalogue/products?limit=50')
  const publicBody = JSON.parse(await publicResponse.text())
  assert.equal(publicBody.data.items.some((product) => product.id === 'nang-diu'), false)

  const adminResult = await fetchAdminCatalogue({
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  const archived = adminResult.data.find((product) => product.id === 'nang-diu')
  assert.ok(archived)
  assert.equal(archived.active, false)
  assert.equal(adminResult.total, 24)
})

test('47. admin restores a product and D1 active becomes 1', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  sqlite.prepare(`UPDATE products SET active = 0 WHERE id = 'nang-diu'`).run()
  const testWorker = createTestWorker(d1)

  const result = await setAdminProductArchived('nang-diu', false, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  assert.equal(result.ok, true)
  assert.equal(result.product.active, true)
  assert.equal(result.product.isPurchasable, true)
  assert.equal(sqlite.prepare(`SELECT active FROM products WHERE id = 'nang-diu'`).get().active, 1)
})

test('48. restored product reappears in the public catalogue', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  sqlite.prepare(`UPDATE products SET active = 0 WHERE id = 'nang-diu'`).run()
  const testWorker = createTestWorker(d1)

  await setAdminProductArchived('nang-diu', false, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  const response = await testWorker.fetch('/api/v1/catalogue/products?limit=50')
  const body = JSON.parse(await response.text())
  assert.equal(body.data.items.some((product) => product.id === 'nang-diu'), true)
})

test('49. no-watering-flower archive is rejected server-side', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)
  const result = await setAdminProductArchived('no-watering-flower', true, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  assert.equal(result.status, 400)
  assert.equal(result.error.code, 'PROTECTED_PRODUCT')
})

test('50. no-watering-flower restore is rejected server-side', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)
  const result = await setAdminProductArchived('no-watering-flower', false, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  assert.equal(result.status, 400)
  assert.equal(result.error.code, 'PROTECTED_PRODUCT')
})

test('51. protected product remains unchanged after failed archive and restore attempts', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)
  const before = sqlite.prepare(`SELECT * FROM products WHERE id = 'no-watering-flower'`).get()

  for (const archived of [true, false]) {
    await setAdminProductArchived('no-watering-flower', archived, {
      fetchImpl: (url, opts) => testWorker.fetch(url, opts),
      getToken: async () => 'admin-token',
    })
  }

  const after = sqlite.prepare(`SELECT * FROM products WHERE id = 'no-watering-flower'`).get()
  assert.deepEqual(after, before)
})

test('52. archive of an unknown product returns 404', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)
  const result = await setAdminProductArchived('missing-product', true, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  assert.equal(result.status, 404)
  assert.equal(result.error.code, 'PRODUCT_NOT_FOUND')
})

test('53. fake role and userId cannot bypass archive authorization', async () => {
  const { d1 } = createSeededDatabase()
  const testWorker = createTestWorker(d1)
  const result = await setAdminProductArchived('nang-diu', true, {
    fetchImpl: (url, opts) => testWorker.fetch(`${url}?role=admin&userId=usr_admin_001`, opts),
    getToken: async () => 'customer-token',
  })

  assert.equal(result.status, 403)
  assert.equal(result.error.code, 'FORBIDDEN')
})

test('54. repeated archive and restore operations are idempotent', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)
  for (const archived of [true, true, false, false]) {
    const result = await setAdminProductArchived('nang-diu', archived, {
      fetchImpl: (url, opts) => testWorker.fetch(url, opts),
      getToken: async () => 'admin-token',
    })
    assert.equal(result.ok, true)
    assert.equal(result.product.active, !archived)
  }
})

test('55. guest and customer cannot read the admin catalogue', async () => {
  const { d1 } = createSeededDatabase()
  const testWorker = createTestWorker(d1)
  const guest = await fetchAdminCatalogue({
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => null,
  })
  const customer = await fetchAdminCatalogue({
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'customer-token',
  })

  assert.equal(guest.status, 401)
  assert.equal(customer.status, 403)
})

test('56. unexpected archive persistence errors return a safe 5xx response', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const failingD1 = {
    batch: (...args) => d1.batch(...args),
    prepare(sql) {
      const statement = d1.prepare(sql)
      if (!/UPDATE products\s+SET active/u.test(sql)) return statement
      return {
        bind() {
          return {
            async run() {
              throw new Error('SQLITE_INTERNAL secret-table-name')
            },
          }
        },
      }
    },
  }
  const testWorker = createTestWorker(failingD1)
  const result = await setAdminProductArchived('nang-diu', true, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  assert.equal(result.status, 500)
  assert.equal(result.error.code, 'INTERNAL_ERROR')
  assert.doesNotMatch(result.error.message, /SQLITE|secret-table-name/u)
})

test('57. Admin archive UI confirms destructive visibility change and exposes request states', () => {
  const adminPageCode = fs.readFileSync(path.resolve('src/pages/AdminPage.jsx'), 'utf8')

  assert.match(adminPageCode, /window\.confirm/u)
  assert.match(adminPageCode, /Sản phẩm sẽ biến mất khỏi cửa hàng, nhưng toàn bộ dữ liệu vẫn được giữ lại/u)
  assert.match(adminPageCode, /Đang lưu trữ\.\.\./u)
  assert.match(adminPageCode, /Đang khôi phục\.\.\./u)
  assert.match(adminPageCode, /setSaveSuccess/u)
  assert.match(adminPageCode, /setArchiveError/u)
  assert.match(adminPageCode, /disabled=\{isArchivePending\}/u)
})

test('58. Admin archive UI updates only after canonical server success and protects the Easter egg', () => {
  const adminPageCode = fs.readFileSync(path.resolve('src/pages/AdminPage.jsx'), 'utf8')

  assert.match(adminPageCode, /if \(result\.ok && result\.product\)/u)
  assert.match(adminPageCode, /item\.id === result\.product\.id \? result\.product : item/u)
  assert.match(adminPageCode, /product\.slug === 'no-watering-flower'/u)
  assert.match(adminPageCode, /isProtected \?/u)
  assert.doesNotMatch(adminPageCode, /filter\(.*archive/u)
})

test('59. normal form has Tên sản phẩm and does NOT show Slug định danh (URL) by default', () => {
  const adminPageCode = fs.readFileSync(path.resolve('src/pages/AdminPage.jsx'), 'utf8')

  assert.match(adminPageCode, /Tên sản phẩm <span className="admin-required">\*<\/span>/u)
  assert.doesNotMatch(adminPageCode, /Slug định danh \(URL\)/u, 'Must NOT show Slug định danh (URL) by default')
  assert.match(adminPageCode, /Đường dẫn: <code>\/san-pham\//u, 'Must show clean path preview')
  assert.match(adminPageCode, /Tùy chỉnh đường dẫn/u, 'Must have toggle for custom path')
})

test('60. product name auto-generates Vietnamese-safe slug and renders preview', () => {
  const adminPageCode = fs.readFileSync(path.resolve('src/pages/AdminPage.jsx'), 'utf8')

  assert.match(adminPageCode, /generateSlug\(name\)/u)
  assert.match(adminPageCode, /\/san-pham\/\{createForm\.slug/u)
})

test('61. Tùy chỉnh đường dẫn reveals advanced path control and manual override is preserved', () => {
  const adminPageCode = fs.readFileSync(path.resolve('src/pages/AdminPage.jsx'), 'utf8')

  assert.match(adminPageCode, /showCustomSlug &&/u)
  assert.match(adminPageCode, /<label htmlFor="create-slug">Đường dẫn<\/label>/u)
  assert.match(adminPageCode, /Đường dẫn được tự tạo từ tên sản phẩm\./u)
  assert.match(adminPageCode, /if \(!isSlugManuallyEdited\)/u, 'Must preserve manual edit on name change')
  assert.match(adminPageCode, /Đặt lại theo tên sản phẩm/u, 'Must provide reset action')
})

test('62. normal UI no longer exposes manual image URL text field and uses ProductImageUploader', () => {
  const adminPageCode = fs.readFileSync(path.resolve('src/pages/AdminPage.jsx'), 'utf8')

  assert.doesNotMatch(adminPageCode, /Đường dẫn ảnh chính \(URL hoặc asset\)/u, 'Must not expose manual image URL field')
  assert.match(adminPageCode, /<ProductImageUploader/u, 'Must use ProductImageUploader component')
})

test('63. ProductImageUploader accepts images and provides smooth delete and replace', () => {
  const uploaderCode = fs.readFileSync(path.resolve('src/components/admin/ProductImageUploader.jsx'), 'utf8')

  assert.match(uploaderCode, /accept="image\/jpeg,image\/png,image\/webp"/u)
  assert.match(uploaderCode, /Ảnh sản phẩm/u)
  assert.match(uploaderCode, /\+ Chọn ảnh/u)
  assert.match(uploaderCode, /JPG, PNG hoặc WebP/u)
  assert.match(uploaderCode, /Kéo ảnh vào đây hoặc chọn từ thiết bị/u)
  assert.match(uploaderCode, /Thay ảnh/u)
  assert.match(uploaderCode, /Xóa ảnh/u)
  assert.match(uploaderCode, /Đang tải ảnh\.\.\./u)
  assert.match(uploaderCode, /Đang xóa\.\.\./u)
  assert.match(uploaderCode, /deleteAdminMedia\(previousKey/u, 'Replaces upload before deleting old image')
})

test('64. guest upload to /api/v1/admin/media returns 401', async () => {
  const { d1 } = createSeededDatabase()
  const testWorker = createTestWorker(d1)

  const fakeFile = new Blob(['fake-image-bytes'], { type: 'image/jpeg' })
  const result = await uploadAdminMedia(fakeFile, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
  })

  assert.equal(result.ok, false)
  assert.equal(result.status, 401)
  assert.equal(result.error.code, 'AUTHENTICATION_REQUIRED')
})

test('65. customer upload to /api/v1/admin/media returns 403', async () => {
  const { d1, sqlite } = createSeededDatabase()
  const now = new Date().toISOString()
  sqlite.exec(`
    INSERT INTO users (id, auth_provider, provider_subject, role, status, locale, created_at_utc, updated_at_utc)
    VALUES ('usr_customer_001', 'clerk', 'user_customer_subject', 'customer', 'active', 'vi-VN', '${now}', '${now}')
  `)
  const testWorker = createTestWorker(d1)

  const fakeFile = new Blob(['fake-image-bytes'], { type: 'image/jpeg' })
  const result = await uploadAdminMedia(fakeFile, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'customer-token',
  })

  assert.equal(result.ok, false)
  assert.equal(result.status, 403)
  assert.equal(result.error.code, 'FORBIDDEN')
})

test('66. admin upload succeeds and generates safe storage key and url', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  const fakeFile = new Blob(['fake-jpeg-content-12345'], { type: 'image/jpeg' })
  const result = await uploadAdminMedia(fakeFile, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  assert.equal(result.ok, true)
  assert.equal(result.status, 201)
  assert.ok(result.data.key.startsWith('prod_media_'), 'Key must have safe prod_media_ prefix')
  assert.ok(result.data.key.endsWith('.jpg'), 'Key must have .jpg extension')
  assert.equal(result.data.url, `/api/v1/media/${result.data.key}`)
  assert.equal(result.data.contentType, 'image/jpeg')
  assert.ok(result.data.size > 0)
})

test('67. unsupported MIME type is rejected with 400', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  const fakeExe = new Blob(['fake-exe-content'], { type: 'application/x-msdownload' })
  const result = await uploadAdminMedia(fakeExe, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  assert.equal(result.ok, false)
  assert.equal(result.status, 400)
  assert.equal(result.error.code, 'INVALID_MEDIA_TYPE')
})

test('68. oversized file (>10 MB) is rejected with 400', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  // 11 MB oversized blob
  const bigBuffer = new Uint8Array(11 * 1024 * 1024)
  const bigFile = new Blob([bigBuffer], { type: 'image/png' })

  const result = await uploadAdminMedia(bigFile, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  assert.equal(result.ok, false)
  assert.equal(result.status, 400)
  assert.equal(result.error.code, 'FILE_TOO_LARGE')
})

test('69. public endpoint serves uploaded media with proper headers', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  const testImageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]) // PNG magic bytes
  const fakePng = new Blob([testImageBytes], { type: 'image/png' })
  const uploadResult = await uploadAdminMedia(fakePng, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(uploadResult.ok, true)

  // Public GET (no auth token required!)
  const publicRes = await testWorker.fetch(uploadResult.data.url)
  assert.equal(publicRes.status, 200)
  assert.equal(publicRes.headers.get('Content-Type'), 'image/png')
  assert.equal(publicRes.headers.get('Cache-Control'), 'public, max-age=31536000, immutable')

  const publicBuffer = new Uint8Array(await publicRes.arrayBuffer())
  assert.deepEqual(publicBuffer, testImageBytes)
})

test('70. admin can delete uploaded media', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  const fakeFile = new Blob(['image-to-delete'], { type: 'image/webp' })
  const uploadResult = await uploadAdminMedia(fakeFile, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(uploadResult.ok, true)

  // Delete as admin
  const deleteResult = await deleteAdminMedia(uploadResult.data.key, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(deleteResult.ok, true)
  assert.equal(deleteResult.data.deleted, true)

  // After deletion, public GET should return 404
  const publicRes = await testWorker.fetch(uploadResult.data.url)
  assert.equal(publicRes.status, 404)
})

test('71. guest cannot delete media and customer cannot delete media', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  const guestRes = await deleteAdminMedia('prod_media_sample.jpg', {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
  })
  assert.equal(guestRes.status, 401)

  const customerRes = await deleteAdminMedia('prod_media_sample.jpg', {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'customer-token',
  })
  assert.equal(customerRes.status, 403)
})

test('72. invalid media key deletion returns 400', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  const badKeyRes = await deleteAdminMedia('../etc/passwd', {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(badKeyRes.status, 400)
  assert.equal(badKeyRes.error.code, 'INVALID_MEDIA_KEY')
})

test('73. product creation works with uploaded media URL stored in D1 media_json', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  const fakeFile = new Blob(['uploaded-flower-image'], { type: 'image/jpeg' })
  const uploadResult = await uploadAdminMedia(fakeFile, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(uploadResult.ok, true)

  const createResult = await createAdminProduct({
    imageUrl: uploadResult.data.url,
    name: 'Hoa Hồng Tự Tải',
    priceVnd: 750000,
    slug: 'hoa-hong-tu-tai',
  }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  assert.equal(createResult.ok, true)
  assert.equal(createResult.status, 201)
  assert.equal(createResult.product.media?.[0]?.src, uploadResult.data.url)

  // Inspect D1 directly: only media URL stored, no binary/base64
  const row = sqlite.prepare('SELECT media_json FROM products WHERE slug = ?').get('hoa-hong-tu-tai')
  const media = JSON.parse(row.media_json)
  assert.equal(media[0].src, uploadResult.data.url)
  assert.doesNotMatch(row.media_json, /data:image|base64/u, 'D1 must not store base64 blobs')
})

test('74. no-watering-flower romantic gallery remains untouched and protected', async () => {
  const { sqlite } = createSeededDatabase()
  const rowBefore = sqlite.prepare('SELECT media_json FROM products WHERE id = ?').get('no-watering-flower')
  const mediaBefore = JSON.parse(rowBefore.media_json)

  assert.ok(mediaBefore.length >= 4, 'no-watering-flower must have its full personal gallery')
  assert.ok(mediaBefore.some((m) => m.type === 'video'), 'Gallery must contain video item')
})

test('75. existing Edit/Add/Archive/Restore flows remain intact', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  // Edit price
  const editRes = await updateAdminProduct('nang-diu', { priceVnd: 660000 }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(editRes.ok, true)
  assert.equal(editRes.product.priceVnd, 660000)

  // Archive
  const archiveRes = await setAdminProductArchived('nang-diu', true, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(archiveRes.ok, true)
  assert.equal(archiveRes.product.active, false)

  // Restore
  const restoreRes = await setAdminProductArchived('nang-diu', false, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(restoreRes.ok, true)
  assert.equal(restoreRes.product.active, true)
})

test('76. normal runtime missing MEDIA_BUCKET fails safely and does NOT use volatile memory fallback', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  // Create worker with mediaBucket: null (simulating missing R2 binding in production/runtime)
  const testWorker = createTestWorker(d1, { mediaBucket: null })

  const fakeFile = new Blob(['sample-image-content'], { type: 'image/jpeg' })
  const result = await uploadAdminMedia(fakeFile, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  assert.equal(result.ok, false, 'Must NOT succeed when MEDIA_BUCKET is missing')
  assert.equal(result.status, 503, 'Must return 503 Service Unavailable')
  assert.equal(result.error.code, 'MEDIA_STORAGE_UNAVAILABLE')
  assert.equal(result.error.message, 'Dịch vụ lưu trữ hình ảnh chưa được cấu hình.')
})

test('77. delete operation with missing MEDIA_BUCKET fails safely with 503', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1, { mediaBucket: null })

  const result = await deleteAdminMedia('prod_media_test123.jpg', {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  assert.equal(result.ok, false)
  assert.equal(result.status, 503)
  assert.equal(result.error.code, 'MEDIA_STORAGE_UNAVAILABLE')
})

test('78. public GET with missing MEDIA_BUCKET fails safely with 503', async () => {
  const { d1 } = createSeededDatabase()
  const testWorker = createTestWorker(d1, { mediaBucket: null })

  const res = await testWorker.fetch('/api/v1/media/prod_media_test123.jpg')
  assert.equal(res.status, 503)
  const body = JSON.parse(await res.text())
  assert.equal(body.error.code, 'MEDIA_STORAGE_UNAVAILABLE')
})

test('79. unauthenticated and customer cannot access variants or gift add-ons', async () => {
  const { d1 } = createSeededDatabase()
  const testWorker = createTestWorker(d1)

  // Unauthenticated
  const unauthVariants = await fetchAdminProductVariants('nang-diu', {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => null,
  })
  assert.equal(unauthVariants.ok, false)
  assert.equal(unauthVariants.status, 401)

  const unauthGifts = await fetchAdminGiftAddOns({
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => null,
  })
  assert.equal(unauthGifts.ok, false)
  assert.equal(unauthGifts.status, 401)

  // Customer (403)
  const custVariants = await fetchAdminProductVariants('nang-diu', {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'customer-token',
  })
  assert.equal(custVariants.ok, false)
  assert.equal(custVariants.status, 403)

  const custSaveVariants = await saveAdminProductVariants('nang-diu', [], {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'customer-token',
  })
  assert.equal(custSaveVariants.ok, false)
  assert.equal(custSaveVariants.status, 403)

  const custGifts = await fetchAdminGiftAddOns({
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'customer-token',
  })
  assert.equal(custGifts.ok, false)
  assert.equal(custGifts.status, 403)

  const custCreateGift = await createAdminGiftAddOn({ name: 'Quà thử', priceVnd: 50000 }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'customer-token',
  })
  assert.equal(custCreateGift.ok, false)
  assert.equal(custCreateGift.status, 403)
})

test('80. authorized admin can fetch product variants (sizes and wrapping)', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  const result = await fetchAdminProductVariants('nang-diu', {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  assert.equal(result.ok, true)
  assert.equal(result.status, 200)
  assert.ok(Array.isArray(result.variants))
  assert.ok(result.variants.some((v) => v.optionType === 'size'))
  assert.ok(result.variants.some((v) => v.optionType === 'wrapping'))
})

test('81. authorized admin can save updated sizes and prices', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  const payload = [
    {
      active: true,
      code: 'small',
      label: 'Nhỏ',
      note: '10-12 cành',
      optionType: 'size',
      priceVnd: 450000,
      sortOrder: 0,
    },
    {
      active: true,
      code: 'standard',
      label: 'Tiêu chuẩn',
      note: '15-18 cành',
      optionType: 'size',
      priceVnd: 590000,
      sortOrder: 1,
    },
    {
      active: true,
      code: 'large',
      label: 'Lớn',
      note: '25-30 cành',
      optionType: 'size',
      priceVnd: 850000,
      sortOrder: 2,
    },
  ]

  const result = await saveAdminProductVariants('nang-diu', payload, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  assert.equal(result.ok, true)
  assert.equal(result.status, 200)
  const sizes = result.variants.filter((v) => v.optionType === 'size')
  assert.equal(sizes.length, 3)
  assert.equal(sizes.find((s) => s.code === 'large')?.priceVnd, 850000)

  // Verify in D1 directly
  const d1Rows = sqlite.prepare("SELECT * FROM product_variants WHERE product_id = 'nang-diu' AND option_type = 'size'").all()
  assert.equal(d1Rows.length, 3)
})

test('82. authorized admin can save updated wrapping options', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  const payload = [
    {
      active: true,
      code: 'ivory-matte',
      label: 'Giấy ivory mờ',
      note: 'Thanh lịch, tôn hoa',
      optionType: 'wrapping',
      priceVnd: null,
      sortOrder: 0,
    },
    {
      active: true,
      code: 'pink-ribbon',
      label: 'Ruy băng hồng phấn',
      note: 'Ngọt ngào, nhẹ nhàng',
      optionType: 'wrapping',
      priceVnd: null,
      sortOrder: 1,
    },
  ]

  const result = await saveAdminProductVariants('nang-diu', payload, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  assert.equal(result.ok, true)
  assert.equal(result.status, 200)
  const wrappings = result.variants.filter((v) => v.optionType === 'wrapping')
  assert.equal(wrappings.length, 2)
  assert.equal(wrappings[0].label, 'Giấy ivory mờ')
})

test('83. no-watering-flower rejects variant mutations', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  const result = await saveAdminProductVariants('no-watering-flower', [
    { active: true, code: 'standard', label: 'Tiêu chuẩn', optionType: 'size', priceVnd: 500000 },
  ], {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  assert.equal(result.ok, false)
  assert.equal(result.status, 400)
  assert.equal(result.error.code, 'PROTECTED_PRODUCT')
})

test('84. variant validation rejects invalid option types, negative prices, and empty labels', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  // Invalid optionType
  const res1 = await saveAdminProductVariants('nang-diu', [
    { active: true, code: 'test', label: 'Test', optionType: 'invalid_type', priceVnd: 1000 },
  ], {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(res1.ok, false)
  assert.equal(res1.status, 400)
  assert.equal(res1.error.code, 'INVALID_OPTION_TYPE')

  // Negative price for size
  const res2 = await saveAdminProductVariants('nang-diu', [
    { active: true, code: 'small', label: 'Nhỏ', optionType: 'size', priceVnd: -50000 },
  ], {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(res2.ok, false)
  assert.equal(res2.status, 400)
  assert.equal(res2.error.code, 'INVALID_VARIANT_PRICE')

  // Empty label
  const res3 = await saveAdminProductVariants('nang-diu', [
    { active: true, code: 'small', label: '   ', optionType: 'size', priceVnd: 50000 },
  ], {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(res3.ok, false)
  assert.equal(res3.status, 400)
  assert.equal(res3.error.code, 'INVALID_VARIANT_LABEL')
})

test('85. atomic batch rollback: invalid variant leaves previous variants unchanged', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  const beforeRows = sqlite.prepare("SELECT * FROM product_variants WHERE product_id = 'nang-diu'").all()

  // Attempt batch with 1 valid and 1 invalid
  const res = await saveAdminProductVariants('nang-diu', [
    { active: true, code: 'new-size', label: 'Cỡ mới', optionType: 'size', priceVnd: 990000 },
    { active: true, code: 'bad-size', label: 'Lỗi', optionType: 'size', priceVnd: -1 },
  ], {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(res.ok, false)

  const afterRows = sqlite.prepare("SELECT * FROM product_variants WHERE product_id = 'nang-diu'").all()
  assert.equal(beforeRows.length, afterRows.length, 'No rows should be inserted/modified if batch validation fails')
})

test('86. authorized admin can list, create, edit, and toggle active for gift add-ons', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  // 1. List
  const listRes = await fetchAdminGiftAddOns({
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(listRes.ok, true)
  assert.equal(listRes.status, 200)
  assert.equal(listRes.items.length, 4)

  // 2. Create
  const createRes = await createAdminGiftAddOn({
    active: true,
    name: 'Hộp trà hoa cúc',
    priceVnd: 95000,
    shortDescription: 'Trà thảo mộc thơm dịu',
  }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(createRes.ok, true)
  assert.equal(createRes.status, 201)
  assert.equal(createRes.item.name, 'Hộp trà hoa cúc')
  assert.equal(createRes.item.priceVnd, 95000)

  // 3. Edit
  const editRes = await updateAdminGiftAddOn(createRes.item.id, {
    priceVnd: 105000,
  }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(editRes.ok, true)
  assert.equal(editRes.item.priceVnd, 105000)

  // 4. Toggle active
  const toggleRes = await toggleAdminGiftAddOnActive(createRes.item.id, false, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(toggleRes.ok, true)
  assert.equal(toggleRes.item.active, false)

  const toggleBack = await toggleAdminGiftAddOnActive(createRes.item.id, true, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(toggleBack.ok, true)
  assert.equal(toggleBack.item.active, true)
})

test('86a. gift add-on toggle UI exposes persistence failures and request state', () => {
  const adminPageCode = fs.readFileSync(path.resolve('src/pages/AdminPage.jsx'), 'utf8')

  assert.match(adminPageCode, /setTogglingGiftAddOnId\(item\.id\)/u)
  assert.match(adminPageCode, /if \(result\.ok && result\.item\)/u)
  assert.match(adminPageCode, /setGiftAddOnToggleError\(result\.error\?\.message/u)
  assert.match(adminPageCode, /disabled=\{togglingGiftAddOnId === item\.id\}/u)
})

test('87. gift add-on validation rejects negative prices and requires valid name', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  // Negative price
  const res1 = await createAdminGiftAddOn({ name: 'Quà lỗi', priceVnd: -1000 }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(res1.ok, false)
  assert.equal(res1.status, 400)
  assert.equal(res1.error.code, 'INVALID_PRICE')

  // Empty name
  const res2 = await createAdminGiftAddOn({ name: '   ', priceVnd: 50000 }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(res2.ok, false)
  assert.equal(res2.status, 400)
  assert.equal(res2.error.code, 'INVALID_NAME')

  // Free gift (0 VND) succeeds
  const res3 = await createAdminGiftAddOn({ name: 'Thiệp viết tay đặc biệt', priceVnd: 0 }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(res3.ok, true)
  assert.equal(res3.item.priceVnd, 0)
})

test('88. public GET /api/v1/catalogue/products/:slug returns updated variants and active gift add-ons', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  // Save new size variant
  await saveAdminProductVariants('nang-diu', [
    { active: true, code: 'grand', label: 'Cỡ Đại', optionType: 'size', priceVnd: 1200000 },
  ], {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  // Create active and inactive gift add-on
  await createAdminGiftAddOn({ active: true, name: 'Quà công khai', priceVnd: 70000 }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  await createAdminGiftAddOn({ active: false, name: 'Quà ẩn', priceVnd: 80000 }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })

  // Public GET
  const res = await testWorker.fetch('/api/v1/catalogue/products/nang-diu')
  assert.equal(res.status, 200)
  const body = JSON.parse(await res.text())

  assert.ok(body.data.product.variants.some((v) => v.code === 'grand'), 'Updated variant must be present in public product')
  assert.ok(body.data.giftAddOns.some((g) => g.name === 'Quà công khai'), 'Active gift add-on must be present in public response')
  assert.ok(!body.data.giftAddOns.some((g) => g.name === 'Quà ẩn'), 'Inactive gift add-on must NOT be present in public response')
})

test('89. guest content edit request returns 401', async () => {
  const { d1 } = createSeededDatabase()
  const testWorker = createTestWorker(d1)
  const res = await updateAdminProduct('nang-diu', { shortDescription: 'Mô tả mới' }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => null,
  })
  assert.equal(res.ok, false)
  assert.equal(res.status, 401)
  assert.equal(res.error.code, 'AUTHENTICATION_REQUIRED')
})

test('90. customer content edit request returns 403', async () => {
  const { d1 } = createSeededDatabase()
  const testWorker = createTestWorker(d1)
  const res = await updateAdminProduct('nang-diu', { shortDescription: 'Mô tả mới' }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'customer-token',
  })
  assert.equal(res.ok, false)
  assert.equal(res.status, 403)
  assert.equal(res.error.code, 'FORBIDDEN')
})

test('91. admin edits product name -> updates D1 and response', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)
  const res = await updateAdminProduct('nang-diu', { name: 'Nắng Dịu Ban Mai Tuyệt Đẹp' }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(res.ok, true)
  assert.equal(res.product.name, 'Nắng Dịu Ban Mai Tuyệt Đẹp')
  const row = sqlite.prepare('SELECT name FROM products WHERE id = ?').get('nang-diu')
  assert.equal(row.name, 'Nắng Dịu Ban Mai Tuyệt Đẹp')
})

test('92. admin edits shortDescription -> updates D1 and response', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)
  const res = await updateAdminProduct('nang-diu', { shortDescription: 'Một thiết kế đầy đặn với sắc hồng phấn.' }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(res.ok, true)
  assert.equal(res.product.shortDescription, 'Một thiết kế đầy đặn với sắc hồng phấn.')
  const row = sqlite.prepare('SELECT short_description FROM products WHERE id = ?').get('nang-diu')
  assert.equal(row.short_description, 'Một thiết kế đầy đặn với sắc hồng phấn.')
})

test('93. admin edits description -> updates D1 and response', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)
  const res = await updateAdminProduct('nang-diu', { description: 'Câu chuyện chi tiết về loài hoa mùa hạ.' }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(res.ok, true)
  assert.equal(res.product.description, 'Câu chuyện chi tiết về loài hoa mùa hạ.')
  const row = sqlite.prepare('SELECT description FROM products WHERE id = ?').get('nang-diu')
  assert.equal(row.description, 'Câu chuyện chi tiết về loài hoa mùa hạ.')
})

test('94. admin edits collection -> updates D1 and response', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)
  const res = await updateAdminProduct('nang-diu', { collection: 'Mùa Thu Hà Nội' }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(res.ok, true)
  assert.equal(res.product.collection, 'Mùa Thu Hà Nội')
  const row = sqlite.prepare('SELECT collection FROM products WHERE id = ?').get('nang-diu')
  assert.equal(row.collection, 'Mùa Thu Hà Nội')
})

test('95. admin edits careNote -> updates D1 and response', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)
  const res = await updateAdminProduct('nang-diu', { careNote: 'Để nơi thoáng mát, tránh ánh nắng trực tiếp.' }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(res.ok, true)
  assert.equal(res.product.careNote, 'Để nơi thoáng mát, tránh ánh nắng trực tiếp.')
  const row = sqlite.prepare('SELECT care_note FROM products WHERE id = ?').get('nang-diu')
  assert.equal(row.care_note, 'Để nơi thoáng mát, tránh ánh nắng trực tiếp.')
})

test('96. admin edits deliveryNote -> updates D1 and response', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)
  const res = await updateAdminProduct('nang-diu', { deliveryNote: 'Giao hỏa tốc 2 giờ nội thành.' }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(res.ok, true)
  assert.equal(res.product.deliveryNote, 'Giao hỏa tốc 2 giờ nội thành.')
  const row = sqlite.prepare('SELECT delivery_note FROM products WHERE id = ?').get('nang-diu')
  assert.equal(row.delivery_note, 'Giao hỏa tốc 2 giờ nội thành.')
})

test('97. admin edits internalNote -> updates D1 and response', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)
  const res = await updateAdminProduct('nang-diu', { internalNote: 'Chỉ nhận đặt trước 2 ngày, hoa theo mùa.' }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(res.ok, true)
  assert.equal(res.product.internalNote, 'Chỉ nhận đặt trước 2 ngày, hoa theo mùa.')
  const row = sqlite.prepare('SELECT internal_note FROM products WHERE id = ?').get('nang-diu')
  assert.equal(row.internal_note, 'Chỉ nhận đặt trước 2 ngày, hoa theo mùa.')
})

test('98. admin edits composition -> updates D1 and response', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)
  const res = await updateAdminProduct('nang-diu', { composition: ['Hoa hồng Ohara', 'Hoa baby', 'Lá bạc'] }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(res.ok, true)
  assert.deepEqual(res.product.composition, ['Hoa hồng Ohara', 'Hoa baby', 'Lá bạc'])
  const row = sqlite.prepare('SELECT composition_json FROM products WHERE id = ?').get('nang-diu')
  assert.deepEqual(JSON.parse(row.composition_json), ['Hoa hồng Ohara', 'Hoa baby', 'Lá bạc'])
})

test('99. admin edits occasions -> updates D1 and response', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)
  const res = await updateAdminProduct('nang-diu', { occasions: ['Sinh nhật', 'Kỷ niệm'] }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(res.ok, true)
  assert.deepEqual(res.product.occasions, ['Sinh nhật', 'Kỷ niệm'])
  const row = sqlite.prepare('SELECT occasions_json FROM products WHERE id = ?').get('nang-diu')
  assert.deepEqual(JSON.parse(row.occasions_json), ['Sinh nhật', 'Kỷ niệm'])
})

test('100. admin edits moods -> updates D1 and response', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)
  const res = await updateAdminProduct('nang-diu', { moods: ['Lãng mạn', 'Dịu dàng'] }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(res.ok, true)
  assert.deepEqual(res.product.moods, ['Lãng mạn', 'Dịu dàng'])
  const row = sqlite.prepare('SELECT moods_json FROM products WHERE id = ?').get('nang-diu')
  assert.deepEqual(JSON.parse(row.moods_json), ['Lãng mạn', 'Dịu dàng'])
})

test('101. admin edits colors -> updates D1 and response', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)
  const res = await updateAdminProduct('nang-diu', { colors: ['Hồng phấn', 'Trắng kem'] }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(res.ok, true)
  assert.deepEqual(res.product.colors, ['Hồng phấn', 'Trắng kem'])
  const row = sqlite.prepare('SELECT colors_json FROM products WHERE id = ?').get('nang-diu')
  assert.deepEqual(JSON.parse(row.colors_json), ['Hồng phấn', 'Trắng kem'])
})

test('102. public GET /api/v1/catalogue/products does NOT contain internalNote', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)
  await updateAdminProduct('nang-diu', { internalNote: 'GHI CHÚ TUYỆT MẬT NỘI BỘ' }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  const res = await testWorker.fetch('/api/v1/catalogue/products')
  assert.equal(res.status, 200)
  const body = JSON.parse(await res.text())
  const nangDiu = body.data.items.find((p) => p.slug === 'nang-diu')
  assert.ok(nangDiu)
  assert.equal('internalNote' in nangDiu, false, 'Public product item must NOT contain internalNote property')
  assert.equal('internal_note' in nangDiu, false, 'Public product item must NOT contain internal_note property')
  assert.equal(JSON.stringify(body).includes('GHI CHÚ TUYỆT MẬT NỘI BỘ'), false, 'Public catalogue list must not contain internal note text')
})

test('103. public GET /api/v1/catalogue/products/:slug does NOT contain internalNote', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)
  await updateAdminProduct('nang-diu', { internalNote: 'GHI CHÚ TUYỆT MẬT NỘI BỘ' }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  const res = await testWorker.fetch('/api/v1/catalogue/products/nang-diu')
  assert.equal(res.status, 200)
  const body = JSON.parse(await res.text())
  const product = body.data.product
  assert.ok(product)
  assert.equal('internalNote' in product, false, 'Public product detail must NOT contain internalNote property')
  assert.equal('internal_note' in product, false, 'Public product detail must NOT contain internal_note property')
  assert.equal(JSON.stringify(body).includes('GHI CHÚ TUYỆT MẬT NỘI BỘ'), false, 'Public catalogue detail response must not contain internal note text')
})

test('104. ProductDetailPage renders updated shortDescription', () => {
  const pageCode = fs.readFileSync(path.resolve('src/pages/ProductDetailPage.jsx'), 'utf8')
  assert.match(pageCode, /product\.shortDescription\s*\|\|\s*product\.description/u, 'ProductDetailPage must prioritize shortDescription for story text')
})

test('105. ProductDetailPage does NOT render internalNote anywhere', () => {
  const pageCode = fs.readFileSync(path.resolve('src/pages/ProductDetailPage.jsx'), 'utf8')
  assert.equal(/internalNote/u.test(pageCode), false, 'ProductDetailPage must never reference internalNote')
  assert.equal(/internal_note/u.test(pageCode), false, 'ProductDetailPage must never reference internal_note')
})

test('106. validation rejects oversized shortDescription (> 320 chars) with 400', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)
  const oversized = 'A'.repeat(321)
  const res = await updateAdminProduct('nang-diu', { shortDescription: oversized }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(res.ok, false)
  assert.equal(res.status, 400)
  assert.equal(res.error.code, 'INVALID_PAYLOAD')
})

test('107. validation rejects oversized description (> 1200 chars) with 400', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)
  const oversized = 'B'.repeat(1201)
  const res = await updateAdminProduct('nang-diu', { description: oversized }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(res.ok, false)
  assert.equal(res.status, 400)
  assert.equal(res.error.code, 'INVALID_PAYLOAD')
})

test('108. validation rejects oversized notes (> 800 chars) with 400', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)
  const oversized = 'C'.repeat(801)

  const res1 = await updateAdminProduct('nang-diu', { internalNote: oversized }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(res1.ok, false)
  assert.equal(res1.status, 400)
  assert.equal(res1.error.code, 'INVALID_PAYLOAD')

  const res2 = await updateAdminProduct('nang-diu', { careNote: oversized }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(res2.ok, false)
  assert.equal(res2.status, 400)
  assert.equal(res2.error.code, 'INVALID_PAYLOAD')

  const res3 = await updateAdminProduct('nang-diu', { deliveryNote: oversized }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(res3.ok, false)
  assert.equal(res3.status, 400)
  assert.equal(res3.error.code, 'INVALID_PAYLOAD')
})

test('109. validation rejects malformed arrays for tags/metadata with 400', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  const res1 = await updateAdminProduct('nang-diu', { composition: 'not-an-array' }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(res1.ok, false)
  assert.equal(res1.status, 400)
  assert.equal(res1.error.code, 'INVALID_PAYLOAD')

  const res2 = await updateAdminProduct('nang-diu', { occasions: [123, null] }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(res2.ok, false)
  assert.equal(res2.status, 400)
  assert.equal(res2.error.code, 'INVALID_PAYLOAD')
})

test('110. content edit on unknown product returns 404', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)
  const res = await updateAdminProduct('san-pham-khong-ton-tai', { shortDescription: 'Mới' }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(res.ok, false)
  assert.equal(res.status, 404)
  assert.equal(res.error.code, 'PRODUCT_NOT_FOUND')
})

test('111. content edit on archived product keeps active = 0 (does NOT silently restore)', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  await setAdminProductArchived('nang-diu', true, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  const rowBefore = sqlite.prepare('SELECT active FROM products WHERE id = ?').get('nang-diu')
  assert.equal(rowBefore.active, 0)

  const res = await updateAdminProduct('nang-diu', { shortDescription: 'Cập nhật sản phẩm lưu trữ' }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(res.ok, true)
  assert.equal(res.product.active, false)
  const rowAfter = sqlite.prepare('SELECT active FROM products WHERE id = ?').get('nang-diu')
  assert.equal(rowAfter.active, 0, 'Active state must remain 0 after content edit')
})

test('112. content edit does NOT alter media, sizes, wrapping, or gift add-ons', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  const beforeProduct = sqlite.prepare('SELECT media_json FROM products WHERE id = ?').get('nang-diu')
  const beforeVariants = sqlite.prepare('SELECT * FROM product_variants WHERE product_id = ?').all('nang-diu')
  const beforeGifts = sqlite.prepare('SELECT * FROM gift_add_ons').all()

  const res = await updateAdminProduct('nang-diu', {
    internalNote: 'Ghi chú mới',
    name: 'Nắng Dịu Đổi Tên',
    shortDescription: 'Mô tả ngắn mới',
  }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(res.ok, true)

  const afterProduct = sqlite.prepare('SELECT media_json FROM products WHERE id = ?').get('nang-diu')
  const afterVariants = sqlite.prepare('SELECT * FROM product_variants WHERE product_id = ?').all('nang-diu')
  const afterGifts = sqlite.prepare('SELECT * FROM gift_add_ons').all()

  assert.equal(beforeProduct.media_json, afterProduct.media_json, 'Media must remain untouched')
  assert.deepEqual(beforeVariants, afterVariants, 'Variants must remain untouched')
  assert.deepEqual(beforeGifts, afterGifts, 'Gift add-ons must remain untouched')
})

test('113. invariant protection: no-watering-flower preserves priceless and protected identity while allowing content/internal notes', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  const res = await updateAdminProduct('no-watering-flower', {
    careNote: 'Không cần tưới nước, chỉ cần sự chân thành.',
    internalNote: 'Tác phẩm nghệ thuật đặc biệt, không bán thương mại.',
  }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(res.ok, true)
  assert.equal(res.product.purchaseType, 'priceless')
  assert.equal(res.product.priceVnd, null)
  assert.equal(res.product.isPurchasable, false)
  assert.equal(res.product.internalNote, 'Tác phẩm nghệ thuật đặc biệt, không bán thương mại.')

  const row = sqlite.prepare('SELECT price_vnd, purchase_type, internal_note FROM products WHERE id = ?').get('no-watering-flower')
  assert.equal(row.price_vnd, null)
  assert.equal(row.purchase_type, 'priceless')
  assert.equal(row.internal_note, 'Tác phẩm nghệ thuật đặc biệt, không bán thương mại.')

  const badRes = await updateAdminProduct('no-watering-flower', {
    priceVnd: 500000,
    shortDescription: 'Cố gắng đặt giá',
  }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(badRes.ok, false)
  assert.equal(badRes.status, 400)
  assert.equal(badRes.error.code, 'PROTECTED_PRODUCT')
})

test('114. admin media edit persists through D1 and all fresh catalogue reads', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)

  const createResult = await createAdminProduct({
    name: 'Media Persistence Test',
    priceVnd: 123000,
    slug: 'media-persistence-test',
  }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(createResult.ok, true)

  const uploadResult = await uploadAdminMedia(new Blob(['fresh-image'], { type: 'image/png' }), {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(uploadResult.ok, true)

  const updateResult = await updateAdminProduct(createResult.product.id, {
    imageUrl: uploadResult.data.url,
  }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(updateResult.ok, true)
  assert.equal(updateResult.product.media[0].src, uploadResult.data.url)

  const row = sqlite.prepare('SELECT media_json FROM products WHERE id = ?').get(createResult.product.id)
  assert.equal(JSON.parse(row.media_json)[0].src, uploadResult.data.url)

  const adminRead = await fetchAdminCatalogue({
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(adminRead.ok, true)
  assert.equal(adminRead.data.find((product) => product.id === createResult.product.id).media[0].src, uploadResult.data.url)

  const publicList = await testWorker.fetch('/api/v1/catalogue/products?limit=50')
  const publicListBody = await publicList.json()
  assert.equal(publicListBody.data.items.find((product) => product.slug === 'media-persistence-test').media[0].src, uploadResult.data.url)

  const publicDetail = await testWorker.fetch('/api/v1/catalogue/products/media-persistence-test')
  const publicDetailBody = await publicDetail.json()
  assert.equal(publicDetailBody.data.product.media[0].src, uploadResult.data.url)

  const mediaRead = await testWorker.fetch(uploadResult.data.url)
  assert.equal(mediaRead.status, 200)
  assert.equal(mediaRead.headers.get('content-type'), 'image/png')

  const clearResult = await updateAdminProduct(createResult.product.id, { imageUrl: '' }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(clearResult.ok, true)
  assert.deepEqual(clearResult.product.media, [])
  await deleteAdminMedia(uploadResult.data.key, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
})

test('115. media edit rejects missing or malformed R2 references without changing D1', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)
  const before = sqlite.prepare('SELECT media_json FROM products WHERE id = ?').get('nang-diu').media_json

  const missing = await updateAdminProduct('nang-diu', { imageUrl: '/api/v1/media/prod_media_missing.jpg' }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(missing.ok, false)
  assert.equal(missing.status, 400)
  assert.equal(missing.error.code, 'MEDIA_NOT_FOUND')

  const malformed = await updateAdminProduct('nang-diu', { imageUrl: '/api/v1/media/../../escape.jpg' }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(malformed.ok, false)
  assert.equal(malformed.status, 400)
  assert.equal(malformed.error.code, 'INVALID_MEDIA_URL')
  assert.equal(sqlite.prepare('SELECT media_json FROM products WHERE id = ?').get('nang-diu').media_json, before)
})

test('116. media edit endpoint remains Admin-only', async () => {
  const { d1 } = createSeededDatabase()
  const testWorker = createTestWorker(d1)

  const guest = await updateAdminProduct('nang-diu', { imageUrl: '' }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => null,
  })
  assert.equal(guest.status, 401)

  const customer = await updateAdminProduct('nang-diu', { imageUrl: '' }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'customer-token',
  })
  assert.equal(customer.status, 403)
})

test('117. Admin edit UI stages media and claims success only after product PATCH', () => {
  const pageCode = fs.readFileSync(path.resolve('src/pages/AdminPage.jsx'), 'utf8')
  const uploaderCode = fs.readFileSync(path.resolve('src/components/admin/ProductImageUploader.jsx'), 'utf8')

  assert.match(pageCode, /deferDelete/u)
  assert.match(pageCode, /payload\.imageUrl = editForm\.imageUrl/u)
  assert.match(pageCode, /cleanupAdminMediaKeys\(editForm\.mediaCleanupKeys\)/u)
  assert.match(pageCode, /cleanupAdminMediaKeys\(editForm\.stagedMediaKeys\)/u)
  assert.match(uploaderCode, /previousKey/u)
  assert.match(uploaderCode, /if \(!deferDelete && previousKey/u)
})

test('118. protected no-watering-flower media cannot be replaced through Admin API', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedAdminUser(sqlite)
  const testWorker = createTestWorker(d1)
  const before = sqlite.prepare('SELECT media_json FROM products WHERE id = ?').get('no-watering-flower').media_json

  const result = await updateAdminProduct('no-watering-flower', { imageUrl: '' }, {
    fetchImpl: (url, opts) => testWorker.fetch(url, opts),
    getToken: async () => 'admin-token',
  })
  assert.equal(result.ok, false)
  assert.equal(result.status, 400)
  assert.equal(result.error.code, 'PROTECTED_PRODUCT')
  assert.equal(sqlite.prepare('SELECT media_json FROM products WHERE id = ?').get('no-watering-flower').media_json, before)
})

test('119. Admin order detail localizes canonical values and wraps long fulfilment text', () => {
  const pageCode = fs.readFileSync(path.resolve('src/pages/AdminPage.jsx'), 'utf8')
  const pageCss = fs.readFileSync(path.resolve('src/pages/AdminPage.css'), 'utf8')

  assert.match(pageCode, /formatDeliverySlot\(selectedOrderDetail\.delivery/u)
  assert.match(pageCode, /formatPaymentMethod\(selectedOrderDetail\.payment\?\.method \?\? selectedOrderDetail\.paymentMethod\)/u)
  assert.match(pageCode, /formatOrderAuditEvent\(event\)/u)
  assert.doesNotMatch(pageCode, /Audit Trail/u)
  assert.match(pageCss, /\.admin-order-card p\s*\{[^}]*overflow-wrap:\s*anywhere;/su)
  assert.match(pageCss, /\.admin-order-gift-message\s*\{[^}]*white-space:\s*pre-wrap;/su)
  assert.match(pageCss, /\.admin-order-audit-desc\s*\{[^}]*overflow-wrap:\s*anywhere;/su)
  assert.match(pageCss, /\.admin-modal-backdrop\s*\{[^}]*align-items:\s*flex-start;/su)
  assert.match(pageCss, /\.admin-modal--order-detail \.admin-order-code-header\s*\{[^}]*white-space:\s*nowrap;/su)
  assert.match(pageCss, /@media \(max-width: 640px\)[\s\S]*\.admin-order-audit-item\s*\{\s*grid-template-columns:\s*1fr;/u)
})
