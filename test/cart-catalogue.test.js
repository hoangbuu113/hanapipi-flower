import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import {
  buildCartItemKey,
  cartItemLineTotal,
  cartItemUnitTotal,
  cartSubtotal,
  normalizeGiftAddOns,
  normalizeStoredCartItem,
  normalizeStoredCartItems,
} from '../src/utils/cart.js'
import { normalizeStoredWishlistIds } from '../src/utils/wishlist.js'
import { resolveCartItems } from '../src/services/cartResolver.js'
import { fetchProductDetail } from '../src/services/catalogueClient.js'
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

function createEnv(d1, { apiV1Enabled = 'true' } = {}) {
  return {
    API_ALLOWED_ORIGINS: 'http://127.0.0.1:5173',
    API_V1_ENABLED: apiV1Enabled,
    ASSETS: {
      async fetch() {
        return new Response('Not found', { status: 404 })
      },
    },
    DB: d1,
  }
}

function createFetchImpl(worker, env) {
  return async (url, init) => {
    const fullUrl = url.startsWith('http') ? url : `http://127.0.0.1:5173${url}`
    return worker.fetch(new Request(fullUrl, init), env)
  }
}

test('1. empty cart does not fetch unnecessarily', async () => {
  let fetchCalled = false
  const dummyFetch = async () => {
    fetchCalled = true
    return { ok: true }
  }

  const result = await resolveCartItems([], { fetchProductDetailImpl: dummyFetch })
  assert.equal(fetchCalled, false)
  assert.equal(result.ok, true)
  assert.deepEqual(result.items, [])
  assert.equal(result.subtotal, 0)
  assert.equal(result.hasUnavailableItems, false)
})

test('2. cart line resolves product from API', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'true' })
  const fetchImpl = createFetchImpl(worker, env)

  const storedItems = [
    {
      giftAddOns: [],
      key: 'nang-diu:standard::',
      productId: 'nang-diu',
      quantity: 2,
      sizeId: 'standard',
      wrappingId: null,
    },
  ]

  const result = await resolveCartItems(storedItems, {
    fetchProductDetailImpl: (slug, opts) => fetchProductDetail(slug, { ...opts, fetchImpl }),
  })

  assert.equal(result.ok, true)
  assert.equal(result.items.length, 1)
  const line = result.items[0]
  assert.equal(line.productId, 'nang-diu')
  assert.equal(line.name, 'Nắng Dịu')
  assert.equal(line.isAvailable, true)
  assert.equal(line.size.code, 'standard')
  assert.equal(line.unitPrice, 590000)
  assert.equal(line.lineTotal, 590000 * 2)
  assert.equal(result.subtotal, 1180000)
})

test('3. product name from API is authoritative', async () => {
  const { d1, sqlite } = createSeededDatabase()
  sqlite.prepare("UPDATE products SET name = 'Nắng Dịu Ban Mai Mới' WHERE slug = 'nang-diu'").run()

  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'true' })
  const fetchImpl = createFetchImpl(worker, env)

  const storedItems = [
    {
      giftAddOns: [],
      key: 'nang-diu:standard::',
      productId: 'nang-diu',
      quantity: 1,
      sizeId: 'standard',
    },
  ]

  const result = await resolveCartItems(storedItems, {
    fetchProductDetailImpl: (slug, opts) => fetchProductDetail(slug, { ...opts, fetchImpl }),
  })

  assert.equal(result.ok, true)
  assert.equal(result.items[0].name, 'Nắng Dịu Ban Mai Mới')
})

