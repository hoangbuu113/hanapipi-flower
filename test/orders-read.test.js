import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { fetchUserOrderDetail, fetchUserOrders } from '../src/services/apiClient.js'
import {
  formatOrderStatus,
  formatPaymentStatus,
  getCartItemPresentation,
} from '../src/utils/order.js'
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
  const m4 = fs.readFileSync(path.resolve('drizzle/0004_update_order_payment_constraints.sql'), 'utf8')
  const m5 = fs.readFileSync(path.resolve('drizzle/0005_add_order_delivering_status.sql'), 'utf8')
  const m6 = fs.readFileSync(path.resolve('drizzle/0006_add_momo_payment_method.sql'), 'utf8')
  const m7 = fs.readFileSync(path.resolve('drizzle/0007_tighten_order_payment_methods.sql'), 'utf8')
  db.exec(m1)
  db.exec(m2)
  db.exec(m3)
  db.exec(m4)
  db.exec(m5)
  db.exec(m6)
  db.exec(m7)
  return { d1: new D1Wrapper(db), sqlite: db }
}

const localOrigin = 'http://127.0.0.1:5173'
const testJwtKey = 'unit-test-orders-read-public-key'
const testFulfilmentKey = Buffer.from('01234567890123456789012345678901').toString('base64')

function createEnv(d1, { apiV1Enabled = 'true', fulfilmentKey = testFulfilmentKey } = {}) {
  const env = {
    API_ALLOWED_ORIGINS: localOrigin,
    API_V1_ENABLED: apiV1Enabled,
    ASSETS: { async fetch() { return new Response('Not found', { status: 404 }) } },
    CLERK_AUTHORIZED_PARTIES: localOrigin,
    CLERK_JWT_KEY: testJwtKey,
    DB: d1,
  }
  if (fulfilmentKey !== null) {
    env.ORDER_FULFILMENT_KEY = fulfilmentKey
  }
  return env
}

function createTestWorker(d1, options = {}) {
  const mockVerifier = async (token, _opts) => {
    if (token === 'customer-a-token') {
      return { azp: localOrigin, sub: 'user_cust_a_subject' }
    }
    if (token === 'customer-b-token') {
      return { azp: localOrigin, sub: 'user_cust_b_subject' }
    }
    throw new Error('Invalid test token')
  }

  const worker = createWorker({ clerkTokenVerifier: mockVerifier, logger: { info() {} } })
  const env = createEnv(d1, options)

  return {
    env,
    async fetch(url, fetchOpts = {}) {
      const fullUrl = url.startsWith('http') ? url : `${localOrigin}${url}`
      const headers = new Headers(fetchOpts.headers || {})
      return worker.fetch(new Request(fullUrl, { ...fetchOpts, headers }), env)
    },
    worker,
  }
}

function seedTestUsers(sqlite) {
  const now = new Date().toISOString()
  sqlite.exec(`
    INSERT INTO users (id, auth_provider, provider_subject, role, status, locale, created_at_utc, updated_at_utc)
    VALUES
      ('usr_cust_a', 'clerk', 'user_cust_a_subject', 'customer', 'active', 'vi-VN', '${now}', '${now}'),
      ('usr_cust_b', 'clerk', 'user_cust_b_subject', 'customer', 'active', 'vi-VN', '${now}', '${now}')
  `)
}

function createOrderPayload(overrides = {}) {
  return {
    address: {
      city: 'TP. Hồ Chí Minh',

      unitCode: '26740',
      detail: '123 Nguyễn Huệ, Phường Bến Nghé',
      district: '',
      ward: 'Phường Sài Gòn',
    },
    buyer: {
      email: 'buyer@example.com',
      name: 'Nguyễn Văn Người Đặt',
      phone: '0901234567',
    },
    recipient: {
      name: 'Nguyễn Thị Người Nhận',
      phone: '0909876543',
    },
    delivery: {
      date: '2026-09-25',
      slot: '09:00 - 12:00',
    },
    gifting: {
      anonymous: false,
      message: 'Chúc mừng sinh nhật!',
      senderName: 'Minh Anh',
    },
    items: [
      {
        giftAddOnIds: ['mini-scented-candle'],
        productId: 'nang-diu',
        quantity: 2,
        sizeId: 'standard',
        wrappingId: 'ivory-paper',
      },
    ],
    paymentMethod: 'bank_transfer',
    ...overrides,
  }
}

