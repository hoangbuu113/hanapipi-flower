import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { products as staticProducts } from '../src/data/products.js'
import {
  fetchProductDetail,
  fetchShopCatalogue,
} from '../src/services/catalogueClient.js'
import {
  getProductPriceLabel,
  isPurchasableProduct,
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

test('1. Product Detail loads known product from API', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'true' })

  const result = await fetchProductDetail('nang-diu', {
    fetchImpl: async (url, init) => {
      const fullUrl = url.startsWith('http') ? url : `http://127.0.0.1:5173${url}`
      return worker.fetch(new Request(fullUrl, init), env)
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.isFallback, false)
  assert.equal(result.notFound, false)
  assert.equal(result.status, 200)
  assert.ok(result.data)
  assert.equal(result.data.id, 'nang-diu')
  assert.equal(result.data.name, 'Nắng Dịu')
  assert.equal(result.data.price, 590000)
})

test('2. API priceVnd is authoritative', async () => {
  const result = await fetchProductDetail('nang-diu', {
    fetchImpl: async () => new Response(JSON.stringify({
      data: {
        product: {
          id: 'nang-diu',
          isBestSeller: true,
          name: 'Nắng Dịu',
          priceVnd: 888000,
          purchaseType: 'standard',
          slug: 'nang-diu',
          status: 'available',
        },
        relatedProducts: [],
        variants: [],
      },
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    }),
  })

  assert.equal(result.ok, true)
  assert.equal(result.data.price, 888000)
  assert.equal(result.data.priceVnd, 888000)
  assert.equal(getProductPriceLabel(result.data), '888.000\u00A0₫')
  assert.notEqual(result.data.price, staticProducts.find((p) => p.id === 'nang-diu')?.price)
})

test('3. API variants normalize correctly', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'true' })

  const result = await fetchProductDetail('nang-diu', {
    fetchImpl: async (url, init) => {
      const fullUrl = url.startsWith('http') ? url : `http://127.0.0.1:5173${url}`
      return worker.fetch(new Request(fullUrl, init), env)
    },
  })

  assert.ok(Array.isArray(result.data.sizeOptions), 'sizeOptions must be an array')
  assert.equal(result.data.sizeOptions.length, 3)
  assert.deepEqual(
    result.data.sizeOptions.map((o) => ({ id: o.id, price: o.price })),
    [
      { id: 'small', price: 490000 },
      { id: 'standard', price: 590000 },
      { id: 'large', price: 770000 },
    ],
  )

  assert.ok(Array.isArray(result.data.wrappingOptions), 'wrappingOptions must be an array')
  assert.equal(result.data.wrappingOptions.length, 2)
  assert.deepEqual(
    result.data.wrappingOptions.map((o) => o.id),
    ['ivory-paper', 'blush-ribbon'],
  )
})

test('4. API related products are used', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'true' })

  const result = await fetchProductDetail('nang-diu', {
    fetchImpl: async (url, init) => {
      const fullUrl = url.startsWith('http') ? url : `http://127.0.0.1:5173${url}`
      return worker.fetch(new Request(fullUrl, init), env)
    },
  })

  assert.ok(Array.isArray(result.data.relatedProducts), 'relatedProducts must be an array')
  assert.ok(result.data.relatedProducts.length > 0, 'Should have related products from D1')
  for (const related of result.data.relatedProducts) {
    assert.ok(related.id, 'Related product must have an id')
    assert.ok(related.name, 'Related product must have a name')
    assert.ok(Array.isArray(related.images) && related.images.length > 0, 'Related product must have images')
  }
})

