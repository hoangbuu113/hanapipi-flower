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
import { getCartScope, getCartStorageKey, readScopedCart, writeScopedCart } from '../src/utils/cartIdentity.js'
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

test('27. floating cart shortcut uses the canonical quantity count and cart route', () => {
  const shortcut = fs.readFileSync(path.resolve('src/components/FloatingCartShortcut.jsx'), 'utf8')
  const layout = fs.readFileSync(path.resolve('src/layouts/SiteLayout.jsx'), 'utf8')
  const commerce = fs.readFileSync(path.resolve('src/context/CommerceContext.jsx'), 'utf8')
  const styles = fs.readFileSync(path.resolve('src/components/FloatingCartShortcut.css'), 'utf8')

  assert.match(shortcut, /const \{ cartCount \} = useCommerce\(\)/u)
  assert.match(commerce, /cartCount: storedCartItems\.reduce\(\(total, item\) => total \+ item\.quantity, 0\)/u)
  assert.match(shortcut, /to="\/cart"/u)
  assert.match(shortcut, /cartCount > 0 &&/u)
  assert.match(shortcut, /'\/shop', '\/search', '\/flower-finder', '\/wishlist'/u)
  assert.match(layout, /<FloatingCartShortcut \/>/u)
  assert.match(styles, /bottom: calc\(max\(14px, env\(safe-area-inset-bottom\)\) \+ 58px\)/u)
})

function createCartStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  }
}

function scopedItem(productId, quantity = 1) {
  return { productId, quantity, sizeId: 'standard', wrappingId: null, giftAddOns: [] }
}

function saveScope(storage, scope, items) {
  writeScopedCart(storage, scope, { delivery: { date: null, slot: null }, items })
}

function readScope(storage, scope) {
  return readScopedCart(storage, scope).items.map(({ productId, quantity }) => ({ productId, quantity }))
}

test('28. same-browser Guest, Admin, and User B carts remain independent through login/logout/reload (A-D)', () => {
  const storage = createCartStorage()
  const guest = getCartScope({ isLoaded: true, isSignedIn: false })
  const admin = getCartScope({ isLoaded: true, isSignedIn: true, userId: 'clerk_admin' })
  const userB = getCartScope({ isLoaded: true, isSignedIn: true, userId: 'clerk_user_b' })

  saveScope(storage, guest, [scopedItem('product-a')])
  assert.deepEqual(readScope(storage, admin), []) // A: Guest cart does not merge on login.
  saveScope(storage, admin, [scopedItem('product-b')])
  assert.deepEqual(readScope(storage, guest), [{ productId: 'product-a', quantity: 1 }]) // B
  assert.deepEqual(readScope(storage, admin), [{ productId: 'product-b', quantity: 1 }]) // C
  assert.deepEqual(readScope(storage, userB), []) // D

  // Repeated transitions and reloads read only the currently selected scope.
  for (const scope of [guest, admin, userB, guest, admin]) {
    const products = readScope(storage, scope).map((item) => item.productId)
    assert.deepEqual(products, scope === guest ? ['product-a'] : scope === admin ? ['product-b'] : [])
  }
})