// -------------------------------------------------------------
// SECTION 1: Security & Authentication (Tests 1-8)
// -------------------------------------------------------------

test('1. unauthenticated GET /api/v1/orders returns 401', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createTestWorker(d1)

  const response = await worker.fetch('/api/v1/orders', { method: 'GET' })
  assert.equal(response.status, 401)
  const body = await response.json()
  assert.equal(body.error?.code, 'AUTHENTICATION_REQUIRED')
})

test('2. unauthenticated GET /api/v1/orders/:idOrCode returns 401', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createTestWorker(d1)

  const response = await worker.fetch('/api/v1/orders/ord_12345', { method: 'GET' })
  assert.equal(response.status, 401)
  const body = await response.json()
  assert.equal(body.error?.code, 'AUTHENTICATION_REQUIRED')
})

test('3. invalid bearer token returns 401 AUTHENTICATION_REQUIRED', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createTestWorker(d1)

  const response = await worker.fetch('/api/v1/orders', {
    headers: { Authorization: 'Bearer invalid-token' },
    method: 'GET',
  })
  assert.equal(response.status, 401)
  const body = await response.json()
  assert.equal(body.error?.code, 'AUTHENTICATION_REQUIRED')
})

test('4. user A sees only their own orders in list', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedTestUsers(sqlite)
  const worker = createTestWorker(d1)

  // User A places an order
  const resA = await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(createOrderPayload()),
    headers: { Authorization: 'Bearer customer-a-token', 'Content-Type': 'application/json' },
    method: 'POST',
  })
  assert.equal(resA.status, 201)
  const orderA = (await resA.json()).data.order

  // User B places an order
  const resB = await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(createOrderPayload({ buyer: { name: 'Người Đặt B', phone: '0907654321' } })),
    headers: { Authorization: 'Bearer customer-b-token', 'Content-Type': 'application/json' },
    method: 'POST',
  })
  assert.equal(resB.status, 201)
  const _orderB = (await resB.json()).data.order

  // User A lists orders
  const listRes = await worker.fetch('/api/v1/orders', {
    headers: { Authorization: 'Bearer customer-a-token' },
    method: 'GET',
  })
  assert.equal(listRes.status, 200)
  const listBody = await listRes.json()
  assert.equal(listBody.data.orders.length, 1)
  assert.equal(listBody.data.orders[0].id, orderA.id)
  assert.equal(listBody.data.orders[0].code, orderA.code)
})

test('5. user B cannot see user A orders in list', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedTestUsers(sqlite)
  const worker = createTestWorker(d1)

  // User A places an order
  await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(createOrderPayload()),
    headers: { Authorization: 'Bearer customer-a-token', 'Content-Type': 'application/json' },
    method: 'POST',
  })

  // User B has placed no orders
  const listRes = await worker.fetch('/api/v1/orders', {
    headers: { Authorization: 'Bearer customer-b-token' },
    method: 'GET',
  })
  assert.equal(listRes.status, 200)
  const listBody = await listRes.json()
  assert.equal(listBody.data.orders.length, 0)
})