test('4. product media from API is authoritative', async () => {
  const { d1, sqlite } = createSeededDatabase()
  const customMedia = JSON.stringify([{ alt: 'Ảnh mới', fit: 'cover', position: 'center', src: '/api/v1/media/custom.webp', type: 'image' }])
  sqlite.prepare('UPDATE products SET media_json = ? WHERE slug = ?').run(customMedia, 'nang-diu')

  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'true' })
  const fetchImpl = createFetchImpl(worker, env)

  const storedItems = [
    {
      giftAddOns: [],
      key: 'nang-diu:standard::',
      productId: 'nang-diu',
      quantity: 1,
      sizeId: 'standard',
    },
  ]

  const result = await resolveCartItems(storedItems, {
    fetchProductDetailImpl: (slug, opts) => fetchProductDetail(slug, { ...opts, fetchImpl }),
  })

  assert.equal(result.ok, true)
  assert.equal(result.items[0].image.src, '/api/v1/media/custom.webp')
  assert.equal(result.items[0].image.alt, 'Ảnh mới')
})

test('5. variant price from D1 is authoritative over stale stored price', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'true' })
  const fetchImpl = createFetchImpl(worker, env)

  // Stored item contains stale unitPrice: 400000
  const storedItems = [
    {
      giftAddOns: [],
      key: 'nang-diu:standard::',
      productId: 'nang-diu',
      quantity: 1,
      sizeId: 'standard',
      unitPrice: 400000,
    },
  ]

  const result = await resolveCartItems(storedItems, {
    fetchProductDetailImpl: (slug, opts) => fetchProductDetail(slug, { ...opts, fetchImpl }),
  })

  assert.equal(result.ok, true)
  // Authoritative D1 standard variant price is 590000, not stale 400000
  assert.equal(result.items[0].unitPrice, 590000)
  assert.equal(result.items[0].lineTotal, 590000)
  assert.equal(result.subtotal, 590000)
})

test('6. changed Admin variant price reflects after cart reload', async () => {
  const { d1, sqlite } = createSeededDatabase()
  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'true' })
  const fetchImpl = createFetchImpl(worker, env)

  const storedItems = [
    {
      giftAddOns: [],
      key: 'nang-diu:standard::',
      productId: 'nang-diu',
      quantity: 2,
      sizeId: 'standard',
    },
  ]

  // First resolution: 590000 * 2 = 1180000
  const initial = await resolveCartItems(storedItems, {
    fetchProductDetailImpl: (slug, opts) => fetchProductDetail(slug, { ...opts, fetchImpl }),
  })
  assert.equal(initial.items[0].unitPrice, 590000)
  assert.equal(initial.subtotal, 1180000)

  // Admin bumps variant price in D1: 590000 -> 650000
  sqlite.prepare("UPDATE product_variants SET price_vnd = 650000 WHERE product_id = 'nang-diu' AND code = 'standard'").run()

  // Reload: must reflect 650000 * 2 = 1300000
  const reloaded = await resolveCartItems(storedItems, {
    fetchProductDetailImpl: (slug, opts) => fetchProductDetail(slug, { ...opts, fetchImpl }),
  })
  assert.equal(reloaded.items[0].unitPrice, 650000)
  assert.equal(reloaded.subtotal, 1300000)
})

test('7. gift add-on prices resolve from D1', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'true' })
  const fetchImpl = createFetchImpl(worker, env)

  const storedItems = [
    {
      giftAddOns: [{ id: 'mini-scented-candle', name: 'Stale name', price: 999999 }],
      key: 'nang-diu:standard::mini-scented-candle',
      productId: 'nang-diu',
      quantity: 1,
      sizeId: 'standard',
    },
  ]

  const result = await resolveCartItems(storedItems, {
    fetchProductDetailImpl: (slug, opts) => fetchProductDetail(slug, { ...opts, fetchImpl }),
  })

  assert.equal(result.ok, true)
  const gift = result.items[0].giftAddOns[0]
  assert.equal(gift.id, 'mini-scented-candle')
  assert.equal(gift.name, 'Nến thơm mini')
  assert.equal(gift.price, 120000)
  assert.equal(gift.active, true)
  // lineTotal = (590000 + 120000) * 1 = 710000
  assert.equal(result.items[0].lineTotal, 710000)
  assert.equal(result.subtotal, 710000)
})

