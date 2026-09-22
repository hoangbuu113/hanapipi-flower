import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'

import { createWorker } from '../src/worker.js'

const localOrigin = 'http://127.0.0.1:5173'
const silentLogger = { info() {} }

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

function createAssetsBinding() {
  return {
    async fetch() {
      return new Response('Not found', { status: 404 })
    },
  }
}

function createEnv(d1) {
  return {
    API_ALLOWED_ORIGINS: localOrigin,
    API_V1_ENABLED: 'true',
    ASSETS: createAssetsBinding(),
    DB: d1,
  }
}

async function readJson(response) {
  return JSON.parse(await response.text())
}

test('1. GET /api/v1/catalogue/products returns 24 products total', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: silentLogger })
  const response = await worker.fetch(new Request(`${localOrigin}/api/v1/catalogue/products`), createEnv(d1))
  const body = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(body.data.items.length, 24)
  assert.equal(body.data.products.length, 24)
  assert.equal(body.data.total, 24)
  assert.equal(body.data.version, 'catalogue-2026-08-24-v1')
})

test('2. exactly 23 products are purchasable and 3. exactly 1 is priceless', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: silentLogger })
  const response = await worker.fetch(new Request(`${localOrigin}/api/v1/catalogue/products`), createEnv(d1))
  const body = await readJson(response)

  const purchasable = body.data.items.filter((p) => p.isPurchasable)
  const priceless = body.data.items.filter((p) => p.purchaseType === 'priceless')

  assert.equal(purchasable.length, 23, 'Exactly 23 products must be purchasable')
  assert.equal(priceless.length, 1, 'Exactly 1 product must be priceless')

  for (const product of purchasable) {
    assert.equal(product.purchaseType, 'standard')
    assert.equal(typeof product.priceVnd, 'number')
    assert.ok(product.priceVnd > 0)
  }

  for (const product of priceless) {
    assert.equal(product.isPurchasable, false)
    assert.equal(product.priceVnd, null)
  }
})

test('4. no-watering-flower exists in the catalogue list', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: silentLogger })
  const response = await worker.fetch(new Request(`${localOrigin}/api/v1/catalogue/products`), createEnv(d1))
  const body = await readJson(response)

  const noWatering = body.data.items.find((p) => p.slug === 'no-watering-flower')
  assert.ok(noWatering, 'no-watering-flower must exist in the catalogue')
  assert.equal(noWatering.id, 'no-watering-flower')
  assert.equal(noWatering.name, 'Bông Hoa Không Cần Tưới')
})

test('5. no-watering-flower cannot be represented as purchasable', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: silentLogger })
  const response = await worker.fetch(new Request(`${localOrigin}/api/v1/catalogue/products/no-watering-flower`), createEnv(d1))
  const body = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(body.data.product.id, 'no-watering-flower')
  assert.equal(body.data.product.isPurchasable, false)
  assert.equal(body.data.product.priceVnd, null)
  assert.equal(body.data.product.purchaseType, 'priceless')
})

test('6. list data comes from D1/repository, not frontend static import', async () => {
  const { d1, sqlite } = createSeededDatabase()
  const worker = createWorker({ logger: silentLogger })

  // Update a product name in D1 to verify the API returns D1 data
  sqlite.prepare("UPDATE products SET name = 'Hoa Độc Quyền D1' WHERE id = 'nang-diu'").run()

  const response = await worker.fetch(new Request(`${localOrigin}/api/v1/catalogue/products`), createEnv(d1))
  const body = await readJson(response)

  const updated = body.data.items.find((p) => p.id === 'nang-diu')
  assert.equal(updated.name, 'Hoa Độc Quyền D1', 'Response must reflect D1 data modifications')
})

test('7. valid product detail lookup works for both /catalogue/products/:slug and /catalogue/:slug', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: silentLogger })

  // 7a. via /api/v1/catalogue/products/nang-diu
  const res1 = await worker.fetch(new Request(`${localOrigin}/api/v1/catalogue/products/nang-diu`), createEnv(d1))
  const body1 = await readJson(res1)
  assert.equal(res1.status, 200)
  assert.equal(body1.data.product.slug, 'nang-diu')
  assert.ok(Array.isArray(body1.data.variants), 'variants must be an array')
  assert.ok(body1.data.variants.length > 0, 'nang-diu should have variants')
  assert.ok(Array.isArray(body1.data.relatedProducts), 'relatedProducts must be an array')
  assert.equal(body1.data.relatedProducts.length, 3, 'nang-diu should have 3 related products')

  // 7b. via /api/v1/catalogue/nang-diu
  const res2 = await worker.fetch(new Request(`${localOrigin}/api/v1/catalogue/nang-diu`), createEnv(d1))
  const body2 = await readJson(res2)
  assert.equal(res2.status, 200)
  assert.equal(body2.data.product.id, body1.data.product.id)
})