test('6. user B querying user A order by ID returns 404 ORDER_NOT_FOUND', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedTestUsers(sqlite)
  const worker = createTestWorker(d1)

  // User A places an order
  const resA = await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(createOrderPayload()),
    headers: { Authorization: 'Bearer customer-a-token', 'Content-Type': 'application/json' },
    method: 'POST',
  })
  const orderA = (await resA.json()).data.order

  // User B attempts to get User A's order by ID
  const crossRes = await worker.fetch(`/api/v1/orders/${orderA.id}`, {
    headers: { Authorization: 'Bearer customer-b-token' },
    method: 'GET',
  })
  assert.equal(crossRes.status, 404)
  const body = await crossRes.json()
  assert.equal(body.error?.code, 'ORDER_NOT_FOUND')
})

test('7. user B querying user A order by orderCode returns 404 ORDER_NOT_FOUND', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedTestUsers(sqlite)
  const worker = createTestWorker(d1)

  // User A places an order
  const resA = await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(createOrderPayload()),
    headers: { Authorization: 'Bearer customer-a-token', 'Content-Type': 'application/json' },
    method: 'POST',
  })
  const orderA = (await resA.json()).data.order

  // User B attempts to get User A's order by orderCode
  const crossRes = await worker.fetch(`/api/v1/orders/${orderA.code}`, {
    headers: { Authorization: 'Bearer customer-b-token' },
    method: 'GET',
  })
  assert.equal(crossRes.status, 404)
  const body = await crossRes.json()
  assert.equal(body.error?.code, 'ORDER_NOT_FOUND')
})

test('8. querying non-existent order returns 404 ORDER_NOT_FOUND', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedTestUsers(sqlite)
  const worker = createTestWorker(d1)

  const res = await worker.fetch('/api/v1/orders/ord_non_existent', {
    headers: { Authorization: 'Bearer customer-a-token' },
    method: 'GET',
  })
  assert.equal(res.status, 404)
  const body = await res.json()
  assert.equal(body.error?.code, 'ORDER_NOT_FOUND')
})

// -------------------------------------------------------------
// SECTION 2: Snapshot Integrity (Tests 9-13)
// -------------------------------------------------------------

test('9. order items preserve snapshot name even if product is renamed in D1', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedTestUsers(sqlite)
  const worker = createTestWorker(d1)

  // User A places order with nang-diu
  const resA = await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(createOrderPayload()),
    headers: { Authorization: 'Bearer customer-a-token', 'Content-Type': 'application/json' },
    method: 'POST',
  })
  const orderA = (await resA.json()).data.order

  // Admin renames product in D1
  sqlite.exec("UPDATE products SET name = 'Nắng Dịu Đã Đổi Tên' WHERE slug = 'nang-diu'")

  // Detail request
  const detailRes = await worker.fetch(`/api/v1/orders/${orderA.code}`, {
    headers: { Authorization: 'Bearer customer-a-token' },
    method: 'GET',
  })
  assert.equal(detailRes.status, 200)
  const detailBody = await detailRes.json()
  assert.equal(detailBody.data.order.items[0].name, 'Nắng Dịu')
})

test('10. order items preserve snapshot price even if variant price changes in D1', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedTestUsers(sqlite)
  const worker = createTestWorker(d1)

  // User A places order
  const resA = await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(createOrderPayload()),
    headers: { Authorization: 'Bearer customer-a-token', 'Content-Type': 'application/json' },
    method: 'POST',
  })
  const orderA = (await resA.json()).data.order

  // Admin bumps standard size price to 999,000 in D1
  sqlite.exec("UPDATE product_variants SET price_vnd = 999000 WHERE code = 'standard'")

  // Detail request
  const detailRes = await worker.fetch(`/api/v1/orders/${orderA.code}`, {
    headers: { Authorization: 'Bearer customer-a-token' },
    method: 'GET',
  })
  assert.equal(detailRes.status, 200)
  const detailBody = await detailRes.json()
  assert.equal(detailBody.data.order.items[0].size.price, 590000)
  assert.equal(detailBody.data.order.items[0].unitTotalVnd, 710000)
})

