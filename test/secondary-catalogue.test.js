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
import { handleConciergeRequest } from '../src/server/concierge.js'
import { redactConciergeText } from '../src/utils/conciergePrivacy.js'
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

function createConciergePayload(overrides = {}) {
  return {
    history: [],
    locale: 'vi-VN',
    message: 'Tư vấn hoa sinh nhật dịu dàng khoảng 700 nghìn.',
    pageContext: { productId: null, route: '/shop' },
    ...overrides,
  }
}

function createConciergeRequestObject(payload) {
  return new Request('http://127.0.0.1:5173/api/concierge', {
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
}

function createGroqSuccess(modelPayload = {
  linkIds: [],
  message: 'Mình đã chọn vài bó hoa phù hợp.',
  note: null,
  productIds: [],
  quickReplies: [],
  type: 'answer',
}) {
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(modelPayload) } }],
  }), { headers: { 'Content-Type': 'application/json' } })
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

test('2. Concierge: browser request omits catalogue data and current D1 wins server-side', async () => {
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

  const request = createConciergeRequest({
    history: [],
    message: 'Tư vấn giúp tôi',
    pageContext: { productId: updatedProduct.id, route: `/product/${updatedProduct.slug}` },
  })
  assert.equal('candidates' in request, false)

  let upstreamRequest = null
  const response = await handleConciergeRequest(
    createConciergeRequestObject(request),
    { DB: d1, GROQ_API_KEY: 'test-only-key' },
    {
      fetchImpl: async (_url, init) => {
        upstreamRequest = JSON.parse(init.body)
        return createGroqSuccess()
      },
    },
  )
  assert.equal(response.status, 200)

  const upstreamData = JSON.parse(upstreamRequest.messages[1].content)
  const authoritative = upstreamData.candidateProducts.find(({ id }) => id === 'nang-diu')
  assert.equal(authoritative.name, 'Nắng Dịu Custom Title')
  assert.equal(authoritative.price, 999000)
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

test('5a. Concierge: Worker rejects client catalogue candidates instead of trusting them', async () => {
  const { d1 } = createSeededDatabase()
  let upstreamCalled = false
  const response = await handleConciergeRequest(
    createConciergeRequestObject({
      ...createConciergePayload(),
      candidates: [{ id: 'made-up-product', name: 'Fake', price: 1 }],
    }),
    { DB: d1, GROQ_API_KEY: 'test-only-key' },
    {
      fetchImpl: async () => {
        upstreamCalled = true
        return createGroqSuccess()
      },
    },
  )
  assert.equal(response.status, 400)
  assert.equal((await response.json()).code, 'INVALID_REQUEST')
  assert.equal(upstreamCalled, false)
})

test('5b. Concierge: server candidates exclude inactive, nonexistent and priceless products', async () => {
  const { d1, sqlite } = createSeededDatabase()
  sqlite.prepare("UPDATE products SET active = 0 WHERE id = 'nang-diu'").run()
  let upstreamRequest = null
  const response = await handleConciergeRequest(
    createConciergeRequestObject(createConciergePayload({
      message: 'Tìm hoa yêu thương dịu dàng.',
      pageContext: { productId: 'no-watering-flower', route: '/product/no-watering-flower' },
    })),
    { DB: d1, GROQ_API_KEY: 'test-only-key' },
    {
      fetchImpl: async (_url, init) => {
        upstreamRequest = JSON.parse(init.body)
        return createGroqSuccess()
      },
    },
  )
  assert.equal(response.status, 200)
  const upstreamData = JSON.parse(upstreamRequest.messages[1].content)
  assert.equal(upstreamData.candidateProducts.some(({ id }) => id === 'nang-diu'), false)
  assert.equal(upstreamData.candidateProducts.some(({ id }) => id === 'no-watering-flower'), false)
  assert.equal(upstreamData.candidateProducts.some(({ id }) => id === 'missing-product'), false)
  assert.ok(upstreamData.candidateProducts.every(({ price }) => Number.isInteger(price)))
})

test('5c. Concierge: PII and obvious pasted secrets are redacted before Groq', async () => {
  const { d1 } = createSeededDatabase()
  const fakeJwt = `eyJ${'a'.repeat(16)}.${'b'.repeat(16)}.${'c'.repeat(16)}`
  const fakeApiKey = `gsk_${'d'.repeat(28)}`
  const fakeAddress = '12 Nguyễn Huệ, Phường Bến Nghé'
  let upstreamRequest = null
  const response = await handleConciergeRequest(
    createConciergeRequestObject(createConciergePayload({
      history: [{ content: `Bearer ${'z'.repeat(48)}`, role: 'user' }],
      message: `Email demo@example.invalid, số 0901234567, mã HF-20260923-ABCDEF12. Địa chỉ: ${fakeAddress}. Token ${fakeJwt}, key ${fakeApiKey}. Tư vấn hoa sinh nhật.`,
    })),
    { DB: d1, GROQ_API_KEY: 'test-only-key' },
    {
      fetchImpl: async (_url, init) => {
        upstreamRequest = JSON.parse(init.body)
        return createGroqSuccess()
      },
    },
  )
  assert.equal(response.status, 200)
  const upstreamText = upstreamRequest.messages[1].content
  assert.doesNotMatch(upstreamText, /demo@example\.invalid|0901234567|HF-20260923-ABCDEF12/iu)
  assert.equal(upstreamText.includes(fakeAddress), false)
  assert.equal(upstreamText.includes(fakeJwt), false)
  assert.equal(upstreamText.includes(fakeApiKey), false)
  assert.match(upstreamText, /đã ẩn/iu)
  assert.equal(redactConciergeText('Tặng hoa cho Nguyễn dịp sinh nhật.'), 'Tặng hoa cho Nguyễn dịp sinh nhật.')
})

test('5d. Concierge: invalid model product IDs and malformed provider payload fail safely', async () => {
  const { d1 } = createSeededDatabase()
  const env = { DB: d1, GROQ_API_KEY: 'test-only-key' }

  const protectedProduct = await handleConciergeRequest(
    createConciergeRequestObject(createConciergePayload()),
    env,
    {
      fetchImpl: async () => createGroqSuccess({
        linkIds: [],
        message: 'Không hợp lệ.',
        note: null,
        productIds: ['no-watering-flower'],
        quickReplies: [],
        type: 'recommendations',
      }),
    },
  )
  assert.equal(protectedProduct.status, 502)
  assert.equal((await protectedProduct.json()).code, 'AI_INVALID_RESPONSE')

  const malformed = await handleConciergeRequest(
    createConciergeRequestObject(createConciergePayload()),
    env,
    { fetchImpl: async () => new Response('{not-json', { status: 200 }) },
  )
  assert.equal(malformed.status, 502)
  assert.equal((await malformed.json()).code, 'AI_INVALID_RESPONSE')
})

test('5e. Concierge: provider auth, rate-limit, timeout and unavailable catalogue stay safe', async () => {
  const { d1 } = createSeededDatabase()
  const requestPayload = createConciergePayload()
  const env = { DB: d1, GROQ_API_KEY: 'test-only-key' }

  for (const [status, expectedCode] of [[401, 'AI_AUTH_FAILED'], [403, 'AI_AUTH_FAILED'], [429, 'AI_RATE_LIMITED'], [500, 'AI_UPSTREAM_ERROR']]) {
    const response = await handleConciergeRequest(
      createConciergeRequestObject(requestPayload),
      env,
      { fetchImpl: async () => new Response('', { status }) },
    )
    assert.equal((await response.json()).code, expectedCode)
  }

  const timeout = await handleConciergeRequest(
    createConciergeRequestObject(requestPayload),
    env,
    {
      fetchImpl: async (_url, init) => new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      }),
      timeoutMs: 5,
    },
  )
  assert.equal(timeout.status, 504)
  assert.equal((await timeout.json()).code, 'AI_TIMEOUT')

  const unavailable = await handleConciergeRequest(
    createConciergeRequestObject(requestPayload),
    env,
    { candidateLoader: async () => { throw new Error('private database detail') } },
  )
  assert.equal(unavailable.status, 503)
  assert.deepEqual(await unavailable.json(), {
    code: 'AI_UNAVAILABLE',
    message: 'Dữ liệu tư vấn hiện chưa sẵn sàng.',
  })
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