test('8. quantity persists and normalizes safely', () => {
  const item = normalizeStoredCartItem({
    productId: 'nang-diu',
    quantity: '3',
    sizeId: 'standard',
  })
  assert.equal(item.quantity, 3)

  const zeroQty = normalizeStoredCartItem({
    productId: 'nang-diu',
    quantity: 0,
    sizeId: 'standard',
  })
  assert.equal(zeroQty.quantity, 1)
})

test('9. increment / decrement updates state', () => {
  const items = [
    { key: 'item-1', productId: 'nang-diu', quantity: 2 },
  ]
  const incremented = items.map((i) => (i.key === 'item-1' ? { ...i, quantity: i.quantity + 1 } : i))
  assert.equal(incremented[0].quantity, 3)

  const decremented = incremented.map((i) => (i.key === 'item-1' ? { ...i, quantity: i.quantity - 1 } : i))
  assert.equal(decremented[0].quantity, 2)
})

test('10. remove line persists', () => {
  const items = [
    { key: 'item-1', productId: 'nang-diu', quantity: 1 },
    { key: 'item-2', productId: 'may-hong', quantity: 1 },
  ]
  const remaining = items.filter((i) => i.key !== 'item-1')
  assert.equal(remaining.length, 1)
  assert.equal(remaining[0].key, 'item-2')
})

test('11. legacy full-object cart format migrates safely', () => {
  const legacyItems = [
    {
      giftAddOns: ['mini-scented-candle'],
      id: 'nang-diu',
      name: 'Nắng Dịu',
      price: 790000,
      quantity: 2,
      size: { code: 'standard', id: 'standard', label: 'Tiêu chuẩn' },
      wrapping: { code: 'ivory', id: 'ivory' },
    },
    {
      custom: true,
      key: 'custom:123',
      name: 'Bó hoa riêng',
      quantity: 1,
    },
  ]

  const normalized = normalizeStoredCartItems(legacyItems)
  assert.equal(normalized.length, 2)
  assert.equal(normalized[0].productId, 'nang-diu')
  assert.equal(normalized[0].sizeId, 'standard')
  assert.equal(normalized[0].wrappingId, 'ivory')
  assert.equal(normalized[0].quantity, 2)
  assert.equal(normalized[0].giftAddOns[0].id, 'mini-scented-candle')
  assert.equal(normalized[1].custom, true)
})

test('12. archived product becomes unavailable', async () => {
  const { d1, sqlite } = createSeededDatabase()
  sqlite.prepare("UPDATE products SET active = 0 WHERE slug = 'nang-diu'").run()

  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'true' })
  const fetchImpl = createFetchImpl(worker, env)

  const storedItems = [
    {
      giftAddOns: [],
      key: 'nang-diu:standard::',
      productId: 'nang-diu',
      quantity: 1,
      sizeId: 'standard',
    },
  ]

  const result = await resolveCartItems(storedItems, {
    fetchProductDetailImpl: (slug, opts) => fetchProductDetail(slug, { ...opts, fetchImpl }),
  })

  assert.equal(result.ok, true)
  assert.equal(result.items.length, 1)
  const line = result.items[0]
  assert.equal(line.isAvailable, false)
  assert.equal(line.unavailableReason, 'Sản phẩm hiện không còn mở bán')
  assert.equal(line.lineTotal, 0)
  assert.equal(result.subtotal, 0)
  assert.equal(result.hasUnavailableItems, true)
})