test('11. order items preserve snapshot even if product is archived in D1', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedTestUsers(sqlite)
  const worker = createTestWorker(d1)

  // User A places order
  const resA = await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(createOrderPayload()),
    headers: { Authorization: 'Bearer customer-a-token', 'Content-Type': 'application/json' },
    method: 'POST',
  })
  const orderA = (await resA.json()).data.order

  // Admin archives product
  sqlite.exec("UPDATE products SET active = 0 WHERE slug = 'nang-diu'")

  // Detail request
  const detailRes = await worker.fetch(`/api/v1/orders/${orderA.code}`, {
    headers: { Authorization: 'Bearer customer-a-token' },
    method: 'GET',
  })
  assert.equal(detailRes.status, 200)
  const detailBody = await detailRes.json()
  assert.equal(detailBody.data.order.items[0].name, 'Nắng Dịu')
  assert.equal(detailBody.data.order.items[0].slug, 'nang-diu')
})

test('12. add-ons preserve snapshot name and price even if add-on changes in D1', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedTestUsers(sqlite)
  const worker = createTestWorker(d1)

  // User A places order
  const resA = await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(createOrderPayload()),
    headers: { Authorization: 'Bearer customer-a-token', 'Content-Type': 'application/json' },
    method: 'POST',
  })
  const orderA = (await resA.json()).data.order

  // Admin modifies gift add on in D1
  sqlite.exec("UPDATE gift_add_ons SET name = 'Nến Thơm Đổi Tên', price_vnd = 999999 WHERE id = 'mini-scented-candle'")

  // Detail request
  const detailRes = await worker.fetch(`/api/v1/orders/${orderA.code}`, {
    headers: { Authorization: 'Bearer customer-a-token' },
    method: 'GET',
  })
  assert.equal(detailRes.status, 200)
  const detailBody = await detailRes.json()
  assert.equal(detailBody.data.order.items[0].giftAddOns[0].name, 'Nến thơm mini')
  assert.equal(detailBody.data.order.items[0].giftAddOns[0].price, 120000)
})

test('13. order list is sorted newest first', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedTestUsers(sqlite)
  const worker = createTestWorker(d1)

  // Insert two orders directly with distinct timestamps
  sqlite.exec(`
    INSERT INTO orders (
      id, user_id, order_code, status, revision, subtotal_vnd, total_vnd, currency,
      delivery_date, delivery_slot_id, buyer_contact_ciphertext, recipient_ciphertext,
      delivery_address_ciphertext, gift_message_ciphertext, fulfilment_key_version,
      fulfilment_metadata_json, payment_method, payment_status, created_at_utc, updated_at_utc
    ) VALUES
      ('ord_older', 'usr_cust_a', 'HF-20260901-1111', 'received', 0, 500000, 500000, 'VND',
       '2026-09-05', 'morning', 'enc', 'enc', 'enc', 'enc', 'aes-gcm-v1', '{}', 'bank_transfer', 'pending',
       '2026-09-01T10:00:00.000Z', '2026-09-01T10:00:00.000Z'),
      ('ord_newer', 'usr_cust_a', 'HF-20260920-2222', 'received', 0, 600000, 600000, 'VND',
       '2026-09-25', 'morning', 'enc', 'enc', 'enc', 'enc', 'aes-gcm-v1', '{}', 'bank_transfer', 'pending',
       '2026-09-20T10:00:00.000Z', '2026-09-20T10:00:00.000Z')
  `)

  const listRes = await worker.fetch('/api/v1/orders', {
    headers: { Authorization: 'Bearer customer-a-token' },
    method: 'GET',
  })
  assert.equal(listRes.status, 200)
  const listBody = await listRes.json()
  assert.equal(listBody.data.orders[0].id, 'ord_newer')
  assert.equal(listBody.data.orders[1].id, 'ord_older')
})

// -------------------------------------------------------------
// SECTION 3: Fulfilment PII Protection (Tests 14-19)
// -------------------------------------------------------------

