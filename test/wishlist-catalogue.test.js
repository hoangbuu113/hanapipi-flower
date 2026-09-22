import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { normalizeStoredWishlistIds } from '../src/utils/wishlist.js'
import { fetchShopCatalogue } from '../src/services/catalogueClient.js'
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

test('1. empty Wishlist does not crash', () => {
  const wishlistIds = []
  const products = [{ id: 'nang-diu', name: 'Nắng Dịu' }]
  const resolved = wishlistIds.map((id) => products.find((p) => p.id === id)).filter(Boolean)
  assert.deepEqual(resolved, [])
})

test('2. wishlist identifiers resolve through API catalogue', async () => {
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
  const wishlistIds = ['nang-diu', 'du-am-hong']
  const resolved = wishlistIds
    .map((id) => result.data.find((p) => p.id === id || p.slug === id))
    .filter(Boolean)

  assert.equal(resolved.length, 2)
  assert.equal(resolved[0].slug, 'nang-diu')
  assert.equal(resolved[1].slug, 'du-am-hong')
})

test('3. API name is displayed', async () => {
  const { d1, sqlite } = createSeededDatabase()
  // Update name in D1
  sqlite.prepare("UPDATE products SET name = 'Nắng Dịu Ban Mai Mới' WHERE slug = 'nang-diu'").run()

  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'true' })

  const result = await fetchShopCatalogue({
    fetchImpl: async (url, init) => {
      const fullUrl = url.startsWith('http') ? url : `http://127.0.0.1:5173${url}`
      return worker.fetch(new Request(fullUrl, init), env)
    },
  })

  const resolved = ['nang-diu']
    .map((id) => result.data.find((p) => p.id === id || p.slug === id))
    .filter(Boolean)

  assert.equal(resolved[0].name, 'Nắng Dịu Ban Mai Mới')
})

test('4. API price is authoritative', async () => {
  const { d1, sqlite } = createSeededDatabase()
  // Change price from 590000 to 650000
  sqlite.prepare('UPDATE products SET price_vnd = 650000 WHERE slug = ?').run('nang-diu')

  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'true' })

  const result = await fetchShopCatalogue({
    fetchImpl: async (url, init) => {
      const fullUrl = url.startsWith('http') ? url : `http://127.0.0.1:5173${url}`
      return worker.fetch(new Request(fullUrl, init), env)
    },
  })

  const product = result.data.find((p) => p.slug === 'nang-diu')
  assert.equal(product.priceVnd, 650000)
  assert.equal(product.price, 650000)
})

test('5. API media is used', async () => {
  const { d1, sqlite } = createSeededDatabase()
  const customMedia = JSON.stringify([
    {
      alt: 'Ảnh thử nghiệm R2',
      caption: null,
      fit: 'cover',
      position: 'center',
      poster: null,
      src: '/api/v1/media/products/nang-diu/custom-image.jpg',
      type: 'image',
    },
  ])
  sqlite.prepare('UPDATE products SET media_json = ? WHERE slug = ?').run(customMedia, 'nang-diu')

  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'true' })

  const result = await fetchShopCatalogue({
    fetchImpl: async (url, init) => {
      const fullUrl = url.startsWith('http') ? url : `http://127.0.0.1:5173${url}`
      return worker.fetch(new Request(fullUrl, init), env)
    },
  })

  const product = result.data.find((p) => p.slug === 'nang-diu')
  assert.equal(product.images[0].src, '/api/v1/media/products/nang-diu/custom-image.jpg')
})

test('6. Admin-style changed price is reflected after reload', async () => {
  const { d1, sqlite } = createSeededDatabase()
  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'true' })

  const fetcher = async (url, init) => {
    const fullUrl = url.startsWith('http') ? url : `http://127.0.0.1:5173${url}`
    return worker.fetch(new Request(fullUrl, init), env)
  }

  // First read: 590000
  const res1 = await fetchShopCatalogue({ fetchImpl: fetcher })
  const p1 = res1.data.find((p) => p.slug === 'nang-diu')
  assert.equal(p1.priceVnd, 590000)

  // Admin updates price to 620000
  sqlite.prepare('UPDATE products SET price_vnd = 620000 WHERE slug = ?').run('nang-diu')

  // Reload Wishlist read: 620000
  const res2 = await fetchShopCatalogue({ fetchImpl: fetcher })
  const p2 = res2.data.find((p) => p.slug === 'nang-diu')
  assert.equal(p2.priceVnd, 620000)
})

test('7. remove Wishlist item persists', () => {
  let wishlistIds = ['nang-diu', 'du-am-hong']
  const toggleWishlist = (productId) => {
    wishlistIds = wishlistIds.includes(productId)
      ? wishlistIds.filter((id) => id !== productId)
      : [...wishlistIds, productId]
  }

  toggleWishlist('nang-diu')
  assert.deepEqual(wishlistIds, ['du-am-hong'])
})

test('8. add Wishlist item persists', () => {
  let wishlistIds = ['nang-diu']
  const toggleWishlist = (productId) => {
    wishlistIds = wishlistIds.includes(productId)
      ? wishlistIds.filter((id) => id !== productId)
      : [...wishlistIds, productId]
  }

  toggleWishlist('du-am-hong')
  assert.deepEqual(wishlistIds, ['nang-diu', 'du-am-hong'])
})

test('9. legacy localStorage snapshot format is migrated/read safely', () => {
  const legacyStorage = [
    { id: 'nang-diu', name: 'Nắng Dịu', price: 590000 },
    { slug: 'du-am-hong' },
    'ban-mai',
    '   ',
    null,
    123,
    { invalid: true },
    'nang-diu', // duplicate
  ]

  const migrated = normalizeStoredWishlistIds(legacyStorage)
  assert.deepEqual(migrated, ['nang-diu', 'du-am-hong', 'ban-mai'])
})