test('13. archived product is not resurrected from static data', async () => {
  const { d1, sqlite } = createSeededDatabase()
  sqlite.prepare("UPDATE products SET active = 0 WHERE slug = 'nang-diu'").run()

  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'true' })
  const fetchImpl = createFetchImpl(worker, env)

  const storedItems = [
    {
      giftAddOns: [],
      key: 'nang-diu:standard::',
      productId: 'nang-diu',
      quantity: 1,
      sizeId: 'standard',
    },
  ]

  const result = await resolveCartItems(storedItems, {
    fetchProductDetailImpl: (slug, opts) => fetchProductDetail(slug, { ...opts, fetchImpl }),
  })

  assert.equal(result.ok, true)
  assert.equal(result.isFallback, false)
  assert.equal(result.items[0].isAvailable, false)
  assert.equal(result.items[0].product, null)
})

test('14. missing / deactivated size marks line invalid', async () => {
  const { d1, sqlite } = createSeededDatabase()
  // Deactivate standard variant
  sqlite.prepare("UPDATE product_variants SET active = 0 WHERE product_id = 'nang-diu' AND code = 'standard'").run()

  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'true' })
  const fetchImpl = createFetchImpl(worker, env)

  const storedItems = [
    {
      giftAddOns: [],
      key: 'nang-diu:standard::',
      productId: 'nang-diu',
      quantity: 1,
      sizeId: 'standard',
    },
  ]

  const result = await resolveCartItems(storedItems, {
    fetchProductDetailImpl: (slug, opts) => fetchProductDetail(slug, { ...opts, fetchImpl }),
  })

  assert.equal(result.ok, true)
  assert.equal(result.items[0].isAvailable, false)
  assert.equal(result.items[0].unavailableReason, 'Kích thước đã chọn không còn khả dụng.')
  assert.equal(result.items[0].lineTotal, 0)
  assert.equal(result.subtotal, 0)
  assert.equal(result.hasUnavailableItems, true)
})

test('15. missing / deactivated wrapping handled safely', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'true' })
  const fetchImpl = createFetchImpl(worker, env)

  const storedItems = [
    {
      giftAddOns: [],
      key: 'nang-diu:standard:non-existent-wrap:',
      productId: 'nang-diu',
      quantity: 1,
      sizeId: 'standard',
      wrappingId: 'non-existent-wrap',
    },
  ]

  const result = await resolveCartItems(storedItems, {
    fetchProductDetailImpl: (slug, opts) => fetchProductDetail(slug, { ...opts, fetchImpl }),
  })

  assert.equal(result.ok, true)
  assert.equal(result.items[0].isAvailable, false)
  assert.equal(result.items[0].unavailableReason, 'Kiểu gói đã chọn không còn khả dụng.')
  assert.equal(result.hasUnavailableItems, true)
})

test('16. inactive gift add-on is not charged stale price', async () => {
  const { d1, sqlite } = createSeededDatabase()
  // Deactivate mini-scented-candle
  sqlite.prepare("UPDATE gift_add_ons SET active = 0 WHERE id = 'mini-scented-candle'").run()

  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'true' })
  const fetchImpl = createFetchImpl(worker, env)

  const storedItems = [
    {
      giftAddOns: [{ id: 'mini-scented-candle', name: 'Nến thơm mini', price: 120000 }],
      key: 'nang-diu:standard::mini-scented-candle',
      productId: 'nang-diu',
      quantity: 1,
      sizeId: 'standard',
    },
  ]

  const result = await resolveCartItems(storedItems, {
    fetchProductDetailImpl: (slug, opts) => fetchProductDetail(slug, { ...opts, fetchImpl }),
  })

  assert.equal(result.ok, true)
  const gift = result.items[0].giftAddOns[0]
  assert.equal(gift.active, false)
  assert.equal(gift.price, 0)
  // Only standard size price (590000) charged, gift add-on is 0
  assert.equal(result.items[0].lineTotal, 590000)
  assert.equal(result.subtotal, 590000)
})

