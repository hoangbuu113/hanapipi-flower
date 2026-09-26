import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { createOrder, fetchGuestOrderDetail } from '../src/services/apiClient.js'
import { decryptFulfilmentValue, encryptFulfilmentValue } from '../src/server/fulfilmentCrypto.js'
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
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const results = []
      for (const statement of statements) results.push(await statement.run())
      this.db.exec('COMMIT')
      return results
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
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
  const m8 = fs.readFileSync(path.resolve('drizzle/0008_create_user_addresses.sql'), 'utf8')
  const m9 = fs.readFileSync(path.resolve('drizzle/0009_guest_orders.sql'), 'utf8')
  db.exec(m1)
  db.exec(m2)
  db.exec(m3)
  db.exec(m4)
  db.exec(m5)
  db.exec(m6)
  db.exec(m7)
  db.exec(m8)
  db.exec(m9)
  db.exec(fs.readFileSync(path.resolve('drizzle/0010_order_idempotency.sql'), 'utf8'))
  return { d1: new D1Wrapper(db), sqlite: db }
}

const localOrigin = 'http://127.0.0.1:5173'
const testJwtKey = 'unit-test-checkout-public-key'
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
    if (token === 'customer-token') {
      return { azp: localOrigin, sub: 'user_customer_subject' }
    }
    if (token === 'admin-token') {
      return { azp: localOrigin, sub: 'user_admin_subject' }
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
      if (fetchOpts.method === 'POST' && !headers.has('Origin')) headers.set('Origin', localOrigin)
      if (fetchOpts.method === 'POST' && new URL(fullUrl).pathname === '/api/v1/orders' && !headers.has('Idempotency-Key')) headers.set('Idempotency-Key', crypto.randomUUID())
      return worker.fetch(new Request(fullUrl, { ...fetchOpts, headers }), env)
    },
    worker,
  }
}

function seedCustomerUser(sqlite) {
  const now = new Date().toISOString()
  sqlite.exec(`
    INSERT INTO users (id, auth_provider, provider_subject, role, status, locale, created_at_utc, updated_at_utc)
    VALUES ('usr_cust_001', 'clerk', 'user_customer_subject', 'customer', 'active', 'vi-VN', '${now}', '${now}')
  `)
}

function createValidOrderPayload() {
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
  }
}

// 1. A guest may create an order without a Clerk identity.
test('1. guest request to POST /api/v1/orders creates an unowned order', async () => {
  const { d1, sqlite } = createSeededDatabase()
  const worker = createTestWorker(d1)

  const response = await worker.fetch('/api/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(createValidOrderPayload()),
  })

  assert.equal(response.status, 201)
  const body = await response.json()
  assert.ok(body.data?.guestAccessToken)
  assert.equal(sqlite.prepare('SELECT user_id FROM orders WHERE id = ?').get(body.data.order.id).user_id, null)
})

test('guest MoMo order uses canonical prices, encrypts PII, and has one-time access credentials', async () => {
  const { d1, sqlite } = createSeededDatabase()
  const worker = createTestWorker(d1)
  worker.env.MOMO_ACCOUNT_NAME = 'Tên thử nghiệm'
  worker.env.MOMO_PHONE_NUMBER = '0900000000'
  const payload = { ...createValidOrderPayload(), paymentMethod: 'momo', total: 1, userId: 'forged-owner' }
  payload.items = [{ ...payload.items[0], unitPrice: 1 }]

  const response = await worker.fetch('/api/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  assert.equal(response.status, 201)
  const { order, guestAccessToken } = (await response.json()).data
  assert.match(guestAccessToken, /^[A-Za-z0-9_-]{43}$/u)
  assert.equal(order.totalVnd, 1420000)
  assert.equal(order.payment.momo.amountVnd, order.totalVnd)
  assert.equal(order.payment.momo.transferContent, `HANAPIPI ${order.code}`)
  assert.equal(order.paymentStatus, 'pending')
  const row = sqlite.prepare('SELECT * FROM orders WHERE id = ?').get(order.id)
  assert.equal(row.user_id, null)
  assert.match(row.guest_access_token_hash, /^[0-9a-f]{64}$/u)
  assert.equal(JSON.stringify(row).includes(guestAccessToken), false)
  assert.equal(JSON.stringify(row).includes(payload.buyer.name), false)
  assert.equal(JSON.stringify(row).includes(payload.address.detail), false)
  assert.ok(sqlite.prepare('SELECT id FROM order_items WHERE order_id = ?').get(order.id))

  const read = await fetchGuestOrderDetail(order.code, {
    guestToken: guestAccessToken,
    fetchImpl: worker.fetch,
  })
  assert.equal(read.ok, true)
  assert.equal(read.order.buyer.name, payload.buyer.name)
  assert.equal(read.order.address.detail, payload.address.detail)
  assert.equal(JSON.stringify(read.order).includes('ciphertext'), false)
})

test('guest order access rejects code alone, wrong token, cross-order token, and forged bearer', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createTestWorker(d1)
  const create = async () => {
    const response = await worker.fetch('/api/v1/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(createValidOrderPayload()),
    })
    return (await response.json()).data
  }
  const first = await create()
  const second = await create()

  assert.equal((await worker.fetch(`/api/v1/orders/${first.order.code}`)).status, 401)
  assert.equal((await worker.fetch(`/api/v1/orders/${first.order.code}`, {
    headers: { 'X-Guest-Order-Token': second.guestAccessToken },
  })).status, 404)
  assert.equal((await worker.fetch(`/api/v1/orders/${first.order.code}`, {
    headers: { 'X-Guest-Order-Token': 'x'.repeat(43) },
  })).status, 404)
  assert.equal((await worker.fetch(`/api/v1/orders/${first.order.code}`, {
    headers: { Authorization: 'Bearer invalid-token-xyz', 'X-Guest-Order-Token': first.guestAccessToken },
  })).status, 401)
  const forgedCreation = await worker.fetch('/api/v1/orders', {
    method: 'POST', headers: { Authorization: 'Bearer invalid-token-xyz', 'Content-Type': 'application/json' },
    body: JSON.stringify(createValidOrderPayload()),
  })
  assert.equal(forgedCreation.status, 401)
})

