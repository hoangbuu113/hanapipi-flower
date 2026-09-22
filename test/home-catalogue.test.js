import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import {
  bestSellers as staticBestSellers,
} from '../src/data/products.js'
import {
  fetchProductDetail,
  fetchShopCatalogue,
} from '../src/services/catalogueClient.js'
import {
  getProductPriceLabel,
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

test('1. Homepage catalogue section loads API data', async () => {
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

  const bestSellers = result.data.filter((p) => p.isBestSeller)
  assert.equal(bestSellers.length, 4)
})

test('2. API price is authoritative for Homepage best sellers', async () => {
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
  const nangDiu = result.data.find((p) => p.slug === 'nang-diu')
  assert.ok(nangDiu)
  assert.equal(nangDiu.price, 590000)
  assert.match(getProductPriceLabel(nangDiu), /590\.000.*₫/)
})

test('3. Existing featured/curated product selection is preserved', async () => {
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
  const apiBestSellerSlugs = result.data
    .filter((p) => p.isBestSeller)
    .map((p) => p.slug)

  const staticBestSellerSlugs = staticBestSellers.map((p) => p.slug)
  assert.deepEqual(apiBestSellerSlugs, staticBestSellerSlugs)
})

test('4. Best sellers ordering is preserved', async () => {
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
  const bestSellers = result.data.filter((p) => p.isBestSeller)
  assert.equal(bestSellers[0].slug, 'nang-diu')
  assert.equal(bestSellers[1].slug, 'du-am-hong')
  assert.equal(bestSellers[2].slug, 'may-trang')
  assert.equal(bestSellers[3].slug, 'vuon-som-mai')
})

test('5. Intentional API_NOT_FOUND gate can use static compatibility fallback', async () => {
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

  const bestSellers = result.data.filter((p) => p.isBestSeller)
  assert.equal(bestSellers.length, staticBestSellers.length)
  assert.equal(bestSellers[0].slug, 'nang-diu')
})

test('6. HTTP 500 does NOT silently fallback', async () => {
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

test('7. Malformed API data does not replace authoritative data with static catalogue', async () => {
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

test('8. Homepage hero renders independently of catalogue loading/error', () => {
  const homeContent = fs.readFileSync(path.resolve('src/pages/HomePage.jsx'), 'utf8')
  // Hero section is defined before best-sellers and does not depend on products, isLoading, or error
  const heroIndex = homeContent.indexOf('<section className="home-hero"')
  const bestSellersIndex = homeContent.indexOf('<section className="home-section" id="best-sellers"')
  assert.ok(heroIndex !== -1, 'Hero section must exist')
  assert.ok(bestSellersIndex !== -1, 'Best sellers section must exist')
  assert.ok(heroIndex < bestSellersIndex, 'Hero section must render before best sellers')

  // Verify critical hero copy and structure are preserved
  assert.ok(homeContent.includes('Một bó hoa, một điều muốn nói.'))
  assert.ok(homeContent.includes('Hoa cho những điều khó nói'))
  assert.ok(homeContent.includes('Những thiết kế hoa tươi được chọn kỹ cho những dịp đáng nhớ.'))
  assert.ok(homeContent.includes('homeImages.hero'))
})

test('9. Catalogue section error does not blank the whole Homepage', () => {
  const homeContent = fs.readFileSync(path.resolve('src/pages/HomePage.jsx'), 'utf8')
  // Sections other than best-sellers must exist unconditionally in the render tree
  assert.ok(homeContent.includes('className="home-section home-section--occasions"'))
  assert.ok(homeContent.includes('className="home-section home-seasonal"'))
  assert.ok(homeContent.includes('className="home-section home-craft"'))
  assert.ok(homeContent.includes('className="home-section home-testimonials"'))
  assert.ok(homeContent.includes('className="home-section home-social"'))
  assert.ok(homeContent.includes('className="home-newsletter"'))
  assert.ok(homeContent.includes('home-best-sellers-error'))
})

test('10. CTA destinations remain unchanged', () => {
  const homeContent = fs.readFileSync(path.resolve('src/pages/HomePage.jsx'), 'utf8')
  assert.ok(homeContent.includes('to="/shop"'))
  assert.ok(homeContent.includes('to="/#best-sellers"'))
  assert.ok(homeContent.includes('to={`/shop?occasion='))
  assert.ok(homeContent.includes('href="https://www.instagram.com/tiem_hoa_hanapipi/"'))
})

test('11. Responsive and structural markup is not unnecessarily rewritten', () => {
  const cssContent = fs.readFileSync(path.resolve('src/pages/HomePage.css'), 'utf8')
  assert.ok(cssContent.includes('.home-hero'))
  assert.ok(cssContent.includes('.home-hero__grid'))
  assert.ok(cssContent.includes('.home-hero__copy'))
  assert.ok(cssContent.includes('.home-hero__media'))
  assert.ok(cssContent.includes('.product-grid'))
  assert.ok(cssContent.includes('.home-best-sellers-loading'))
  assert.ok(cssContent.includes('.home-best-sellers-error'))
})

test('12. Shop regression remains green', async () => {
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

test('13. Product Detail regression remains green', async () => {
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

test('14. SearchPage regression remains green', async () => {
  const searchContent = fs.readFileSync(path.resolve('src/pages/SearchPage.jsx'), 'utf8')
  assert.ok(searchContent.includes('fetchShopCatalogue'))
  assert.ok(!searchContent.includes("from '../data/products'"))
})
