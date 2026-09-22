import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { products as staticProducts } from '../src/data/products.js'
import {
  fetchShopCatalogue,
  normalizeCatalogueProduct,
} from '../src/services/catalogueClient.js'
import { normalizeSearch } from '../src/utils/normalizeSearch.js'
import {
  compareProductPrices,
  getProductPriceLabel,
  matchesProductPriceFilter,
} from '../src/utils/productCommerce.js'
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

test('1. Shop loads from API', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'true' })

  const result = await fetchShopCatalogue({
    fetchImpl: async (url, init) => {
      const fullUrl = url.startsWith('http') ? url : `http://127.0.0.1:5173${url}`
      return worker.fetch(new Request(fullUrl, init), env)
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.isFallback, false)
  assert.equal(result.status, 200)
  assert.equal(Array.isArray(result.data), true)
  assert.equal(result.data.length, 24)
})

test('2. 24 products render/normalize correctly', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'true' })

  const result = await fetchShopCatalogue({
    fetchImpl: async (url, init) => {
      const fullUrl = url.startsWith('http') ? url : `http://127.0.0.1:5173${url}`
      return worker.fetch(new Request(fullUrl, init), env)
    },
  })

  assert.equal(result.data.length, 24)
  for (const product of result.data) {
    assert.ok(product.id, 'Product must have an id')
    assert.ok(product.slug, 'Product must have a slug')
    assert.ok(product.name, 'Product must have a name')
    assert.ok(Array.isArray(product.images) && product.images.length > 0, `${product.id} must have images`)
    assert.ok(product.images[0].src, `${product.id} image must have src`)
    assert.ok(Array.isArray(product.colorPalette), `${product.id} must have colorPalette`)
    assert.ok(Array.isArray(product.occasions), `${product.id} must have occasions`)
    assert.ok(['Có sẵn', 'Theo mùa', 'Đặt trước'].includes(product.status), `${product.id} has invalid status: ${product.status}`)
    assert.ok(['standard', 'priceless'].includes(product.purchaseType), `${product.id} invalid purchaseType`)
  }
})

test('3. API price is used, not static price', () => {
  const mockApiProduct = {
    id: 'nang-diu',
    isBestSeller: true,
    name: 'Nắng Dịu',
    priceVnd: 999000,
    purchaseType: 'standard',
    slug: 'nang-diu',
    status: 'available',
  }

  const normalized = normalizeCatalogueProduct(mockApiProduct)
  assert.equal(normalized.price, 999000)
  assert.equal(normalized.priceVnd, 999000)
  assert.equal(getProductPriceLabel(normalized), '999.000\u00A0₫')
  assert.notEqual(normalized.price, staticProducts.find((p) => p.id === 'nang-diu')?.price)
})

test('4. no-watering-flower is priceless (priceVnd: null, non-purchasable)', () => {
  const mockApiProduct = {
    id: 'no-watering-flower',
    isBestSeller: false,
    name: 'Bông Hoa Không Cần Tưới',
    priceVnd: null,
    purchaseType: 'priceless',
    slug: 'no-watering-flower',
    status: 'preorder',
  }

  const normalized = normalizeCatalogueProduct(mockApiProduct)
  assert.equal(normalized.price, null)
  assert.equal(normalized.priceVnd, null)
  assert.equal(normalized.purchaseType, 'priceless')
  assert.equal(normalized.isPurchasable, false)
  assert.equal(getProductPriceLabel(normalized), 'Vô giá')
})

test('5. Accent-insensitive Vietnamese search works with API data', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'true' })

  const result = await fetchShopCatalogue({
    fetchImpl: async (url, init) => {
      const fullUrl = url.startsWith('http') ? url : `http://127.0.0.1:5173${url}`
      return worker.fetch(new Request(fullUrl, init), env)
    },
  })

  const searchInProduct = (product, term) => {
    const searchable = normalizeSearch([
      product.name,
      product.shortDescription,
      product.collection,
      ...product.occasions,
      ...product.moods,
      ...product.colorPalette,
      ...product.flowerComposition,
    ].join(' '))
    return searchable.includes(normalizeSearch(term))
  }

  const nangDiuMatches = result.data.filter((p) => searchInProduct(p, 'nang diu'))
  assert.ok(nangDiuMatches.some((p) => p.id === 'nang-diu'), 'Should find Nắng Dịu via "nang diu"')

  const hongPhanMatches = result.data.filter((p) => searchInProduct(p, 'hong phan'))
  assert.ok(hongPhanMatches.length > 0, 'Should find products with "hong phan"')

  const sinhNhatMatches = result.data.filter((p) => searchInProduct(p, 'sinh nhat'))
  assert.ok(sinhNhatMatches.length > 0, 'Should find products with "sinh nhat"')
})