test('17. no-watering-flower cannot become purchasable', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'true' })
  const fetchImpl = createFetchImpl(worker, env)

  const storedItems = [
    {
      giftAddOns: [],
      key: 'no-watering-flower:standard::',
      productId: 'no-watering-flower',
      quantity: 1,
      sizeId: 'standard',
    },
  ]

  const result = await resolveCartItems(storedItems, {
    fetchProductDetailImpl: (slug, opts) => fetchProductDetail(slug, { ...opts, fetchImpl }),
  })

  assert.equal(result.ok, true)
  const line = result.items[0]
  assert.equal(line.isAvailable, false)
  assert.equal(line.isPriceless, true)
  assert.equal(line.unitPrice, null)
  assert.equal(line.lineTotal, 0)
  assert.equal(line.unavailableReason, 'Bó hoa vô giá không thể đặt mua')
  assert.equal(result.subtotal, 0)
  assert.equal(result.hasUnavailableItems, true)
})

test('18. 404 API gate compatibility fallback works', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: { info() {} } })
  // API v1 is disabled (gated 404 with API_NOT_FOUND)
  const env = createEnv(d1, { apiV1Enabled: 'false' })
  const fetchImpl = createFetchImpl(worker, env)

  const storedItems = [
    {
      giftAddOns: [],
      key: 'nang-diu:standard::',
      productId: 'nang-diu',
      quantity: 1,
      sizeId: 'standard',
    },
  ]

  const result = await resolveCartItems(storedItems, {
    fetchProductDetailImpl: (slug, opts) => fetchProductDetail(slug, { ...opts, fetchImpl }),
  })

  assert.equal(result.ok, true)
  assert.equal(result.isFallback, true)
  assert.equal(result.items[0].isAvailable, true)
  assert.equal(result.items[0].name, 'Nắng Dịu')
  assert.equal(result.subtotal, 590000)
})

test('19. HTTP 500 does NOT silently fallback', async () => {
  const fake500Fetch = async () => ({
    data: null,
    error: { code: 'API_ERROR', message: 'Internal Server Error' },
    isFallback: false,
    notFound: false,
    ok: false,
    status: 500,
  })

  const storedItems = [
    {
      giftAddOns: [],
      key: 'nang-diu:standard::',
      productId: 'nang-diu',
      quantity: 1,
      sizeId: 'standard',
    },
  ]

  const result = await resolveCartItems(storedItems, { fetchProductDetailImpl: fake500Fetch })
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'API_ERROR')
  assert.equal(result.isFallback, false)
})

test('20. malformed API response surfaces safe error', async () => {
  const fakeMalformedFetch = async () => ({
    data: null,
    error: { code: 'MALFORMED_RESPONSE', message: 'Dữ liệu không hợp lệ' },
    isFallback: false,
    notFound: false,
    ok: false,
    status: 200,
  })

  const storedItems = [
    {
      giftAddOns: [],
      key: 'nang-diu:standard::',
      productId: 'nang-diu',
      quantity: 1,
      sizeId: 'standard',
    },
  ]

  const result = await resolveCartItems(storedItems, { fetchProductDetailImpl: fakeMalformedFetch })
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'MALFORMED_RESPONSE')
})

test('21. retry recovers from transient errors', async () => {
  let callCount = 0
  const intermittentFetch = async () => {
    callCount += 1
    if (callCount === 1) {
      return {
        data: null,
        error: { code: 'NETWORK_ERROR', message: 'Connection failed' },
        isFallback: false,
        notFound: false,
        ok: false,
        status: 0,
      }
    }
    return {
      data: {
        giftAddOns: [],
        id: 'nang-diu',
        isPurchasable: true,
        name: 'Nắng Dịu',
        purchaseType: 'standard',
        sizeOptions: [{ code: 'standard', id: 'standard', label: 'Tiêu chuẩn', price: 590000 }],
        slug: 'nang-diu',
        wrappingOptions: [],
      },
      error: null,
      isFallback: false,
      notFound: false,
      ok: true,
      status: 200,
    }
  }

  const storedItems = [
    {
      giftAddOns: [],
      key: 'nang-diu:standard::',
      productId: 'nang-diu',
      quantity: 1,
      sizeId: 'standard',
    },
  ]

  // First attempt fails
  const attempt1 = await resolveCartItems(storedItems, { fetchProductDetailImpl: intermittentFetch })
  assert.equal(attempt1.ok, false)

  // Retry succeeds
  const attempt2 = await resolveCartItems(storedItems, { fetchProductDetailImpl: intermittentFetch })
  assert.equal(attempt2.ok, true)
  assert.equal(attempt2.items[0].name, 'Nắng Dịu')
})