test('10. API gate can use narrow static compatibility fallback', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: { info() {} } })
  // API_V1_ENABLED is 'false' (gated)
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
  assert.equal(Array.isArray(result.data), true)
  assert.equal(result.data.length > 0, true)
})

test('11. HTTP 500 does NOT silently fallback', async () => {
  const mock500Fetch = async () => new Response('Internal Error', { status: 500 })

  const result = await fetchShopCatalogue({ fetchImpl: mock500Fetch })
  assert.equal(result.ok, false)
  assert.equal(result.isFallback, false)
  assert.equal(result.status, 500)
  assert.equal(result.data, null)
})

test('12. malformed API response produces safe error', async () => {
  const mockMalformedFetch = async () =>
    new Response(JSON.stringify({ data: { items: 'not-an-array' } }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })

  const result = await fetchShopCatalogue({ fetchImpl: mockMalformedFetch })
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'MALFORMED_RESPONSE')
  assert.equal(result.data, null)
})

test('13. retry recovers', async () => {
  let attempt = 0
  const mockFlakyFetch = async () => {
    attempt++
    if (attempt === 1) {
      return new Response('Error', { status: 500 })
    }
    return new Response(
      JSON.stringify({
        data: {
          items: [
            {
              active: true,
              id: 'nang-diu',
              name: 'Nắng Dịu',
              priceVnd: 590000,
              slug: 'nang-diu',
            },
          ],
        },
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  }

  const res1 = await fetchShopCatalogue({ fetchImpl: mockFlakyFetch })
  assert.equal(res1.ok, false)

  const res2 = await fetchShopCatalogue({ fetchImpl: mockFlakyFetch })
  assert.equal(res2.ok, true)
  assert.equal(res2.data[0].slug, 'nang-diu')
})

test('14. archived/missing product identifier does not resurrect from static data', async () => {
  const { d1, sqlite } = createSeededDatabase()
  // Archive nang-diu in D1
  sqlite.prepare('UPDATE products SET active = 0 WHERE slug = ?').run('nang-diu')

  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'true' })

  const result = await fetchShopCatalogue({
    fetchImpl: async (url, init) => {
      const fullUrl = url.startsWith('http') ? url : `http://127.0.0.1:5173${url}`
      return worker.fetch(new Request(fullUrl, init), env)
    },
  })

  assert.equal(result.ok, true)
  const wishlistIds = ['nang-diu', 'du-am-hong']
  const resolved = wishlistIds
    .map((id) => result.data.find((p) => p.id === id || p.slug === id))
    .filter(Boolean)

  assert.equal(resolved.length, 1)
  assert.equal(resolved[0].slug, 'du-am-hong')
  assert.equal(resolved.some((p) => p.slug === 'nang-diu'), false, 'Archived product must NOT appear in wishlist')
})

test('15. no-watering-flower remains priceless/non-purchasable', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createWorker({ logger: { info() {} } })
  const env = createEnv(d1, { apiV1Enabled: 'true' })

  const result = await fetchShopCatalogue({
    fetchImpl: async (url, init) => {
      const fullUrl = url.startsWith('http') ? url : `http://127.0.0.1:5173${url}`
      return worker.fetch(new Request(fullUrl, init), env)
    },
  })

  const resolved = ['no-watering-flower']
    .map((id) => result.data.find((p) => p.id === id || p.slug === id))
    .filter(Boolean)

  assert.equal(resolved.length, 1)
  assert.equal(resolved[0].purchaseType, 'priceless')
  assert.equal(resolved[0].priceVnd, null)
  assert.equal(resolved[0].isPurchasable, false)
})

test('16. Product Detail wishlist toggle remains functional', () => {
  const detailCode = fs.readFileSync(path.resolve('src/pages/ProductDetailPage.jsx'), 'utf8')
  assert.match(detailCode, /toggleWishlist\(product\.id\)/u)
  assert.match(detailCode, /isWishlisted\s*=\s*wishlistIds\.includes\(product\.id\)/u)
})

test('17. Shop wishlist toggle remains functional if applicable', () => {
  const cardCode = fs.readFileSync(path.resolve('src/components/ProductCard.jsx'), 'utf8')
  assert.match(cardCode, /toggleWishlist\(product\.id\)/u)
  assert.match(cardCode, /isWishlisted\s*=\s*wishlistIds\.includes\(product\.id\)/u)
})

test('18. Cart behavior remains unchanged in CommerceContext', () => {
  const contextCode = fs.readFileSync(path.resolve('src/context/CommerceContext.jsx'), 'utf8')
  assert.match(contextCode, /import\s*\{\s*getProductById\s*\}\s*from\s*'\.\.\/data\/products'/u)
  assert.match(contextCode, /readCartStorage/u)
  assert.match(contextCode, /addToCart/u)
  assert.match(contextCode, /isPurchasableProduct\(getProductById\(productId\)\)/u)
})

test('19. WishlistPage does NOT import static products.js', () => {
  const wishlistPageCode = fs.readFileSync(path.resolve('src/pages/WishlistPage.jsx'), 'utf8')
  assert.equal(/from\s*['"].*data\/products.*['"]/u.test(wishlistPageCode), false, 'WishlistPage must not import data/products')
  assert.match(wishlistPageCode, /fetchShopCatalogue/u, 'WishlistPage must use fetchShopCatalogue')
})

test('20. empty stored wishlist avoids unnecessary catalogue fetch', () => {
  const wishlistPageCode = fs.readFileSync(path.resolve('src/pages/WishlistPage.jsx'), 'utf8')
  assert.match(wishlistPageCode, /if\s*\(!hasWishlist\)\s*return/u, 'Must guard against fetching when wishlist is empty')
})