test('5. Intentional API gate can use temporary static compatibility fallback', async () => {
  const result = await fetchProductDetail('nang-diu', {
    fetchImpl: async () => new Response(JSON.stringify({
      error: { code: 'API_NOT_FOUND', message: 'Không tìm thấy API được yêu cầu.' },
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 404,
    }),
  })

  assert.equal(result.ok, true)
  assert.equal(result.isFallback, true)
  assert.equal(result.notFound, false)
  assert.equal(result.status, 404)
  assert.ok(result.data)
  assert.equal(result.data.id, 'nang-diu')
})

test('6. Backend genuine product-not-found does NOT fallback to static', async () => {
  const result = await fetchProductDetail('unknown-flower-xyz', {
    fetchImpl: async () => new Response(JSON.stringify({
      error: { code: 'PRODUCT_NOT_FOUND', message: 'Không tìm thấy sản phẩm được yêu cầu.' },
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 404,
    }),
  })

  assert.equal(result.ok, false)
  assert.equal(result.isFallback, false)
  assert.equal(result.notFound, true)
  assert.equal(result.data, null)
  assert.equal(result.error.code, 'PRODUCT_NOT_FOUND')
})

test('7. HTTP 500 does NOT silently fallback', async () => {
  const result = await fetchProductDetail('nang-diu', {
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
})

test('8. Malformed API detail payload surfaces safe error state', async () => {
  const result = await fetchProductDetail('nang-diu', {
    fetchImpl: async () => new Response(JSON.stringify({
      data: { product: 'not-an-object' },
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

test('9. Retry can recover from a failed fetch', async () => {
  let attempts = 0
  const fetchMock = async () => {
    attempts += 1
    if (attempts === 1) {
      throw new Error('Connection refused')
    }
    return new Response(JSON.stringify({
      data: {
        product: {
          id: 'test-product',
          isBestSeller: false,
          name: 'Test Flower',
          priceVnd: 500000,
          purchaseType: 'standard',
          slug: 'test-product',
          status: 'available',
        },
        relatedProducts: [],
        variants: [],
      },
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  }

  // Attempt 1 fails
  const first = await fetchProductDetail('test-product', { fetchImpl: fetchMock })
  assert.equal(first.ok, false)
  assert.equal(first.error.code, 'NETWORK_ERROR')

  // Attempt 2 succeeds
  const retry = await fetchProductDetail('test-product', { fetchImpl: fetchMock })
  assert.equal(retry.ok, true)
  assert.equal(retry.data.id, 'test-product')
})

test('10. no-watering-flower remains priceless', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'true' })

  const result = await fetchProductDetail('no-watering-flower', {
    fetchImpl: async (url, init) => {
      const fullUrl = url.startsWith('http') ? url : `http://127.0.0.1:5173${url}`
      return worker.fetch(new Request(fullUrl, init), env)
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.data.id, 'no-watering-flower')
  assert.equal(result.data.purchaseType, 'priceless')
  assert.equal(result.data.price, null)
  assert.equal(result.data.priceVnd, null)
  assert.equal(getProductPriceLabel(result.data), 'Vô giá')
})

test('11. no-watering-flower remains non-purchasable', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'true' })

  const result = await fetchProductDetail('no-watering-flower', {
    fetchImpl: async (url, init) => {
      const fullUrl = url.startsWith('http') ? url : `http://127.0.0.1:5173${url}`
      return worker.fetch(new Request(fullUrl, init), env)
    },
  })

  assert.equal(result.data.isPurchasable, false)
  assert.equal(isPurchasableProduct(result.data), false)
})

test('12. no-watering-flower cannot be added to cart', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'true' })

  const result = await fetchProductDetail('no-watering-flower', {
    fetchImpl: async (url, init) => {
      const fullUrl = url.startsWith('http') ? url : `http://127.0.0.1:5173${url}`
      return worker.fetch(new Request(fullUrl, init), env)
    },
  })

  assert.deepEqual(result.data.sizeOptions, [])
  assert.deepEqual(result.data.wrappingOptions, [])
  assert.equal(isPurchasableProduct(result.data), false)
})

test('13. Special romantic/private gallery behavior remains intact', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'true' })

  const result = await fetchProductDetail('no-watering-flower', {
    fetchImpl: async (url, init) => {
      const fullUrl = url.startsWith('http') ? url : `http://127.0.0.1:5173${url}`
      return worker.fetch(new Request(fullUrl, init), env)
    },
  })

  const media = result.data.media
  assert.equal(media.length, 4)
  assert.equal(media[0].type, 'image')
  assert.equal(media[1].type, 'image')
  assert.equal(media[2].type, 'image')
  assert.equal(media[3].type, 'video')
  assert.ok(media[3].poster, 'Video media must have poster')
  assert.ok(media[3].src, 'Video media must have src')
})

test('14. Normal purchasable product still supports existing add-to-cart UX', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'true' })

  const result = await fetchProductDetail('nang-diu', {
    fetchImpl: async (url, init) => {
      const fullUrl = url.startsWith('http') ? url : `http://127.0.0.1:5173${url}`
      return worker.fetch(new Request(fullUrl, init), env)
    },
  })

  const product = result.data
  assert.equal(isPurchasableProduct(product), true)
  assert.ok(product.sizeOptions.length > 0)
  const standardSize = product.sizeOptions.find((o) => o.id === 'standard')
  assert.ok(standardSize)
  assert.equal(standardSize.price, 590000)
  assert.ok(product.wrappingOptions.length > 0)
})

test('15. Shop migration remains unaffected', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'true' })

  const shopResult = await fetchShopCatalogue({
    fetchImpl: async (url, init) => {
      const fullUrl = url.startsWith('http') ? url : `http://127.0.0.1:5173${url}`
      return worker.fetch(new Request(fullUrl, init), env)
    },
  })

  assert.equal(shopResult.ok, true)
  assert.equal(shopResult.data.length, 24)
})

test('16. Product Detail visual structure is not unnecessarily rewritten', () => {
  const content = fs.readFileSync(path.resolve('src/pages/ProductDetailPage.jsx'), 'utf8')
  assert.ok(content.includes('className="product-page"'))
  assert.ok(content.includes('className="product-gallery"'))
  assert.ok(content.includes('className="product-detail__info"'))
  assert.ok(content.includes('className="product-option-group"'))
  assert.ok(content.includes('className="product-priceless-action"'))
  assert.ok(content.includes('className="product-information'))
  assert.ok(content.includes('className="product-related"'))
  assert.ok(content.includes('className="product-not-found"'))
})