test('14. GET /api/v1/orders (list) does NOT expose any ciphertext fields', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedTestUsers(sqlite)
  const worker = createTestWorker(d1)

  await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(createOrderPayload()),
    headers: { Authorization: 'Bearer customer-a-token', 'Content-Type': 'application/json' },
    method: 'POST',
  })

  const listRes = await worker.fetch('/api/v1/orders', {
    headers: { Authorization: 'Bearer customer-a-token' },
    method: 'GET',
  })
  const text = await listRes.text()
  assert.equal(text.includes('buyer_contact_ciphertext'), false)
  assert.equal(text.includes('recipient_ciphertext'), false)
  assert.equal(text.includes('delivery_address_ciphertext'), false)
  assert.equal(text.includes('gift_message_ciphertext'), false)
  assert.equal(text.includes('ciphertext'), false)
})

test('15. GET /api/v1/orders (list) does NOT decrypt or expose recipient, buyer, or address PII', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedTestUsers(sqlite)
  const worker = createTestWorker(d1)

  await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(createOrderPayload({
      address: { city: 'TP. Hồ Chí Minh', unitCode: '26740', detail: 'SecretDetailAddress123', district: '', ward: 'Phường Sài Gòn' },
      buyer: { email: 'secretbuyer@private.com', name: 'SecretBuyerName', phone: '0901112233' },
      gifting: { message: 'SuperSecretGiftMessage456', senderName: 'SecretSender' },
      recipient: { name: 'SecretRecipientName', phone: '0904445566' },
    })),
    headers: { Authorization: 'Bearer customer-a-token', 'Content-Type': 'application/json' },
    method: 'POST',
  })

  const listRes = await worker.fetch('/api/v1/orders', {
    headers: { Authorization: 'Bearer customer-a-token' },
    method: 'GET',
  })
  const text = await listRes.text()
  assert.equal(text.includes('SecretRecipientName'), false)
  assert.equal(text.includes('SecretBuyerName'), false)
  assert.equal(text.includes('SecretDetailAddress123'), false)
  assert.equal(text.includes('SuperSecretGiftMessage456'), false)
})

test('16. GET /api/v1/orders/:idOrCode (detail) decrypts recipient, buyer, address, and gifting PII for owner', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedTestUsers(sqlite)
  const worker = createTestWorker(d1)

  const createRes = await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(createOrderPayload({
      address: { city: 'TP. Hồ Chí Minh', unitCode: '26740', detail: '456 Lê Duẩn', district: '', ward: 'Phường Sài Gòn' },
      buyer: { email: 'buyer@example.com', name: 'Nguyễn Văn A', phone: '0901234567' },
      gifting: { anonymous: false, message: 'Yêu thương đong đầy!', senderName: 'Minh Anh' },
      recipient: { name: 'Trần Thị B', phone: '0909876543' },
    })),
    headers: { Authorization: 'Bearer customer-a-token', 'Content-Type': 'application/json' },
    method: 'POST',
  })
  const order = (await createRes.json()).data.order

  const detailRes = await worker.fetch(`/api/v1/orders/${order.code}`, {
    headers: { Authorization: 'Bearer customer-a-token' },
    method: 'GET',
  })
  assert.equal(detailRes.status, 200)
  const detail = (await detailRes.json()).data.order
  assert.equal(detail.buyer.name, 'Nguyễn Văn A')
  assert.equal(detail.buyer.phone, '0901234567')
  assert.equal(detail.recipient.name, 'Trần Thị B')
  assert.equal(detail.receiver.name, 'Trần Thị B')
  assert.equal(detail.address.detail, '456 Lê Duẩn')
  assert.equal(detail.gifting.message, 'Yêu thương đong đầy!')
})