test('guest order mutation needs an allowed Origin, and Admin can operate on guest order', async () => {
  const { d1, sqlite } = createSeededDatabase()
  const worker = createTestWorker(d1)
  const denied = await worker.fetch('/api/v1/orders', {
    method: 'POST', headers: { Origin: 'https://unrelated.example', 'Content-Type': 'application/json' },
    body: JSON.stringify(createValidOrderPayload()),
  })
  assert.equal(denied.status, 403)

  const created = await worker.fetch('/api/v1/orders', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(createValidOrderPayload()),
  })
  const { order } = (await created.json()).data
  const now = new Date().toISOString()
  sqlite.prepare(`INSERT INTO users (id, auth_provider, provider_subject, role, status, locale, created_at_utc, updated_at_utc)
    VALUES (?, 'clerk', ?, 'admin', 'active', 'vi-VN', ?, ?)`)
    .run('usr_guest_test_admin', 'user_admin_subject', now, now)
  const list = await worker.fetch('/api/v1/admin/orders', { headers: { Authorization: 'Bearer admin-token' } })
  assert.equal(list.status, 200)
  const listBody = await list.json()
  assert.equal(listBody.data.orders.find((item) => item.id === order.id).customerType, 'guest')
  const detail = await worker.fetch(`/api/v1/admin/orders/${order.id}`, { headers: { Authorization: 'Bearer admin-token' } })
  assert.equal(detail.status, 200)
  assert.equal((await detail.json()).data.order.customerType, 'guest')
})

test('guest migration preserves an existing authenticated order and its item snapshots', () => {
  const db = new DatabaseSync(':memory:')
  for (const file of [
    '0001_phase16_foundation.sql', '0002_phase16_catalogue_seed.sql',
    '0003_add_product_internal_note.sql', '0004_update_order_payment_constraints.sql',
    '0005_add_order_delivering_status.sql', '0006_add_momo_payment_method.sql',
    '0007_tighten_order_payment_methods.sql', '0008_create_user_addresses.sql',
  ]) db.exec(fs.readFileSync(path.resolve('drizzle', file), 'utf8'))

  const timestamp = '2026-09-25T00:00:00.000Z'
  db.prepare(`INSERT INTO users (id, auth_provider, provider_subject, role, status, locale, created_at_utc, updated_at_utc)
    VALUES (?, 'clerk', ?, 'customer', 'active', 'vi-VN', ?, ?)`).run('usr_existing', 'sub_existing', timestamp, timestamp)
  db.prepare(`INSERT INTO orders (id, user_id, order_code, status, subtotal_vnd, total_vnd,
    delivery_date, delivery_slot_id, payment_method, payment_status, created_at_utc, updated_at_utc)
    VALUES (?, ?, ?, 'received', 590000, 590000, '2026-09-26', 'morning', 'momo', 'pending', ?, ?)`)
    .run('ord_existing', 'usr_existing', 'HF-20260925-EXISTING', timestamp, timestamp)
  db.prepare(`INSERT INTO order_items (id, order_id, item_type, product_name_snapshot, unit_price_vnd, quantity, line_total_vnd)
    VALUES (?, ?, 'product', ?, 590000, 1, 590000)`).run('ori_existing', 'ord_existing', 'Nắng Dịu')

  db.exec(fs.readFileSync(path.resolve('drizzle/0009_guest_orders.sql'), 'utf8'))
  const order = db.prepare('SELECT user_id, guest_access_token_hash FROM orders WHERE id = ?').get('ord_existing')
  assert.equal(order.user_id, 'usr_existing')
  assert.equal(order.guest_access_token_hash, null)
  assert.equal(db.prepare('SELECT product_name_snapshot FROM order_items WHERE id = ?').get('ori_existing').product_name_snapshot, 'Nắng Dịu')
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
  db.close()
})

// 2. Auth 2: Malformed / invalid bearer token returns 401
test('2. invalid bearer token returns 401 AUTHENTICATION_REQUIRED', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createTestWorker(d1)

  const response = await worker.fetch('/api/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer invalid-token-xyz',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createValidOrderPayload()),
  })

  assert.equal(response.status, 401)
  const body = await response.json()
  assert.equal(body.error?.code, 'AUTHENTICATION_REQUIRED')
})

