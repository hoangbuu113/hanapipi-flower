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
import { normalizeSearch } from '../src/utils/normalizeSearch.js'
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

function searchProducts(products, query) {
  const normalizedQuery = normalizeSearch(query)
  const queryTerms = normalizedQuery.replace(/^tong\s+/, '').split(' ').filter(Boolean)
  if (!normalizedQuery) return []
  return products.filter((product) => {
    const searchableText = normalizeSearch([
      product.name,
      product.shortDescription,
      product.collection,
      ...(product.occasions || []),
      ...(product.moods || []),
      ...(product.colorPalette || []),
      ...(product.flowerComposition || []),
    ].join(' '))
    return queryTerms.every((term) => searchableText.includes(term))
  })
}

test('1. SearchPage loads from API successfully', async () => {
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

test('2. Search uses API product names and details', async () => {
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
  const matches = searchProducts(result.data, 'Ban Mai')
  assert.ok(matches.length >= 1)
  assert.ok(matches.some((p) => p.name === 'Ban Mai Xanh' && p.slug === 'ban-mai-xanh'))
})

test('3. Vietnamese accent-insensitive search works across fields', async () => {
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
  const products = result.data

  // Search by occasion unaccented
  const birthdayMatches = searchProducts(products, 'sinh nhat')
  assert.ok(birthdayMatches.length > 0)
  assert.ok(birthdayMatches.every((p) =>
    (p.occasions || []).some((o) => normalizeSearch(o).includes('sinh nhat'))
    || normalizeSearch(p.name).includes('sinh nhat')
    || normalizeSearch(p.shortDescription).includes('sinh nhat')
  ))

  // Search by color unaccented
  const whiteMatches = searchProducts(products, 'trang')
  assert.ok(whiteMatches.length > 0)

  // Search by 'tong trang' with 'tong' prefix stripped
  const tongTrangMatches = searchProducts(products, 'tong trang')
  assert.ok(tongTrangMatches.length > 0)
  assert.deepEqual(
    tongTrangMatches.map((p) => p.slug),
    whiteMatches.map((p) => p.slug),
  )
})

test('4. API price remains authoritative in search results', async () => {
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
  const matches = searchProducts(result.data, 'Nang Diu')
  assert.equal(matches.length, 1)
  assert.equal(matches[0].price, 590000)
  assert.match(getProductPriceLabel(matches[0]), /590\.000.*₫/)
})

test('5. no-watering-flower remains priceless and non-purchasable in search', async () => {
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
  const matches = searchProducts(result.data, 'Bong Hoa Khong Can Tuoi')
  assert.equal(matches.length, 1)
  const noWatering = matches[0]
  assert.equal(noWatering.slug, 'no-watering-flower')
  assert.equal(noWatering.price, null)
  assert.equal(isPurchasableProduct(noWatering), false)
  assert.equal(getProductPriceLabel(noWatering), 'Vô giá')
})

test('6. No-results state returns empty array', async () => {
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
  const matches = searchProducts(result.data, 'xyznonexistentterm999')
  assert.deepEqual(matches, [])
})

test('7. Intentional API gate (404) uses temporary static fallback', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'false' })

  const result = await fetchShopCatalogue({
    fetchImpl: async (url, init) => {
      const fullUrl = url.startsWith('http') ? url : `http://127.0.0.1:5173${url}`
      return worker.fetch(new Request(fullUrl, init), env)
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.isFallback, true)
  assert.equal(result.status, 404)
  assert.equal(result.data.length, staticProducts.length)

  // Search still works with fallback data
  const matches = searchProducts(result.data, 'Ban Mai')
  assert.ok(matches.length >= 1)
})

test('8. HTTP 500 does NOT silently fallback', async () => {
  const result = await fetchShopCatalogue({
    fetchImpl: async () => {
      return new Response(
        JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Database failure' } }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )
    },
  })

  assert.equal(result.ok, false)
  assert.equal(result.isFallback, false)
  assert.equal(result.status, 500)
  assert.equal(result.error?.code, 'INTERNAL_ERROR')
  assert.equal(result.data, null)
})

test('9. Malformed response produces safe error state', async () => {
  const result = await fetchShopCatalogue({
    fetchImpl: async () => {
      return new Response('Not JSON', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      })
    },
  })

  assert.equal(result.ok, false)
  assert.equal(result.isFallback, false)
  assert.equal(result.error?.code, 'MALFORMED_RESPONSE')
  assert.equal(result.data, null)
})

test('10. Retry can recover from failed fetch', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'true' })

  let attempt = 0
  const fetchImpl = async (url, init) => {
    attempt += 1
    if (attempt === 1) {
      return new Response('Server busy', { status: 503 })
    }
    const fullUrl = url.startsWith('http') ? url : `http://127.0.0.1:5173${url}`
    return worker.fetch(new Request(fullUrl, init), env)
  }

  // Attempt 1: fails with 503
  const firstResult = await fetchShopCatalogue({ fetchImpl })
  assert.equal(firstResult.ok, false)
  assert.equal(firstResult.status, 503)

  // Attempt 2: succeeds on retry
  const secondResult = await fetchShopCatalogue({ fetchImpl })
  assert.equal(secondResult.ok, true)
  assert.equal(secondResult.status, 200)
  assert.equal(secondResult.data.length, 24)
})

test('11. Shop regression remains green', async () => {
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
  assert.equal(result.data.length, 24)
})

test('12. Product Detail regression remains green', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'true' })

  const result = await fetchProductDetail('ban-mai-xanh', {
    fetchImpl: async (url, init) => {
      const fullUrl = url.startsWith('http') ? url : `http://127.0.0.1:5173${url}`
      return worker.fetch(new Request(fullUrl, init), env)
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.data.slug, 'ban-mai-xanh')
  assert.ok(result.data.relatedProducts.length > 0)
})