test('17. GET /api/v1/orders/:idOrCode (detail) does NOT expose ciphertext fields or key', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedTestUsers(sqlite)
  const worker = createTestWorker(d1)

  const createRes = await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(createOrderPayload()),
    headers: { Authorization: 'Bearer customer-a-token', 'Content-Type': 'application/json' },
    method: 'POST',
  })
  const order = (await createRes.json()).data.order

  const detailRes = await worker.fetch(`/api/v1/orders/${order.code}`, {
    headers: { Authorization: 'Bearer customer-a-token' },
    method: 'GET',
  })
  const text = await detailRes.text()
  assert.equal(text.includes('ciphertext'), false)
  assert.equal(text.includes(testFulfilmentKey), false)
})

test('18. missing ORDER_FULFILMENT_KEY returns 503 on detail request', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedTestUsers(sqlite)
  const worker = createTestWorker(d1, { fulfilmentKey: null })

  // Place order with normal worker first
  const normalWorker = createTestWorker(d1)
  const createRes = await normalWorker.fetch('/api/v1/orders', {
    body: JSON.stringify(createOrderPayload()),
    headers: { Authorization: 'Bearer customer-a-token', 'Content-Type': 'application/json' },
    method: 'POST',
  })
  const order = (await createRes.json()).data.order

  // Query detail with worker that lacks key
  const detailRes = await worker.fetch(`/api/v1/orders/${order.code}`, {
    headers: { Authorization: 'Bearer customer-a-token' },
    method: 'GET',
  })
  assert.equal(detailRes.status, 503)
  const body = await detailRes.json()
  assert.equal(body.error?.code, 'FULFILMENT_ENCRYPTION_UNAVAILABLE')
})

test('19. corrupted ciphertext returns 500 FULFILMENT_DECRYPTION_FAILED on detail request', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedTestUsers(sqlite)
  const worker = createTestWorker(d1)

  const createRes = await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(createOrderPayload()),
    headers: { Authorization: 'Bearer customer-a-token', 'Content-Type': 'application/json' },
    method: 'POST',
  })
  const order = (await createRes.json()).data.order

  // Corrupt recipient ciphertext in D1
  sqlite.exec(`UPDATE orders SET recipient_ciphertext = 'aes-gcm-v1.AAAA.BBBB' WHERE id = '${order.id}'`)

  const detailRes = await worker.fetch(`/api/v1/orders/${order.code}`, {
    headers: { Authorization: 'Bearer customer-a-token' },
    method: 'GET',
  })
  assert.equal(detailRes.status, 500)
  const body = await detailRes.json()
  assert.equal(body.error?.code, 'FULFILMENT_DECRYPTION_FAILED')
})

// -------------------------------------------------------------
// SECTION 4: Client & Presentation Helpers (Tests 20-28)
// -------------------------------------------------------------

test('20. fetchUserOrders handles unauthenticated / missing token', async () => {
  const resNoToken = await fetchUserOrders({ getToken: async () => null })
  assert.equal(resNoToken.ok, false)
  assert.equal(resNoToken.status, 401)
  assert.equal(resNoToken.error?.code, 'AUTHENTICATION_REQUIRED')

  const resErrorToken = await fetchUserOrders({ getToken: async () => { throw new Error('Token expired') } })
  assert.equal(resErrorToken.ok, false)
  assert.equal(resErrorToken.status, 401)
  assert.equal(resErrorToken.error?.code, 'TOKEN_ERROR')
})

test('21. fetchUserOrders handles successful response', async () => {
  const mockOrders = [{ code: 'HF-1', id: 'ord_1', totalVnd: 500000 }]
  const mockFetch = async () => new Response(JSON.stringify({ data: { orders: mockOrders } }), { status: 200 })

  const res = await fetchUserOrders({ fetchImpl: mockFetch, getToken: async () => 'token' })
  assert.equal(res.ok, true)
  assert.equal(res.status, 200)
  assert.deepEqual(res.orders, mockOrders)
})