// 3. Auth 3: Authenticated user from Clerk maps to D1 user and associates order with user.id
test('3. authenticated user from Clerk associates order with D1 user.id', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedCustomerUser(sqlite)
  const worker = createTestWorker(d1)

  const response = await worker.fetch('/api/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer customer-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createValidOrderPayload()),
  })

  assert.equal(response.status, 201)
  const body = await response.json()
  assert.ok(body.data?.order?.id)

  const orderRow = sqlite.prepare('SELECT * FROM orders WHERE id = ?').get(body.data.order.id)
  assert.equal(orderRow.user_id, 'usr_cust_001')
})

// 4. Authority 4: Product existence and data re-resolved authoritatively from D1
test('4. product existence and data re-resolved authoritatively from D1', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedCustomerUser(sqlite)
  const worker = createTestWorker(d1)

  const payload = createValidOrderPayload()
  payload.items[0].productId = 'non-existent-product-id'

  const response = await worker.fetch('/api/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer customer-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  assert.equal(response.status, 400)
  const body = await response.json()
  assert.equal(body.error?.code, 'PRODUCT_NOT_FOUND')
})

// 5. Authority 5: Variant price re-resolved authoritatively from D1 (client price ignored)
test('5. variant price re-resolved authoritatively from D1 (client price ignored)', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedCustomerUser(sqlite)
  const worker = createTestWorker(d1)

  const payload = createValidOrderPayload()
  payload.items[0].unitPrice = 100 // Client tries to spoof price to 100 VND
  payload.items[0].unitPriceVnd = 100

  const response = await worker.fetch('/api/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer customer-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  assert.equal(response.status, 201)
  const body = await response.json()
  // nang-diu standard is 590000, candle is 120000 -> unit total is 710000
  assert.equal(body.data.order.items[0].unitTotalVnd, 710000)
  assert.equal(body.data.order.items[0].size.price, 590000)
})

// 6. Authority 6: Gift add-on price re-resolved authoritatively from D1 (client price ignored)
test('6. gift add-on price re-resolved authoritatively from D1 (client price ignored)', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedCustomerUser(sqlite)
  const worker = createTestWorker(d1)

  const payload = createValidOrderPayload()
  // Client passes bogus gift price
  payload.items[0].giftAddOns = [{ id: 'mini-scented-candle', price: 0 }]

  const response = await worker.fetch('/api/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer customer-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  assert.equal(response.status, 201)
  const body = await response.json()
  assert.equal(body.data.order.items[0].giftAddOns[0].price, 120000)
})

// 7. Authority 7: Client-supplied line total and subtotal ignored, recomputed from D1
test('7. client-supplied line total and subtotal ignored, recomputed from D1', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedCustomerUser(sqlite)
  const worker = createTestWorker(d1)

  const payload = createValidOrderPayload()
  payload.total = 10
  payload.subtotal = 10
  payload.items[0].lineTotal = 10

  const response = await worker.fetch('/api/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer customer-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  assert.equal(response.status, 201)
  const body = await response.json()
  // (590000 + 120000) * 2 = 1420000
  assert.equal(body.data.order.subtotalVnd, 1420000)
  assert.equal(body.data.order.total, 1420000)
  assert.equal(body.data.order.items[0].lineTotalVnd, 1420000)
})

// 8. Authority 8: Inactive/archived product rejected with 409 (PRODUCT_UNAVAILABLE)
test('8. inactive/archived product rejected with 409 PRODUCT_UNAVAILABLE', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedCustomerUser(sqlite)
  sqlite.exec("UPDATE products SET active = 0 WHERE id = 'nang-diu'")
  const worker = createTestWorker(d1)

  const response = await worker.fetch('/api/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer customer-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createValidOrderPayload()),
  })

  assert.equal(response.status, 409)
  const body = await response.json()
  assert.equal(body.error?.code, 'PRODUCT_UNAVAILABLE')
})

// 9. Authority 9: Missing/inactive size rejected with 409 (SIZE_UNAVAILABLE)
test('9. missing/inactive size rejected with 409 SIZE_UNAVAILABLE', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedCustomerUser(sqlite)
  const worker = createTestWorker(d1)

  const payload = createValidOrderPayload()
  payload.items[0].sizeId = 'non-existent-size'

  const response = await worker.fetch('/api/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer customer-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  assert.equal(response.status, 409)
  const body = await response.json()
  assert.equal(body.error?.code, 'SIZE_UNAVAILABLE')
})

// 10. Authority 10: Missing/inactive wrapping rejected with 409 (WRAPPING_UNAVAILABLE)
test('10. missing/inactive wrapping rejected with 409 WRAPPING_UNAVAILABLE', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedCustomerUser(sqlite)
  const worker = createTestWorker(d1)

  const payload = createValidOrderPayload()
  payload.items[0].wrappingId = 'non-existent-wrapping'

  const response = await worker.fetch('/api/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer customer-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  assert.equal(response.status, 409)
  const body = await response.json()
  assert.equal(body.error?.code, 'WRAPPING_UNAVAILABLE')
})