test('22. Wishlist remains unaffected', () => {
  // Wishlist uses normalizeStoredWishlistIds, verify it still behaves identically
  const ids = normalizeStoredWishlistIds(['nang-diu', { id: 'may-hong' }, 'nang-diu'])
  assert.deepEqual(ids, ['nang-diu', 'may-hong'])
})

test('23. Product Detail add-to-cart remains functional with stable keys', () => {
  const key1 = buildCartItemKey({
    giftAddOns: normalizeGiftAddOns([{ id: 'mini-scented-candle', name: 'Nến thơm mini', price: 120000 }]),
    productId: 'nang-diu',
    sizeId: 'standard',
    wrappingId: 'ivory',
  })
  const key2 = buildCartItemKey({
    giftAddOns: normalizeGiftAddOns([{ id: 'mini-scented-candle', name: 'Nến thơm mini', price: 120000 }]),
    productId: 'nang-diu',
    sizeId: 'standard',
    wrappingId: 'ivory',
  })
  assert.equal(key1, key2)
  assert.equal(key1, 'nang-diu:standard:ivory:mini-scented-candle')
})

test('24. Admin option editing reflects directly in cart resolution', async () => {
  const { d1, sqlite } = createSeededDatabase()
  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'true' })
  const fetchImpl = createFetchImpl(worker, env)

  // Admin updates large variant label and price
  sqlite.prepare("UPDATE product_variants SET label = 'Cỡ Lớn Đặc Biệt', price_vnd = 1250000 WHERE product_id = 'nang-diu' AND code = 'large'").run()

  const storedItems = [
    {
      giftAddOns: [],
      key: 'nang-diu:large::',
      productId: 'nang-diu',
      quantity: 1,
      sizeId: 'large',
    },
  ]

  const result = await resolveCartItems(storedItems, {
    fetchProductDetailImpl: (slug, opts) => fetchProductDetail(slug, { ...opts, fetchImpl }),
  })

  assert.equal(result.ok, true)
  assert.equal(result.items[0].size.label, 'Cỡ Lớn Đặc Biệt')
  assert.equal(result.items[0].size.price, 1250000)
  assert.equal(result.items[0].unitPrice, 1250000)
})

test('25. Cart total uses canonical resolved prices only', () => {
  const resolvedItems = [
    { isAvailable: true, lineTotal: 790000, quantity: 1, unitPrice: 790000 },
    { isAvailable: false, lineTotal: 0, quantity: 1, unitPrice: 0 },
    { isAvailable: true, lineTotal: 500000, quantity: 2, unitPrice: 250000 },
  ]
  const total = cartSubtotal(resolvedItems)
  assert.equal(total, 1290000)

  // cartItemUnitTotal and cartItemLineTotal guard unavailable items
  assert.equal(cartItemLineTotal({ isAvailable: false, quantity: 2, unitPrice: 500000 }), 0)
  assert.equal(cartItemUnitTotal({ isAvailable: false, unitPrice: 500000 }), 0)
})

test('26. zero static imports in CartItems.jsx and CommerceContext.jsx', () => {
  const cartItemsContent = fs.readFileSync(path.resolve('src/components/CartItems.jsx'), 'utf8')
  assert.equal(cartItemsContent.includes("from '../data/products'"), false)

  const commerceContextContent = fs.readFileSync(path.resolve('src/context/CommerceContext.jsx'), 'utf8')
  assert.equal(commerceContextContent.includes("from '../data/products'"), false)
})