test('22. fetchUserOrders handles API error and network error', async () => {
  const mockFetchErr = async () => new Response(JSON.stringify({ error: { code: 'SERVER_ERR', message: 'Lỗi' } }), { status: 500 })
  const resErr = await fetchUserOrders({ fetchImpl: mockFetchErr, getToken: async () => 'token' })
  assert.equal(resErr.ok, false)
  assert.equal(resErr.status, 500)
  assert.equal(resErr.error?.code, 'SERVER_ERR')

  const mockFetchNet = async () => { throw new Error('Network failure') }
  const resNet = await fetchUserOrders({ fetchImpl: mockFetchNet, getToken: async () => 'token' })
  assert.equal(resNet.ok, false)
  assert.equal(resNet.status, 0)
  assert.equal(resNet.error?.code, 'NETWORK_ERROR')
})

test('23. fetchUserOrderDetail handles unauthenticated / missing token', async () => {
  const resNoToken = await fetchUserOrderDetail('ord_1', { getToken: async () => null })
  assert.equal(resNoToken.ok, false)
  assert.equal(resNoToken.status, 401)
  assert.equal(resNoToken.error?.code, 'AUTHENTICATION_REQUIRED')

  const resErrorToken = await fetchUserOrderDetail('ord_1', { getToken: async () => { throw new Error('fail') } })
  assert.equal(resErrorToken.ok, false)
  assert.equal(resErrorToken.status, 401)
  assert.equal(resErrorToken.error?.code, 'TOKEN_ERROR')
})

test('24. fetchUserOrderDetail handles successful detail response', async () => {
  const mockOrder = { code: 'HF-1', id: 'ord_1', receiver: { name: 'Người Nhận' } }
  const mockFetch = async () => new Response(JSON.stringify({ data: { order: mockOrder } }), { status: 200 })

  const res = await fetchUserOrderDetail('HF-1', { fetchImpl: mockFetch, getToken: async () => 'token' })
  assert.equal(res.ok, true)
  assert.equal(res.status, 200)
  assert.deepEqual(res.order, mockOrder)
})

test('25. fetchUserOrderDetail handles 404 not found', async () => {
  const mockFetch = async () => new Response(JSON.stringify({ error: { code: 'ORDER_NOT_FOUND', message: 'Không tìm thấy đơn hoa.' } }), { status: 404 })

  const res = await fetchUserOrderDetail('HF-999', { fetchImpl: mockFetch, getToken: async () => 'token' })
  assert.equal(res.ok, false)
  assert.equal(res.status, 404)
  assert.equal(res.error?.code, 'ORDER_NOT_FOUND')
})

test('26. formatOrderStatus maps received to Đã tiếp nhận', () => {
  assert.equal(formatOrderStatus('received'), 'Đã tiếp nhận')
  assert.equal(formatOrderStatus('confirmed'), 'Đã xác nhận')
  assert.equal(formatOrderStatus('processing'), 'Đang chuẩn bị')
  assert.equal(formatOrderStatus('preparing'), 'Đang chuẩn bị')
  assert.equal(formatOrderStatus('delivering'), 'Đang giao')
  assert.equal(formatOrderStatus('completed'), 'Hoàn tất')
  assert.equal(formatOrderStatus('cancelled'), 'Đã hủy')
})

test('27. formatPaymentStatus maps mock_pending to Chờ thanh toán', () => {
  assert.equal(formatPaymentStatus('mock_pending'), 'Chờ thanh toán')
  assert.equal(formatPaymentStatus('pending'), 'Chờ thanh toán')
  assert.equal(formatPaymentStatus('paid'), 'Đã thanh toán')
  assert.equal(formatPaymentStatus('failed'), 'Thanh toán thất bại')
})

test('28. getCartItemPresentation uses snapshot name and size/wrapping from item', () => {
  const item = {
    name: 'Bó Hoa Snapshot',
    quantity: 1,
    size: { label: 'Cỡ Lớn' },
    wrapping: { label: 'Giấy Lụa' },
  }
  const presentation = getCartItemPresentation(item)
  assert.equal(presentation.name, 'Bó Hoa Snapshot')
  assert.equal(presentation.details, 'Cỡ Lớn · Giấy Lụa')
})