// 11. Authority 11: Missing/inactive gift rejected with 409 (GIFT_ADD_ON_UNAVAILABLE)
test('11. missing/inactive gift rejected with 409 GIFT_ADD_ON_UNAVAILABLE', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedCustomerUser(sqlite)
  const worker = createTestWorker(d1)

  const payload = createValidOrderPayload()
  payload.items[0].giftAddOnIds = ['non-existent-gift']

  const response = await worker.fetch('/api/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer customer-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  assert.equal(response.status, 409)
  const body = await response.json()
  assert.equal(body.error?.code, 'GIFT_ADD_ON_UNAVAILABLE')
})

// 12. Validation 12: Missing or invalid buyer info rejected with 400 (INVALID_ORDER)
test('12. missing or invalid buyer info rejected with 400 INVALID_ORDER', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedCustomerUser(sqlite)
  const worker = createTestWorker(d1)

  const payload = createValidOrderPayload()
  payload.buyer.phone = '123' // Invalid phone

  const response = await worker.fetch('/api/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer customer-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  assert.equal(response.status, 400)
  const body = await response.json()
  assert.equal(body.error?.code, 'INVALID_ORDER')
  assert.ok(body.error?.fieldErrors?.['buyer.phone'])
})

// 13. Validation 13: Missing or invalid recipient info rejected with 400 (INVALID_ORDER)
test('13. missing or invalid recipient info rejected with 400 INVALID_ORDER', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedCustomerUser(sqlite)
  const worker = createTestWorker(d1)

  const payload = createValidOrderPayload()
  payload.recipient = { name: '', phone: '' }

  const response = await worker.fetch('/api/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer customer-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  assert.equal(response.status, 400)
  const body = await response.json()
  assert.equal(body.error?.code, 'INVALID_ORDER')
})

// 14. Validation 14: Missing or invalid address info rejected with 400 (INVALID_ORDER)
test('14. missing or invalid address info rejected with 400 INVALID_ORDER', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedCustomerUser(sqlite)
  const worker = createTestWorker(d1)

  const payload = createValidOrderPayload()
  payload.address.city = ''

  const response = await worker.fetch('/api/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer customer-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  assert.equal(response.status, 400)
  const body = await response.json()
  assert.equal(body.error?.code, 'INVALID_ORDER')
  assert.ok(body.error?.fieldErrors?.['address.city'])
})

// 15. Validation 15: Missing or invalid delivery date/slot rejected with 400 (INVALID_DELIVERY)
test('15. missing or invalid delivery date/slot rejected with 400 INVALID_DELIVERY', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedCustomerUser(sqlite)
  const worker = createTestWorker(d1)

  const payload = createValidOrderPayload()
  payload.delivery.date = '2026-99-99'

  const response = await worker.fetch('/api/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer customer-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  assert.equal(response.status, 400)
  const body = await response.json()
  assert.equal(body.error?.code, 'INVALID_DELIVERY')
})

// 16. Validation 16: Gifting anonymous flag and message handled properly
test('16. gifting anonymous flag clears senderName and records message', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedCustomerUser(sqlite)
  const worker = createTestWorker(d1)

  const payload = createValidOrderPayload()
  payload.gifting = {
    anonymous: true,
    message: 'Lời nhắn giấu tên',
    senderName: 'Người gửi bí mật',
  }

  const response = await worker.fetch('/api/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer customer-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  assert.equal(response.status, 201)
  const body = await response.json()
  assert.equal(body.data.order.gifting.anonymous, true)
  assert.equal(body.data.order.gifting.senderName, '')
  assert.equal(body.data.order.gifting.message, 'Lời nhắn giấu tên')
})

// 17. Validation 17: Invalid payment method rejected with 400 (INVALID_PAYMENT_METHOD)
test('17. invalid payment method rejected with 400 INVALID_PAYMENT_METHOD', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedCustomerUser(sqlite)
  const worker = createTestWorker(d1)

  const payload = createValidOrderPayload()
  payload.paymentMethod = 'credit_card_stripe' // Unsupported

  const response = await worker.fetch('/api/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer customer-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  assert.equal(response.status, 400)
  const body = await response.json()
  assert.equal(body.error?.code, 'INVALID_PAYMENT_METHOD')
})

// 18. Validation 18: Empty items array rejected with 400 (INVALID_ORDER_ITEMS)
test('18. empty items array rejected with 400 INVALID_ORDER_ITEMS', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedCustomerUser(sqlite)
  const worker = createTestWorker(d1)

  const payload = createValidOrderPayload()
  payload.items = []

  const response = await worker.fetch('/api/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer customer-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  assert.equal(response.status, 400)
  const body = await response.json()
  assert.equal(body.error?.code, 'INVALID_ORDER_ITEMS')
})

// 19. Validation 19: Invalid quantity rejected with 400 (INVALID_QUANTITY)
test('19. invalid quantity rejected with 400 INVALID_QUANTITY', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedCustomerUser(sqlite)
  const worker = createTestWorker(d1)

  const payload = createValidOrderPayload()
  payload.items[0].quantity = 25 // Max is 20

  const response = await worker.fetch('/api/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer customer-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  assert.equal(response.status, 400)
  const body = await response.json()
  assert.equal(body.error?.code, 'INVALID_QUANTITY')
})

