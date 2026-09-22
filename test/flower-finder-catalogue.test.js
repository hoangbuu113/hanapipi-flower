import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import {
  fetchProductDetail,
  fetchShopCatalogue,
} from '../src/services/catalogueClient.js'
import {
  buildRecommendationCopy,
  criteriaFromStepAnswers,
  rankProducts,
} from '../src/utils/conciergeGrounding.js'
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

test('1. Finder loads API catalogue', async () => {
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
  assert.equal(result.data.length, 24)
})

test('2. Existing deterministic recommendation result is preserved for representative answer sets', async () => {
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

  // Representative answer set 1: Birthday, Bright, Warm yellow, Under 600k
  const answers1 = {
    occasion: 'Sinh nhật',
    mood: 'Tươi sáng',
    color: 'Vàng ấm',
    budget: 'Dưới 600.000 ₫',
  }
  const criteria1 = criteriaFromStepAnswers(answers1)
  const recommendations1 = rankProducts(result.data, criteria1, 6)
  assert.ok(recommendations1.length > 0)
  assert.equal(recommendations1[0].product.slug, 'nang-diu')

  const copy1 = buildRecommendationCopy(recommendations1[0], criteria1)
  assert.ok(copy1.reason.includes('sinh nhật') || copy1.reason.includes('vàng ấm'))

  // Representative answer set 2: Love, Gentle, Soft pink, 750k+
  const answers2 = {
    occasion: 'Yêu thương',
    mood: 'Dịu dàng',
    color: 'Hồng dịu',
    budget: 'Từ 750.000 ₫',
  }
  const criteria2 = criteriaFromStepAnswers(answers2)
  const recommendations2 = rankProducts(result.data, criteria2, 6)
  assert.ok(recommendations2.length > 0)
  assert.equal(recommendations2[0].product.slug, 'pastel-cloud')
  assert.equal(recommendations2[1].product.slug, 'du-am-hong')
})

test('3. API catalogue fields drive recommendation', async () => {
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

  // Verify all products have expected recommendation fields
  for (const product of products) {
    assert.ok(Array.isArray(product.occasions), `occasions must be an array on ${product.slug}`)
    assert.ok(Array.isArray(product.moods), `moods must be an array on ${product.slug}`)
    assert.ok(Array.isArray(product.colorPalette), `colorPalette must be an array on ${product.slug}`)
  }
})

test('4. API price remains authoritative in recommendation cards', async () => {
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
  const criteria = criteriaFromStepAnswers({
    occasion: 'Sinh nhật',
    mood: 'Tươi sáng',
    color: 'Vàng ấm',
    budget: 'Dưới 600.000 ₫',
  })
  const recommendations = rankProducts(result.data, criteria, 6)
  assert.equal(recommendations[0].product.price, 590000)
  assert.match(getProductPriceLabel(recommendations[0].product), /590\.000.*₫/)
})

test('5. no-watering-flower remains non-purchasable and excluded from recommendations', async () => {
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
  const noWatering = result.data.find((p) => p.slug === 'no-watering-flower')
  assert.ok(noWatering)
  assert.equal(isPurchasableProduct(noWatering), false)

  // Try answer set matching no-watering-flower occasions/moods
  const criteria = criteriaFromStepAnswers({
    occasion: 'Yêu thương',
    mood: 'Dịu dàng',
    color: 'Hồng dịu',
    budget: 'Dưới 600.000 ₫',
  })
  const recommendations = rankProducts(result.data, criteria, 24)
  assert.ok(recommendations.every((r) => r.product.slug !== 'no-watering-flower'), 'no-watering-flower must never be recommended')
})

test('6. Intentional API_NOT_FOUND gate allows static compatibility fallback', async () => {
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
  assert.equal(result.data.length, 24)

  // Recommendation algorithm works with fallback data
  const criteria = criteriaFromStepAnswers({
    occasion: 'Sinh nhật',
    mood: 'Tươi sáng',
    color: 'Vàng ấm',
    budget: 'Dưới 600.000 ₫',
  })
  const recommendations = rankProducts(result.data, criteria, 6)
  assert.ok(recommendations.length > 0)
  assert.equal(recommendations[0].product.slug, 'nang-diu')
})

test('7. HTTP 500 does NOT silently fallback', async () => {
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

test('8. Malformed payload produces safe error state', async () => {
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

test('9. Retry recovers from failed fetch', async () => {
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

  // Attempt 1: fails
  const firstResult = await fetchShopCatalogue({ fetchImpl })
  assert.equal(firstResult.ok, false)
  assert.equal(firstResult.status, 503)

  // Attempt 2: succeeds
  const secondResult = await fetchShopCatalogue({ fetchImpl })
  assert.equal(secondResult.ok, true)
  assert.equal(secondResult.status, 200)
  assert.equal(secondResult.data.length, 24)
})

test('10. Shop regression remains green', async () => {
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

test('11. Product Detail regression remains green', async () => {
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

test('12. SearchPage regression remains green', async () => {
  const searchContent = fs.readFileSync(path.resolve('src/pages/SearchPage.jsx'), 'utf8')
  assert.ok(searchContent.includes('fetchShopCatalogue'))
  assert.ok(!searchContent.includes("from '../data/products'"))
})

test('13. Homepage regression remains green', async () => {
  const homeContent = fs.readFileSync(path.resolve('src/pages/HomePage.jsx'), 'utf8')
  assert.ok(homeContent.includes('fetchShopCatalogue'))
  assert.ok(!homeContent.includes("from '../data/products'"))
})
