import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { createOrder } from '../src/services/apiClient.js'
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
      detail: '123 Nguyễn Huệ, Phường Bến Nghé',
      district: 'Quận 1',
      ward: 'Phường Bến Nghé',
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
    paymentMethod: 'cod_mock',
  }
}

// 1. Auth 1: Unauthenticated request to POST /api/v1/orders returns 401
test('1. unauthenticated request to POST /api/v1/orders returns 401', async () => {
  const { d1 } = createSeededDatabase()
  const worker = createTestWorker(d1)

  const response = await worker.fetch('/api/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(createValidOrderPayload()),
  })

  assert.equal(response.status, 401)
  const body = await response.json()
  assert.equal(body.error?.code, 'AUTHENTICATION_REQUIRED')
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
  payload.buyer.name = 'Secret Buyer 99'
  payload.recipient = { name: 'Secret Recipient 88', phone: '0909998877' }
  payload.address.detail = 'Secret Villa 77'
  payload.gifting.message = 'Top secret gift message 66'

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
  for (const text of ['Secret Buyer 99', 'Secret Recipient 88', 'Secret Villa 77', 'Top secret gift message 66']) {
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
  assert.equal(decryptedBuyer.name, 'Secret Buyer 99')

  const decryptedRecipient = await decryptFulfilmentValue(orderRow.recipient_ciphertext, testFulfilmentKey)
  assert.equal(decryptedRecipient.name, 'Secret Recipient 88')

  const decryptedAddress = await decryptFulfilmentValue(orderRow.delivery_address_ciphertext, testFulfilmentKey)
  assert.equal(decryptedAddress.detail, 'Secret Villa 77')

  const decryptedGifting = await decryptFulfilmentValue(orderRow.gift_message_ciphertext, testFulfilmentKey)
  assert.equal(decryptedGifting.message, 'Top secret gift message 66')
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

// 28. Persistence 28: orders.payment_status set to 'mock_pending'
test('28. orders.payment_status set to mock_pending', async () => {
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
  assert.equal(body.data.order.paymentStatus, 'mock_pending')

  const orderRow = sqlite.prepare('SELECT payment_status FROM orders WHERE id = ?').get(body.data.order.id)
  assert.equal(orderRow.payment_status, 'mock_pending')
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
  const result1 = await createOrder({ getToken: async () => null, order: createValidOrderPayload() })
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

// 35. Regressions 35: Method not allowed for non-POST methods on /api/v1/orders
test('35. method not allowed for non-POST methods on /api/v1/orders', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedCustomerUser(sqlite)
  const worker = createTestWorker(d1)

  for (const method of ['GET', 'PUT', 'DELETE', 'PATCH']) {
    const response = await worker.fetch('/api/v1/orders', {
      method,
      headers: {
        Authorization: 'Bearer customer-token',
      },
    })
    assert.equal(response.status, 405, `${method} must return 405`)
    assert.equal(response.headers.get('Allow'), 'POST')
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