// 20. Validation 20: no-watering-flower strictly rejected with 409 (PRODUCT_UNAVAILABLE)
test('20. no-watering-flower strictly rejected with 409 PRODUCT_UNAVAILABLE', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedCustomerUser(sqlite)
  const worker = createTestWorker(d1)

  const payload = createValidOrderPayload()
  payload.items[0].productId = 'no-watering-flower'

  const response = await worker.fetch('/api/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer customer-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  assert.equal(response.status, 409)
  const body = await response.json()
  assert.equal(body.error?.code, 'PRODUCT_UNAVAILABLE')
})

// 21-24. PII/Crypto: Plaintext recipient/delivery/buyer/message PII not stored in D1
test('21-24. plaintext PII not stored in D1; ciphertext decrypts cleanly', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedCustomerUser(sqlite)
  const worker = createTestWorker(d1)

  const payload = createValidOrderPayload()
  payload.buyer.name = 'Nguyễn'
  payload.recipient = { name: 'Nguyễn', phone: '0909998877' }
  payload.address = {
    city: 'TP. Hồ Chí Minh',
    unitCode: '26740',
    detail: 'Không giao',
    district: '',
    ward: 'Phường Sài Gòn',
  }
  payload.gifting.message = 'Không xử lý giao'

  const response = await worker.fetch('/api/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer customer-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  assert.equal(response.status, 201)
  const body = await response.json()
  const orderRow = sqlite.prepare('SELECT * FROM orders WHERE id = ?').get(body.data.order.id)

  // 1. Verify plaintext is NOT present in any column
  const rowValues = Object.values(orderRow).filter(Boolean).map(String)
  for (const text of ['Nguyễn', 'Không giao', 'Phường Sài Gòn', 'TP. Hồ Chí Minh', 'Không xử lý giao']) {
    for (const val of rowValues) {
      assert.ok(!val.includes(text), `Plaintext "${text}" must not be stored in D1 column!`)
    }
  }

  // 2. Verify ciphertext columns are present and format matches aes-gcm-v1
  assert.ok(orderRow.buyer_contact_ciphertext.startsWith('aes-gcm-v1.'))
  assert.ok(orderRow.recipient_ciphertext.startsWith('aes-gcm-v1.'))
  assert.ok(orderRow.delivery_address_ciphertext.startsWith('aes-gcm-v1.'))
  assert.ok(orderRow.gift_message_ciphertext.startsWith('aes-gcm-v1.'))
  assert.equal(orderRow.fulfilment_key_version, 'aes-gcm-v1')

  // 3. Verify decrypting recovers the original values
  const decryptedBuyer = await decryptFulfilmentValue(orderRow.buyer_contact_ciphertext, testFulfilmentKey)
  assert.equal(decryptedBuyer.name, 'Nguyễn')

  const decryptedRecipient = await decryptFulfilmentValue(orderRow.recipient_ciphertext, testFulfilmentKey)
  assert.equal(decryptedRecipient.name, 'Nguyễn')

  const decryptedAddress = await decryptFulfilmentValue(orderRow.delivery_address_ciphertext, testFulfilmentKey)
  assert.deepEqual(decryptedAddress, {
    city: 'TP. Hồ Chí Minh',
    unitCode: '26740',
    detail: 'Không giao',
    district: '',
    ward: 'Phường Sài Gòn',
  })

  const decryptedGifting = await decryptFulfilmentValue(orderRow.gift_message_ciphertext, testFulfilmentKey)
  assert.equal(decryptedGifting.message, 'Không xử lý giao')
})

// 25. Crypto 25: Missing or invalid ORDER_FULFILMENT_KEY returns 503 FULFILMENT_ENCRYPTION_UNAVAILABLE
test('25. missing ORDER_FULFILMENT_KEY returns 503 FULFILMENT_ENCRYPTION_UNAVAILABLE', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedCustomerUser(sqlite)
  const worker = createTestWorker(d1, { fulfilmentKey: null })

  const response = await worker.fetch('/api/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer customer-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createValidOrderPayload()),
  })

  assert.equal(response.status, 503)
  const body = await response.json()
  assert.equal(body.error?.code, 'FULFILMENT_ENCRYPTION_UNAVAILABLE')
})

// 26. Persistence 26: Atomic batch insert - orders, order_items, order_item_add_ons all succeed or all fail
test('26. atomic batch insert: on failure, no partial orders or items exist', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedCustomerUser(sqlite)
  const worker = createTestWorker(d1)

  const payload = createValidOrderPayload()
  // Second item is invalid, which should abort before any insertion
  payload.items.push({
    giftAddOnIds: [],
    productId: 'non-existent',
    quantity: 1,
    sizeId: 'standard',
    wrappingId: null,
  })

  const response = await worker.fetch('/api/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer customer-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  assert.equal(response.status, 400)
  const countOrders = sqlite.prepare('SELECT COUNT(*) as c FROM orders').get().c
  const countItems = sqlite.prepare('SELECT COUNT(*) as c FROM order_items').get().c
  assert.equal(countOrders, 0)
  assert.equal(countItems, 0)
})