test('6. Filter behavior works', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'true' })

  const result = await fetchShopCatalogue({
    fetchImpl: async (url, init) => {
      const fullUrl = url.startsWith('http') ? url : `http://127.0.0.1:5173${url}`
      return worker.fetch(new Request(fullUrl, init), env)
    },
  })

  const birthdayProducts = result.data.filter((p) => p.occasions.includes('Sinh nhật'))
  assert.ok(birthdayProducts.length > 0, 'Should filter by occasion: Sinh nhật')

  const pinkProducts = result.data.filter((p) => p.colorPalette.includes('Hồng phấn'))
  assert.ok(pinkProducts.length > 0, 'Should filter by color: Hồng phấn')

  const under600 = result.data.filter((p) => matchesProductPriceFilter(p, 'under-600'))
  assert.ok(under600.every((p) => p.price < 600000 && p.purchaseType !== 'priceless'))

  const seasonalProducts = result.data.filter((p) => p.status === 'Theo mùa')
  assert.ok(seasonalProducts.length > 0, 'Should filter by status: Theo mùa')
})

test('7. Sort behavior works', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'true' })

  const result = await fetchShopCatalogue({
    fetchImpl: async (url, init) => {
      const fullUrl = url.startsWith('http') ? url : `http://127.0.0.1:5173${url}`
      return worker.fetch(new Request(fullUrl, init), env)
    },
  })

  // Sort by featured (best sellers first)
  const featured = [...result.data].sort(
    (a, b) => Number(b.isBestSeller) - Number(a.isBestSeller),
  )
  assert.equal(featured[0].isBestSeller, true)

  // Sort by newest
  const newest = [...result.data].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  )
  assert.ok(new Date(newest[0].createdAt) >= new Date(newest[1].createdAt))

  // Sort by price-ascending
  const priceAsc = [...result.data].sort(
    (a, b) => compareProductPrices(a, b, 'ascending'),
  )
  assert.ok(priceAsc[0].price <= priceAsc[1].price)
  assert.equal(priceAsc[priceAsc.length - 1].purchaseType, 'priceless', 'Priceless items sorted to end')

  // Sort by price-descending
  const priceDesc = [...result.data].sort(
    (a, b) => compareProductPrices(a, b, 'descending'),
  )
  assert.ok(priceDesc[0].price >= priceDesc[1].price)
  assert.equal(priceDesc[priceDesc.length - 1].purchaseType, 'priceless', 'Priceless items sorted to end')
})

test('8. 404 gate condition uses temporary static fallback', async () => {
  const result = await fetchShopCatalogue({
    fetchImpl: async () => new Response(JSON.stringify({
      error: { code: 'API_NOT_FOUND', message: 'Không tìm thấy API được yêu cầu.' },
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 404,
    }),
  })

  assert.equal(result.ok, true)
  assert.equal(result.isFallback, true)
  assert.equal(result.status, 404)
  assert.equal(result.data.length, 24)
  assert.equal(result.error, null)
})

test('9. 500 error does NOT silently fallback to static', async () => {
  const result = await fetchShopCatalogue({
    fetchImpl: async () => new Response(JSON.stringify({
      error: { code: 'INTERNAL_ERROR', message: 'Lỗi hệ thống.' },
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    }),
  })

  assert.equal(result.ok, false)
  assert.equal(result.isFallback, false)
  assert.equal(result.data, null)
  assert.equal(result.error.code, 'INTERNAL_ERROR')
  assert.equal(result.status, 500)
})

test('10. Malformed API response treated as error', async () => {
  const result = await fetchShopCatalogue({
    fetchImpl: async () => new Response(JSON.stringify({
      data: { items: 'not-an-array' },
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    }),
  })

  assert.equal(result.ok, false)
  assert.equal(result.isFallback, false)
  assert.equal(result.data, null)
  assert.equal(result.error.code, 'MALFORMED_RESPONSE')
})

test('11. Error/retry state does not crash app', async () => {
  let attempts = 0
  const fetchMock = async () => {
    attempts += 1
    if (attempts === 1) {
      throw new Error('Connection refused')
    }
    return new Response(JSON.stringify({
      data: {
        items: [{
          id: 'test-product',
          isBestSeller: false,
          name: 'Test Flower',
          priceVnd: 500000,
          purchaseType: 'standard',
          slug: 'test-flower',
          status: 'available',
        }],
      },
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  }

  // First attempt fails with network error
  const firstResult = await fetchShopCatalogue({ fetchImpl: fetchMock })
  assert.equal(firstResult.ok, false)
  assert.equal(firstResult.error.code, 'NETWORK_ERROR')
  assert.equal(firstResult.data, null)

  // Retry succeeds
  const retryResult = await fetchShopCatalogue({ fetchImpl: fetchMock })
  assert.equal(retryResult.ok, true)
  assert.equal(retryResult.data.length, 1)
  assert.equal(retryResult.data[0].id, 'test-product')
})

test('12. Static products remain intact for unmigrated consumers', () => {
  const flowerFinderFile = fs.readFileSync(path.resolve('src/pages/FlowerFinderPage.jsx'), 'utf8')
  assert.ok(flowerFinderFile.includes("from '../data/products'"), 'FlowerFinderPage must still import from static products')
  const detailFile = fs.readFileSync(path.resolve('src/pages/ProductDetailPage.jsx'), 'utf8')
  assert.ok(!detailFile.includes('fetchShopCatalogue'), 'ProductDetailPage must not use fetchShopCatalogue')
  assert.equal(staticProducts.length, 24, 'Static products data must remain intact')
})