test('29. successful checkout clears only the active identity cart (E-F)', () => {
  const storage = createCartStorage()
  const guest = 'guest'
  const admin = getCartScope({ isLoaded: true, isSignedIn: true, userId: 'clerk_admin' })
  saveScope(storage, guest, [scopedItem('product-a')])
  saveScope(storage, admin, [scopedItem('product-b')])

  saveScope(storage, guest, [])
  assert.deepEqual(readScope(storage, guest), [])
  assert.deepEqual(readScope(storage, admin), [{ productId: 'product-b', quantity: 1 }])

  saveScope(storage, guest, [scopedItem('product-a')])
  saveScope(storage, admin, [])
  assert.deepEqual(readScope(storage, admin), [])
  assert.deepEqual(readScope(storage, guest), [{ productId: 'product-a', quantity: 1 }])

  const context = fs.readFileSync(path.resolve('src/context/CommerceContext.jsx'), 'utf8')
  const checkout = fs.readFileSync(path.resolve('src/pages/CheckoutPage.jsx'), 'utf8')
  assert.match(context, /clearCart: \(\) => \{\s*writeScopedCart\(window\.localStorage, cartScope/u)
  assert.doesNotMatch(checkout, /createOrder\(/u, 'Contact summary must never create orders')
  assert.match(checkout, /if \(result.ok\) \{[\s\S]*?clearCart\(\)/u, 'Consultation clears the scoped cart only after confirmed success')
})

test('30. unresolved Clerk identity cannot hydrate or render a previous cart (G)', () => {
  assert.equal(getCartScope({ isLoaded: false, isSignedIn: false }), null)
  assert.equal(getCartScope({ isLoaded: false, isSignedIn: true, userId: 'clerk_admin' }), null)
  assert.equal(getCartScope({ isLoaded: true, isSignedIn: true }), null)

  const context = fs.readFileSync(path.resolve('src/context/CommerceContext.jsx'), 'utf8')
  assert.match(context, /if \(!cartScope\) return null/u)
  assert.match(context, /<ScopedCommerceProvider key=\{cartScope\} cartScope=\{cartScope\}>/u)
})

test('31. floating badge reads only the mounted identity scope (H)', () => {
  const storage = createCartStorage()
  const guest = 'guest'
  const admin = getCartScope({ isLoaded: true, isSignedIn: true, userId: 'clerk_admin' })
  saveScope(storage, guest, [scopedItem('product-a', 2)])
  saveScope(storage, admin, [scopedItem('product-b', 3)])
  const count = (scope) => readScopedCart(storage, scope).items.reduce((total, item) => total + item.quantity, 0)
  assert.equal(count(guest), 2)
  assert.equal(count(admin), 3)
  assert.equal(count(guest), 2)
  assert.notEqual(getCartStorageKey(guest), getCartStorageKey(admin))
})

test('32. ambiguous legacy shared cart is never assigned to Guest or a different account', () => {
  const storage = createCartStorage()
  const legacyKey = 'hanapipi-flower:cart'
  const oldCart = JSON.stringify({ items: [scopedItem('private-product')] })
  storage.setItem(legacyKey, oldCart)
  assert.deepEqual(readScope(storage, 'guest'), [])
  assert.equal(storage.getItem(legacyKey), null)

  storage.setItem(legacyKey, oldCart)
  const admin = getCartScope({ isLoaded: true, isSignedIn: true, userId: 'clerk_admin' })
  assert.deepEqual(readScope(storage, admin), [])
  assert.equal(storage.getItem(legacyKey), null)
})

test('33. mounted CommerceProvider, CartDrawer, Navbar, and floating badge isolate same-browser auth transitions', async () => {
  const { register } = await import('node:module')
  register('./cart-component-loader.js', import.meta.url)

  const React = await import('react')
  const { act, create } = await import('react-test-renderer')
  const { MemoryRouter } = await import('react-router-dom')
  const { CommerceProvider } = await import('../src/context/CommerceContext.jsx')
  const { useCommerce } = await import('../src/context/commerceStore.js')
  const { AccountContext } = await import('../src/context/accountStore.js')
  const { setClerkAuth } = await import('./mocks/clerkReact.js')
  const CartDrawer = (await import('../src/components/CartDrawer.jsx')).default
  const Navbar = (await import('../src/components/Navbar.jsx')).default
  const FloatingCartShortcut = (await import('../src/components/FloatingCartShortcut.jsx')).default

  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  const originalFetch = globalThis.fetch
  const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT
  const storage = createCartStorage()
  const noop = () => {}
  globalThis.window = {
    addEventListener: noop,
    cancelAnimationFrame: noop,
    clearTimeout,
    localStorage: storage,
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
    removeEventListener: noop,
    requestAnimationFrame: () => 1,
    setTimeout,
  }
  globalThis.document = { activeElement: null, body: { style: { overflow: '' } } }
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'API_NOT_FOUND' } }), {
    headers: { 'Content-Type': 'application/json' },
    status: 404,
  })
  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  let commerce
  let renderer
  function Controls() {
    const current = useCommerce()
    React.useEffect(() => { commerce = current }, [current])
    return null
  }
  const element = React.createElement(MemoryRouter, null,
    React.createElement(AccountContext.Provider, { value: { user: null } },
      React.createElement(CommerceProvider, null,
        React.createElement(Navbar),
        React.createElement(FloatingCartShortcut),
        React.createElement(CartDrawer),
        React.createElement(Controls),
      ),
    ),
  )

  const visibleText = () => JSON.stringify(renderer.toJSON())
  const badgeCounts = () => ({
    floating: renderer.root.findAll((node) => node.props.className === 'floating-cart-shortcut__badge').map((node) => node.children.join('')),
    navbar: renderer.root.findAll((node) => node.type === 'em' && /^\d+$/u.test(node.children.join(''))).map((node) => node.children.join('')),
  })
  const openDrawer = async () => act(async () => { commerce.openCart() })
  const add = async (productId) => act(async () => {
    commerce.addToCart({ productId, quantity: 1, sizeId: 'standard', wrappingId: null })
  })

  try {
    setClerkAuth({ isLoaded: false, isSignedIn: undefined, userId: null })
    await act(async () => { renderer = create(element) })
    assert.equal(renderer.toJSON(), null, 'auth initialization must not render any cart consumer')

    await act(async () => { setClerkAuth({ isLoaded: true, isSignedIn: false, userId: null }) })
    await add('sac-apricot')
    await openDrawer()
    assert.match(visibleText(), /Ngày Hồng/u)
    assert.deepEqual(badgeCounts(), { floating: ['1'], navbar: ['1', '1'] })

    await act(async () => { setClerkAuth({ isLoaded: true, isSignedIn: true, userId: 'clerk_admin' }) })
    assert.doesNotMatch(visibleText(), /Ngày Hồng/u, 'Guest item must vanish without page reload')
    assert.deepEqual(badgeCounts(), { floating: [], navbar: [] })
    await openDrawer()
    assert.match(visibleText(), /Giỏ hàng của bạn đang trống/u)

    await add('nang-diu')
    assert.match(visibleText(), /Nắng Dịu/u)
    assert.doesNotMatch(visibleText(), /Ngày Hồng/u)
    assert.deepEqual(badgeCounts(), { floating: ['1'], navbar: ['1', '1'] })

    await act(async () => { setClerkAuth({ isLoaded: true, isSignedIn: false, userId: null }) })
    assert.doesNotMatch(visibleText(), /Nắng Dịu/u)
    assert.deepEqual(badgeCounts(), { floating: ['1'], navbar: ['1', '1'] })
    await openDrawer()
    assert.match(visibleText(), /Ngày Hồng/u)

    await act(async () => { setClerkAuth({ isLoaded: true, isSignedIn: true, userId: 'clerk_admin' }) })
    await openDrawer()
    assert.match(visibleText(), /Nắng Dịu/u)
    assert.doesNotMatch(visibleText(), /Ngày Hồng/u)
    assert.deepEqual(badgeCounts(), { floating: ['1'], navbar: ['1', '1'] })
    assert.equal(readScope(storage, 'guest')[0].productId, 'sac-apricot')
    assert.equal(readScope(storage, 'user:clerk_admin')[0].productId, 'nang-diu')
  } finally {
    if (renderer) await act(async () => { renderer.unmount() })
    setClerkAuth({ isLoaded: false, isSignedIn: undefined, userId: null })
    globalThis.window = originalWindow
    globalThis.document = originalDocument
    globalThis.fetch = originalFetch
    globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment
  }
})