// 27. Persistence 27: orders.status set to 'received'
test('27. orders.status set to received', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedCustomerUser(sqlite)
  const worker = createTestWorker(d1)

  const response = await worker.fetch('/api/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer customer-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createValidOrderPayload()),
  })

  assert.equal(response.status, 201)
  const body = await response.json()
  assert.equal(body.data.order.status, 'received')

  const orderRow = sqlite.prepare('SELECT status FROM orders WHERE id = ?').get(body.data.order.id)
  assert.equal(orderRow.status, 'received')
})

// 28. Persistence 28: orders.payment_status set to 'pending'
test('28. orders.payment_status set to pending', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedCustomerUser(sqlite)
  const worker = createTestWorker(d1)

  const response = await worker.fetch('/api/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer customer-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createValidOrderPayload()),
  })

  assert.equal(response.status, 201)
  const body = await response.json()
  assert.equal(body.data.order.paymentStatus, 'pending')

  const orderRow = sqlite.prepare('SELECT payment_status FROM orders WHERE id = ?').get(body.data.order.id)
  assert.equal(orderRow.payment_status, 'pending')
})

// 29. Persistence 29: order_items.options_snapshot_json contains size and wrapping snapshots
test('29. order_items.options_snapshot_json contains size and wrapping snapshots', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedCustomerUser(sqlite)
  const worker = createTestWorker(d1)

  const response = await worker.fetch('/api/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer customer-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createValidOrderPayload()),
  })

  assert.equal(response.status, 201)
  const body = await response.json()
  const orderItemRow = sqlite.prepare('SELECT * FROM order_items WHERE order_id = ?').get(body.data.order.id)
  const options = JSON.parse(orderItemRow.options_snapshot_json)

  assert.equal(options.size.code, 'standard')
  assert.equal(options.size.priceVnd, 590000)
  assert.equal(options.wrapping.code, 'ivory-paper')
  assert.equal(options.wrapping.label, 'Giấy ivory mờ')
})

// 30. Persistence 30: order_items.composition_snapshot_json contains composition snapshot
test('30. order_items.composition_snapshot_json contains composition snapshot', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedCustomerUser(sqlite)
  const worker = createTestWorker(d1)

  const response = await worker.fetch('/api/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer customer-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createValidOrderPayload()),
  })

  assert.equal(response.status, 201)
  const body = await response.json()
  const orderItemRow = sqlite.prepare('SELECT * FROM order_items WHERE order_id = ?').get(body.data.order.id)
  const composition = JSON.parse(orderItemRow.composition_snapshot_json)
  assert.ok(Array.isArray(composition))
  assert.ok(composition.length > 0)
})

// 31. Persistence 31: order_item_add_ons records gift add-on snapshots
test('31. order_item_add_ons records gift add-on snapshots', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedCustomerUser(sqlite)
  const worker = createTestWorker(d1)

  const response = await worker.fetch('/api/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer customer-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createValidOrderPayload()),
  })

  assert.equal(response.status, 201)
  const body = await response.json()
  const orderItemRow = sqlite.prepare('SELECT id FROM order_items WHERE order_id = ?').get(body.data.order.id)
  const addOns = sqlite.prepare('SELECT * FROM order_item_add_ons WHERE order_item_id = ?').all(orderItemRow.id)

  assert.equal(addOns.length, 1)
  assert.equal(addOns[0].gift_add_on_id, 'mini-scented-candle')
  assert.equal(addOns[0].add_on_name_snapshot, 'Nến thơm mini')
  assert.equal(addOns[0].price_vnd, 120000)
})

// 32. UI 32: createOrder client helper handles token error and unauthenticated state
test('32. createOrder client helper handles token error and unauthenticated state', async () => {
  const result1 = await createOrder({ getToken: async () => null, order: createValidOrderPayload(), requireAuth: true })
  assert.equal(result1.ok, false)
  assert.equal(result1.status, 401)
  assert.equal(result1.error?.code, 'AUTHENTICATION_REQUIRED')

  const result2 = await createOrder({
    getToken: async () => { throw new Error('Token failure') },
    order: createValidOrderPayload(),
  })
  assert.equal(result2.ok, false)
  assert.equal(result2.status, 401)
  assert.equal(result2.error?.code, 'TOKEN_ERROR')
})

// 33. UI 33: createOrder client helper sends selection IDs and returns created order
test('33. createOrder client helper sends selection IDs and returns created order', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedCustomerUser(sqlite)
  const worker = createTestWorker(d1)

  const result = await createOrder({
    fetchImpl: (url, opts) => worker.fetch(url, opts),
    idempotencyKey: crypto.randomUUID(),
    getToken: async () => 'customer-token',
    order: createValidOrderPayload(),
  })

  assert.equal(result.ok, true)
  assert.equal(result.status, 201)
  assert.ok(result.order?.code)
  assert.equal(result.order.status, 'received')
  assert.equal(result.order.total, 1420000)
})

// 34. Regressions 34: API gate closed by default (404 API_NOT_FOUND when API_V1_ENABLED=false)
test('34. API gate closed by default (404 API_NOT_FOUND when API_V1_ENABLED=false)', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedCustomerUser(sqlite)
  const worker = createTestWorker(d1, { apiV1Enabled: 'false' })

  const response = await worker.fetch('/api/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer customer-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createValidOrderPayload()),
  })

  assert.equal(response.status, 404)
  const body = await response.json()
  assert.equal(body.error?.code, 'API_NOT_FOUND')
})

