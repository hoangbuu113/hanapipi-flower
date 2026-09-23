import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import {
  fetchProductDetail,
  fetchShopCatalogue,
} from '../src/services/catalogueClient.js'
import { getGroundedCandidates } from '../src/utils/conciergeGrounding.js'
import {
  createConciergeRequest,
  getConciergeReply,
} from '../src/services/conciergeService.js'
import { isPurchasableProduct } from '../src/utils/productCommerce.js'
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

// =============================================================================
// CONCIERGE TESTS (1 - 5)
// =============================================================================

test('1. Concierge: canonical API products used for grounding and candidate selection', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1)

  const result = await fetchShopCatalogue({
    fetchImpl: async (url, init) => {
      const fullUrl = url.startsWith('http') ? url : `http://127.0.0.1:5173${url}`
      return worker.fetch(new Request(fullUrl, init), env)
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.data.length, 24)

  const grounding = getGroundedCandidates('hoa sinh nhật tặng bạn', result.data)
  assert.ok(grounding.candidates.length > 0)
  for (const { product } of grounding.candidates) {
    assert.ok(product.id, 'Product candidate must have canonical ID')
    assert.ok(product.name, 'Product candidate must have canonical name')
  }
})

test('2. Concierge: current D1 price/name/media win over static data', async () => {
  const { d1, sqlite } = createSeededDatabase()
  // Admin updates product name and base price in D1
  sqlite.prepare("UPDATE products SET name = 'Nắng Dịu Custom Title', price_vnd = 999000 WHERE id = 'nang-diu'").run()

  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1)

  const result = await fetchShopCatalogue({
    fetchImpl: async (url, init) => {
      const fullUrl = url.startsWith('http') ? url : `http://127.0.0.1:5173${url}`
      return worker.fetch(new Request(fullUrl, init), env)
    },
  })

  const updatedProduct = result.data.find((p) => p.id === 'nang-diu')
  assert.equal(updatedProduct.name, 'Nắng Dịu Custom Title')
  assert.equal(updatedProduct.priceVnd, 999000)

  // Grounding and concierge candidates reflect canonical D1 product
  const candidates = [{ product: updatedProduct }]
  const request = createConciergeRequest({
    candidates,
    history: [],
    message: 'Tư vấn giúp tôi',
    pageContext: { productId: updatedProduct.id, route: `/product/${updatedProduct.slug}` },
  })
  assert.equal(request.candidates[0].id, 'nang-diu')
  assert.equal(request.candidates[0].name, 'Nắng Dịu Custom Title')
  assert.equal(request.candidates[0].price, 999000)
})

test('3. Concierge: archived product not surfaced as purchasable', async () => {
  const { d1, sqlite } = createSeededDatabase()
  // Admin archives a product in D1
  sqlite.prepare("UPDATE products SET active = 0 WHERE id = 'nang-diu'").run()

  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1)

  const result = await fetchShopCatalogue({
    fetchImpl: async (url, init) => {
      const fullUrl = url.startsWith('http') ? url : `http://127.0.0.1:5173${url}`
      return worker.fetch(new Request(fullUrl, init), env)
    },
  })

  // D1 public catalogue excludes inactive products
  assert.equal(result.data.length, 23)
  assert.equal(result.data.some((p) => p.id === 'nang-diu'), false)

  // Grounding with canonical catalogue cannot recommend the archived product
  const grounding = getGroundedCandidates('Nắng Dịu', result.data)
  assert.equal(grounding.candidates.some(({ product }) => product.id === 'nang-diu'), false)
})

test('4. Concierge: API error handled safely without crashing or throwing', async () => {
  const result = await fetchShopCatalogue({
    fetchImpl: async () => new Response('Internal Server Error', { status: 500 }),
  })

  assert.equal(result.ok, false)
  assert.equal(result.data, null)

  // When catalogue is empty due to API failure, getConciergeReply uses local fallback safely
  const response = await getConciergeReply({
    apiUrl: null, // local fallback
    candidates: [],
    catalogue: [],
    currentProduct: null,
    grounding: getGroundedCandidates('Tư vấn giúp tôi', []),
    history: [],
    message: 'Tư vấn giúp tôi',
    pageContext: { productId: null, route: '/' },
  })

  assert.ok(response.message)
  assert.equal(response.source, 'local')
})

