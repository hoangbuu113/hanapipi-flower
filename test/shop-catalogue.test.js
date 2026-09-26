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

test('Catalogue concurrent Home/Concierge callers share one request and result', async () => {
  let calls = 0
  let release
  const fetchImpl = () => {
    calls += 1
    return new Promise(resolve => { release = resolve })
  }
  const home = fetchShopCatalogue({ fetchImpl })
  const concierge = fetchShopCatalogue({ fetchImpl })
  assert.equal(calls, 1)
  release(Response.json({ data: { items: [] } }))
  const [a, b] = await Promise.all([home, concierge])
  assert.equal(a.ok, true)
  assert.strictEqual(a, b)
})

test('Catalogue sequential calls and failed responses never remain cached', async () => {
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    return calls === 1
      ? Response.json({ error: { code: 'TEMPORARY' } }, { status: 503 })
      : Response.json({ data: { items: [], version: String(calls) } })
  }
  assert.equal((await fetchShopCatalogue({ fetchImpl })).ok, false)
  assert.equal((await fetchShopCatalogue({ fetchImpl })).version, '2')
  assert.equal((await fetchShopCatalogue({ fetchImpl })).version, '3')
  assert.equal(calls, 3)
})

test('Catalogue caller abort is isolated from other subscribers', async () => {
  let release
  let underlyingSignal
  const fetchImpl = (_url, options) => {
    underlyingSignal = options.signal
    return new Promise(resolve => { release = resolve })
  }
  const controller = new AbortController()
  const cancelled = fetchShopCatalogue({ fetchImpl, signal: controller.signal })
  const active = fetchShopCatalogue({ fetchImpl })
  controller.abort()
  await assert.rejects(cancelled, { name: 'AbortError' })
  assert.equal(underlyingSignal.aborted, false)
  release(Response.json({ data: { items: [] } }))
  assert.equal((await active).ok, true)
})

test('Catalogue last abort evicts entry; late settlement cannot evict a new request', async () => {
  const pending = []
  const fetchImpl = (_url, { signal }) => new Promise(resolve => pending.push({ resolve, signal }))
  const controller = new AbortController()
  const old = fetchShopCatalogue({ fetchImpl, signal: controller.signal })
  controller.abort()
  await assert.rejects(old, { name: 'AbortError' })
  assert.equal(pending[0].signal.aborted, true)
  const fresh = fetchShopCatalogue({ fetchImpl })
  pending[0].resolve(Response.json({ data: { items: [] } }))
  await new Promise(resolve => setImmediate(resolve))
  const shared = fetchShopCatalogue({ fetchImpl })
  assert.equal(pending.length, 2)
  pending[1].resolve(Response.json({ data: { items: [] } }))
  assert.strictEqual(await fresh, await shared)
  await assert.rejects(fetchShopCatalogue({ fetchImpl, signal: controller.signal }), { name: 'AbortError' })
  assert.equal(pending.length, 2)
})

test('Catalogue endpoints have independent in-flight requests', async () => {
  let calls = 0
  const fetchImpl = async () => { calls += 1; return Response.json({ data: { items: [] } }) }
  await Promise.all([
    fetchShopCatalogue({ fetchImpl, endpoint: '/one' }),
    fetchShopCatalogue({ fetchImpl, endpoint: '/two' }),
  ])
  assert.equal(calls, 2)
})

test('Concierge retries only without successfully loaded catalogue, including empty results', () => {
  const source = fs.readFileSync(path.resolve('src/components/ConciergeWidget.jsx'), 'utf8')
  const send = source.slice(source.indexOf('async function sendMessage'), source.indexOf('const currentProduct = pageData'))
  assert.match(send, /if \(!catalogueReadyRef\.current\)\s*\{\s*const result = await fetchShopCatalogue\(\)/)
  assert.match(send, /result\.ok && Array\.isArray\(result\.data\)/)
  assert.match(send, /catalogueReadyRef\.current = true/)
  assert.equal((send.match(/fetchShopCatalogue\(/g) ?? []).length, 1)
})

// Execute the actual pre-message loading block without DOM/AI dependencies.
function createConciergeCatalogueHarness(fetchCatalogue) {
  const source = fs.readFileSync(path.resolve('src/components/ConciergeWidget.jsx'), 'utf8')
  const start = source.indexOf('    let activeCatalogue = catalogue', source.indexOf('async function sendMessage'))
  const end = source.indexOf('    const currentProduct = pageData', start)
  assert.ok(start > 0 && end > start)
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  const load = new AsyncFunction('catalogue', 'catalogueReadyRef', 'fetchShopCatalogue', 'setCatalogue',
    source.slice(start, end) + '\nreturn activeCatalogue')
  const ready = { current: false }
  let catalogue = []
  return {
    ready,
    message: () => load(catalogue, ready, fetchCatalogue, value => { catalogue = value }),
  }
}

test('Closed Concierge has no catalogue mount effect; Home is the sole startup caller', async () => {
  const source = fs.readFileSync(path.resolve('src/components/ConciergeWidget.jsx'), 'utf8')
  const calls = [...source.matchAll(/fetchShopCatalogue\(/g)]
  assert.equal(calls.length, 1, 'Only the sendMessage branch may fetch catalogue')
  assert.ok(calls[0].index > source.indexOf('async function sendMessage'))
  const home = fs.readFileSync(path.resolve('src/pages/HomePage.jsx'), 'utf8')
  assert.equal((home.match(/fetchShopCatalogue\(/g) ?? []).length, 1)
  let requests = 0
  const fetchImpl = async () => { requests += 1; return Response.json({ data: { items: [] } }) }
  createConciergeCatalogueHarness(() => fetchShopCatalogue({ fetchImpl }))
  assert.equal(requests, 0)
  await fetchShopCatalogue({ fetchImpl })
  assert.equal(requests, 1)
})

test('First Concierge message loads once; later messages reuse successful catalogue', async () => {
  let requests = 0
  const data = [{ id: 'real-flower' }]
  const concierge = createConciergeCatalogueHarness(async () => {
    requests += 1
    return { ok: true, data }
  })
  assert.equal(requests, 0)
  assert.strictEqual(await concierge.message(), data)
  assert.strictEqual(await concierge.message(), data)
  assert.strictEqual(await concierge.message(), data)
  assert.equal(requests, 1)
})

test('Failed Concierge catalogue fetch retries on next message and then stays ready', async () => {
  for (const failure of ['http', 'throw']) {
    let requests = 0
    const concierge = createConciergeCatalogueHarness(async () => {
      requests += 1
      if (requests === 1) {
        if (failure === 'throw') throw new Error('Network unavailable')
        return { ok: false, data: null }
      }
      return { ok: true, data: [] }
    })
    await concierge.message()
    assert.equal(concierge.ready.current, false)
    await concierge.message()
    assert.equal(concierge.ready.current, true)
    await concierge.message()
    assert.equal(requests, 2)
  }
})

test('12. Static products remain intact for compatibility fallback', () => {
  const catalogueClientFile = fs.readFileSync(path.resolve('src/services/catalogueClient.js'), 'utf8')
  assert.ok(catalogueClientFile.includes("from '../data/products.js'"), 'catalogueClient must retain intentional static fallback')
  const detailFile = fs.readFileSync(path.resolve('src/pages/ProductDetailPage.jsx'), 'utf8')
  assert.ok(!detailFile.includes('fetchShopCatalogue'), 'ProductDetailPage must not use fetchShopCatalogue')
  assert.equal(staticProducts.length, 24, 'Static products data must remain intact')
})