// 35. Regressions 35: Method not allowed for non-GET/POST methods on /api/v1/orders
test('35. method not allowed for non-GET/POST methods on /api/v1/orders', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedCustomerUser(sqlite)
  const worker = createTestWorker(d1)

  for (const method of ['PUT', 'DELETE', 'PATCH']) {
    const response = await worker.fetch('/api/v1/orders', {
      method,
      headers: {
        Authorization: 'Bearer customer-token',
      },
    })
    assert.equal(response.status, 405, `${method} must return 405`)
    assert.equal(response.headers.get('Allow'), 'GET, POST')
  }
})

// 36. Crypto 36: Decryption helper can recover original plaintext and rejects invalid version/iv
test('36. crypto helper encrypts/decrypts correctly and rejects tampered ciphertext', async () => {
  const data = { secret: 'top_secret_information', numbers: [1, 2, 3] }
  const encrypted = await encryptFulfilmentValue(data, testFulfilmentKey)
  assert.ok(encrypted.startsWith('aes-gcm-v1.'))

  const decrypted = await decryptFulfilmentValue(encrypted, testFulfilmentKey)
  assert.deepEqual(decrypted, data)

  await assert.rejects(
    async () => decryptFulfilmentValue('invalid-payload', testFulfilmentKey),
    TypeError,
  )

  await assert.rejects(
    async () => decryptFulfilmentValue('v2.something.something', testFulfilmentKey),
    TypeError,
  )
})

// 37. Checkout UI: Exactly one payment section with MoMo notice and no mock options
test('37. CheckoutPage contains exactly one payment section with MoMo notice and no mock options', () => {
  const checkoutSource = fs.readFileSync(path.resolve('src/pages/CheckoutPage.jsx'), 'utf8')
  const paymentSectionMatches = checkoutSource.match(/title="Phương thức thanh toán"/g)
  assert.equal(paymentSectionMatches?.length, 1, 'CheckoutPage must have exactly one "Phương thức thanh toán" section')
  assert.ok(checkoutSource.includes('Ví MoMo'), 'CheckoutPage must render Ví MoMo')
  assert.ok(checkoutSource.includes('Mã QR và thông tin chuyển tiền MoMo sẽ hiển thị ngay sau khi bạn đặt hoa.'))
  assert.ok(!checkoutSource.includes('cod_mock'), 'CheckoutPage must not reference cod_mock')
  assert.ok(!checkoutSource.includes('bank_transfer_mock'), 'CheckoutPage must not reference bank_transfer_mock')
  assert.ok(!checkoutSource.includes('Thanh toán khi nhận hoa'), 'CheckoutPage must not render COD option')
  assert.ok(!checkoutSource.includes('Đây là bản demo'), 'CheckoutPage must not contain demo wording')
  assert.ok(checkoutSource.includes("paymentMethod: 'momo'"), 'CheckoutPage submit payload must send momo')
})

test('38. Checkout preserves a rate-limit error for non-destructive retry', async () => {
  const result = await createOrder({
    idempotencyKey: crypto.randomUUID(),
    fetchImpl: async () => Response.json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Bạn đã gửi quá nhiều yêu cầu đặt hoa. Vui lòng thử lại.',
      },
    }, { headers: { 'Retry-After': '60' }, status: 429 }),
    getToken: async () => 'customer-token',
    order: createValidOrderPayload(),
  })
  const checkoutSource = fs.readFileSync(path.resolve('src/pages/CheckoutPage.jsx'), 'utf8')

  assert.equal(result.ok, false)
  assert.equal(result.status, 429)
  assert.equal(result.error.code, 'RATE_LIMITED')
  assert.match(result.error.message, /thử lại/u)
  assert.ok(
    checkoutSource.indexOf('if (!result.ok)') < checkoutSource.indexOf('clearCart()'),
    'Cart must only clear after a successful server response.',
  )
})

test('new checkout distinguishes invalid administrative codes from unsupported delivery territories', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedCustomerUser(sqlite)
  const worker = createTestWorker(d1)
  for (const [address, expectedCode] of [
    [{ ...createValidOrderPayload().address, city: 'Hà Nội' }, 'INVALID_DELIVERY_ADDRESS'],
    [{ ...createValidOrderPayload().address, unitCode: '99999' }, 'INVALID_ADMIN_UNIT'],
    [{ ...createValidOrderPayload().address, ward: 'Phường Bến Nghé' }, 'INVALID_DELIVERY_ADDRESS'],
    [{ ...createValidOrderPayload().address, unitCode: '25942', ward: 'Phường Dĩ An' }, 'NOT_SERVICEABLE'],
    [{ ...createValidOrderPayload().address, unitCode: '26506', ward: 'Phường Vũng Tàu' }, 'NOT_SERVICEABLE'],
  ]) {
    const response = await worker.fetch('/api/v1/orders', {
      method: 'POST',
      headers: { Authorization: 'Bearer customer-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...createValidOrderPayload(), address }),
    })
    assert.equal(response.status, 400)
    assert.equal((await response.json()).error.code, expectedCode)
  }
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM orders').get().count, 0)
})