test('5. Concierge: no direct static catalogue import remains in ConciergeWidget.jsx', () => {
  const source = fs.readFileSync(path.resolve('src/components/ConciergeWidget.jsx'), 'utf8')
  assert.ok(!source.includes('../data/products'), 'ConciergeWidget must not import ../data/products')
  assert.ok(source.includes('fetchShopCatalogue'), 'ConciergeWidget must import fetchShopCatalogue')
})

// =============================================================================
// EASTER EGG (FLOWER ALREADY TAKEN) TESTS (6 - 12)
// =============================================================================

test('6. Easter egg: no-watering-flower resolves from D1/API', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1)

  const result = await fetchProductDetail('no-watering-flower', {
    fetchImpl: async (url, init) => {
      const fullUrl = url.startsWith('http') ? url : `http://127.0.0.1:5173${url}`
      return worker.fetch(new Request(fullUrl, init), env)
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.data.id, 'no-watering-flower')
  assert.equal(result.data.slug, 'no-watering-flower')
  assert.ok(result.data.images?.length > 0)
})

test('7. Easter egg: no-watering-flower remains priceless', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1)

  const result = await fetchProductDetail('no-watering-flower', {
    fetchImpl: async (url, init) => {
      const fullUrl = url.startsWith('http') ? url : `http://127.0.0.1:5173${url}`
      return worker.fetch(new Request(fullUrl, init), env)
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.data.purchaseType, 'priceless')
  assert.equal(result.data.priceVnd, null)
})

test('8. Easter egg: no-watering-flower remains non-purchasable', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1)

  const result = await fetchProductDetail('no-watering-flower', {
    fetchImpl: async (url, init) => {
      const fullUrl = url.startsWith('http') ? url : `http://127.0.0.1:5173${url}`
      return worker.fetch(new Request(fullUrl, init), env)
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.data.isPurchasable, false)
  assert.equal(isPurchasableProduct(result.data), false)
})

test('9. Easter egg: special page route remains intact', () => {
  const appSource = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8')
  assert.ok(appSource.includes('path="flower-already-taken"'), 'Route flower-already-taken must exist in App.jsx')
  assert.ok(appSource.includes('FlowerAlreadyTakenPage'), 'FlowerAlreadyTakenPage component must be routed in App.jsx')
})

test('10. Easter egg: special romantic/gallery behavior preserved', () => {
  const pageSource = fs.readFileSync(path.resolve('src/pages/FlowerAlreadyTakenPage.jsx'), 'utf8')
  assert.ok(pageSource.includes('personalFlowerMedia'), 'Must render personalFlowerMedia gallery')
  assert.ok(pageSource.includes('Vô giá · Chỉ để ngắm'), 'Must preserve priceless badge')
  assert.ok(pageSource.includes('Bông hoa này có chủ rồi.'), 'Must preserve special story headline')
})

test('11. Easter egg: API error handled safely', async () => {
  const result = await fetchProductDetail('no-watering-flower', {
    fetchImpl: async () => new Response('Internal Server Error', { status: 500 }),
  })

  assert.equal(result.ok, false)
  assert.equal(result.data, null)
  assert.ok(result.error)

  const pageSource = fs.readFileSync(path.resolve('src/pages/FlowerAlreadyTakenPage.jsx'), 'utf8')
  assert.ok(pageSource.includes('error'), 'Component must track error state')
  assert.ok(pageSource.includes('Thử lại'), 'Component must provide retry button')
})

test('12. Easter egg: no direct static catalogue import remains in FlowerAlreadyTakenPage.jsx', () => {
  const source = fs.readFileSync(path.resolve('src/pages/FlowerAlreadyTakenPage.jsx'), 'utf8')
  assert.ok(!source.includes('../data/products'), 'FlowerAlreadyTakenPage must not import ../data/products')
  assert.ok(source.includes('fetchProductDetail'), 'FlowerAlreadyTakenPage must import fetchProductDetail')
})

// =============================================================================
// ADDITIONAL CONSUMERS & ORDER UTILS (13)
// =============================================================================

test('13. Order utils: no direct static catalogue import remains in src/utils/order.js', () => {
  const source = fs.readFileSync(path.resolve('src/utils/order.js'), 'utf8')
  assert.ok(!source.includes('data/products'), 'src/utils/order.js must not import data/products')
})