test('8. unknown slug/id returns 404 PRODUCT_NOT_FOUND', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: silentLogger })
  const response = await worker.fetch(new Request(`${localOrigin}/api/v1/catalogue/products/non-existent-flower`), createEnv(d1))
  const body = await readJson(response)

  assert.equal(response.status, 404)
  assert.equal(body.error.code, 'PRODUCT_NOT_FOUND')
})

test('9. no auth required for public catalogue reads', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: silentLogger })

  // Request without Authorization header
  const listRes = await worker.fetch(new Request(`${localOrigin}/api/v1/catalogue/products`), createEnv(d1))
  assert.equal(listRes.status, 200)

  const detailRes = await worker.fetch(new Request(`${localOrigin}/api/v1/catalogue/products/du-am-hong`), createEnv(d1))
  assert.equal(detailRes.status, 200)
})

test('10. existing auth/admin endpoints remain unaffected', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: silentLogger })

  // /api/v1/me still requires auth -> 401
  const meRes = await worker.fetch(new Request(`${localOrigin}/api/v1/me`), createEnv(d1))
  assert.equal(meRes.status, 401)

  // /api/v1/admin/me still requires auth -> 401
  const adminRes = await worker.fetch(new Request(`${localOrigin}/api/v1/admin/me`), createEnv(d1))
  assert.equal(adminRes.status, 401)
})

test('11. purchaseType filter distinguishes standard vs priceless', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: silentLogger })

  // purchaseType=standard -> 23 items
  const stdRes = await worker.fetch(new Request(`${localOrigin}/api/v1/catalogue/products?purchaseType=standard`), createEnv(d1))
  const stdBody = await readJson(stdRes)
  assert.equal(stdBody.data.items.length, 23)
  assert.ok(stdBody.data.items.every((p) => p.isPurchasable))

  // purchaseType=priceless -> 1 item (no-watering-flower)
  const plRes = await worker.fetch(new Request(`${localOrigin}/api/v1/catalogue/products?purchaseType=priceless`), createEnv(d1))
  const plBody = await readJson(plRes)
  assert.equal(plBody.data.items.length, 1)
  assert.equal(plBody.data.items[0].slug, 'no-watering-flower')
})

test('12. budget filter excludes priceless products with null price', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: silentLogger })

  const res = await worker.fetch(new Request(`${localOrigin}/api/v1/catalogue/products?budget=1000000`), createEnv(d1))
  const body = await readJson(res)

  assert.ok(body.data.items.length > 0)
  for (const item of body.data.items) {
    assert.ok(item.priceVnd != null && item.priceVnd <= 1000000)
    assert.notEqual(item.slug, 'no-watering-flower')
  }
})

test('13. unsupported HTTP method returns 405 with Allow header', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: silentLogger })

  const postList = await worker.fetch(new Request(`${localOrigin}/api/v1/catalogue/products`, { method: 'POST' }), createEnv(d1))
  assert.equal(postList.status, 405)
  assert.equal(postList.headers.get('Allow'), 'GET')

  const postDetail = await worker.fetch(new Request(`${localOrigin}/api/v1/catalogue/products/nang-diu`, { method: 'POST' }), createEnv(d1))
  assert.equal(postDetail.status, 405)
  assert.equal(postDetail.headers.get('Allow'), 'GET')
})

test('14. /api/v1/catalogue and /api/v1/catalogue/products return identical list data', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: silentLogger })

  const res1 = await readJson(await worker.fetch(new Request(`${localOrigin}/api/v1/catalogue`), createEnv(d1)))
  const res2 = await readJson(await worker.fetch(new Request(`${localOrigin}/api/v1/catalogue/products`), createEnv(d1)))

  assert.equal(res1.data.items.length, res2.data.items.length)
  assert.deepEqual(res1.data.items.map((p) => p.id), res2.data.items.map((p) => p.id))
})

test('15. deterministic sorting options work correctly with priceless item sorting last', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: silentLogger })

  // price_asc
  const ascRes = await worker.fetch(new Request(`${localOrigin}/api/v1/catalogue/products?sort=price_asc`), createEnv(d1))
  const ascBody = await readJson(ascRes)
  assert.equal(ascBody.data.items.length, 24)
  const pricedAsc = ascBody.data.items.filter((p) => p.priceVnd != null)
  for (let i = 0; i < pricedAsc.length - 1; i += 1) {
    assert.ok(pricedAsc[i].priceVnd <= pricedAsc[i + 1].priceVnd)
  }
  assert.equal(ascBody.data.items[ascBody.data.items.length - 1].slug, 'no-watering-flower')

  // price_desc
  const descRes = await worker.fetch(new Request(`${localOrigin}/api/v1/catalogue/products?sort=price_desc`), createEnv(d1))
  const descBody = await readJson(descRes)
  const pricedDesc = descBody.data.items.filter((p) => p.priceVnd != null)
  for (let i = 0; i < pricedDesc.length - 1; i += 1) {
    assert.ok(pricedDesc[i].priceVnd >= pricedDesc[i + 1].priceVnd)
  }
  assert.equal(descBody.data.items[descBody.data.items.length - 1].slug, 'no-watering-flower')
})