test('saved current codes outside delivery scope are rejected by the order server', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedCustomerUser(sqlite)
  const worker = createTestWorker(d1)
  const address = { city: 'TP. Hồ Chí Minh', district: '', ward: 'Phường Dĩ An', unitCode: '25942', detail: '18 Nguyễn Huệ' }
  const addressCiphertext = await encryptFulfilmentValue(address, testFulfilmentKey)
  const recipientCiphertext = await encryptFulfilmentValue({ name: 'Minh Anh', phone: '0901112233' }, testFulfilmentKey)
  const now = new Date().toISOString()
  sqlite.prepare(`INSERT INTO user_addresses (id, user_id, label, recipient_ciphertext, address_ciphertext, key_version, is_default, created_at_utc, updated_at_utc)
    VALUES (?, ?, ?, ?, ?, 'aes-gcm-v1', 1, ?, ?)`).run('addr_dian', 'usr_cust_001', 'Ngoài khu vực giao', recipientCiphertext, addressCiphertext, now, now)

  const payload = createValidOrderPayload()
  payload.address = { ...address }
  delete payload.address.unitCode
  payload.savedAddressId = 'addr_dian'
  const response = await worker.fetch('/api/v1/orders', {
    method: 'POST',
    headers: { Authorization: 'Bearer customer-token', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  assert.equal(response.status, 400)
  assert.equal((await response.json()).error.code, 'NOT_SERVICEABLE')
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM orders').get().count, 0)
})

test('verified legacy saved HCMC address remains selectable and order snapshot is immutable', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedCustomerUser(sqlite)
  const worker = createTestWorker(d1)
  const legacy = { city: 'TP. Hồ Chí Minh', district: 'Quận 1', ward: 'Phường Bến Nghé', detail: '18 Nguyễn Huệ' }
  const addressCiphertext = await encryptFulfilmentValue(legacy, testFulfilmentKey)
  const recipientCiphertext = await encryptFulfilmentValue({ name: 'Minh Anh', phone: '0901112233' }, testFulfilmentKey)
  const now = new Date().toISOString()
  sqlite.prepare(`INSERT INTO user_addresses (id, user_id, label, recipient_ciphertext, address_ciphertext, key_version, is_default, created_at_utc, updated_at_utc)
    VALUES (?, ?, ?, ?, ?, 'aes-gcm-v1', 1, ?, ?)`).run('addr_legacy', 'usr_cust_001', 'Địa chỉ cũ', recipientCiphertext, addressCiphertext, now, now)
  const payload = createValidOrderPayload()
  payload.address = { ...legacy, detail: '20 Nguyễn Huệ' }
  payload.savedAddressId = 'addr_legacy'
  const created = await worker.fetch('/api/v1/orders', {
    method: 'POST',
    headers: { Authorization: 'Bearer customer-token', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  assert.equal(created.status, 201)
  const order = (await created.json()).data.order
  const otherUser = await worker.fetch('/api/v1/orders', {
    method: 'POST',
    headers: { Authorization: 'Bearer admin-token', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  assert.equal(otherUser.status, 400)
  assert.equal((await otherUser.json()).error.code, 'INVALID_DELIVERY_ADDRESS')
  sqlite.prepare("UPDATE user_addresses SET deleted_at_utc = ? WHERE id = 'addr_legacy'").run(new Date().toISOString())
  const detail = await worker.fetch(`/api/v1/orders/${order.code}`, { headers: { Authorization: 'Bearer customer-token' } })
  assert.equal(detail.status, 200)
  assert.deepEqual((await detail.json()).data.order.address, payload.address)
})

test('Checkout renders one recipient/location flow and no obsolete province or district selectors', () => {
  const source = fs.readFileSync(path.resolve('src/pages/CheckoutPage.jsx'), 'utf8')
  assert.equal(source.match(/title="Thông tin người nhận"/gu)?.length, 1)
  assert.equal(source.match(/title="Địa chỉ giao hoa"/gu)?.length, 1)
  assert.ok(source.includes('<AdministrativeUnitSelector'))
  assert.ok(!source.includes('<option>Hà Nội</option>'))
  assert.ok(!source.includes('label="Quận / huyện"'))
})

test('guest checkout UI keeps saved addresses account-only and reloads MoMo success by token', () => {
  const checkout = fs.readFileSync(path.resolve('src/pages/CheckoutPage.jsx'), 'utf8')
  const success = fs.readFileSync(path.resolve('src/pages/CheckoutSuccessPage.jsx'), 'utf8')
  const access = fs.readFileSync(path.resolve('src/utils/guestOrderAccess.js'), 'utf8')
  assert.match(checkout, /Thanh toán không cần tài khoản/u)
  assert.match(checkout, /isSignedIn && savedAddresses/u)
  assert.match(checkout, /requireAuth: Boolean\(isSignedIn\)/u)
  assert.match(checkout, /saveGuestOrderAccess\(result\.order/u)
  assert.ok(checkout.indexOf('if (!result.ok)') < checkout.indexOf('clearCart()'))
  assert.match(success, /fetchGuestOrderDetail\(orderCode, \{ guestToken \}\)/u)
  assert.match(success, /momoQrAsset/u)
  assert.match(access, /window\.sessionStorage/u)
  assert.doesNotMatch(access, /buyer|recipient|address/u)
})
