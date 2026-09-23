import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import qrcode from 'qrcode-generator'
import { crc16Ccitt, formatTlv, generateVietQrPayload } from '../src/server/vietqr.js'
import { formatPaymentMethod, formatPaymentStatus } from '../src/utils/order.js'
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
const testJwtKey = 'unit-test-payment-public-key'
const testFulfilmentKey = Buffer.from('01234567890123456789012345678901').toString('base64')

const defaultTestBankConfig = {
  accountName: 'HANAPIPI FLOWER',
  accountNumber: '0123456789',
  bankBin: '970422',
  bankCode: 'MB',
  bankName: 'MB Bank',
}

function createEnv(d1, {
  apiV1Enabled = 'true',
  bankConfig = defaultTestBankConfig,
  fulfilmentKey = testFulfilmentKey,
} = {}) {
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
  if (bankConfig !== null) {
    env.BANK_TRANSFER_BANK_NAME = bankConfig.bankName
    env.BANK_TRANSFER_BANK_CODE = bankConfig.bankCode
    env.BANK_TRANSFER_ACCOUNT_NAME = bankConfig.accountName
    env.BANK_TRANSFER_ACCOUNT_NUMBER = bankConfig.accountNumber
    env.BANK_TRANSFER_BIN = bankConfig.bankBin
  }
  return env
}

function createTestWorker(d1, options = {}) {
  const mockVerifier = async (token, _opts) => {
    if (token === 'customer-token-1') {
      return { azp: localOrigin, sub: 'user_customer_1_subject' }
    }
    if (token === 'customer-token-2') {
      return { azp: localOrigin, sub: 'user_customer_2_subject' }
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

function seedUsers(sqlite) {
  const now = new Date().toISOString()
  sqlite.exec(`
    INSERT INTO users (id, auth_provider, provider_subject, role, status, locale, created_at_utc, updated_at_utc)
    VALUES
      ('usr_cust_001', 'clerk', 'user_customer_1_subject', 'customer', 'active', 'vi-VN', '${now}', '${now}'),
      ('usr_cust_002', 'clerk', 'user_customer_2_subject', 'customer', 'active', 'vi-VN', '${now}', '${now}');
  `)
}

function createValidBankOrderPayload() {
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
        quantity: 1,
        sizeId: 'standard',
        wrappingId: 'ivory-paper',
      },
    ],
    paymentMethod: 'bank_transfer',
    recipient: {
      name: 'Nguyễn Thị Người Nhận',
      phone: '0909876543',
    },
  }
}

// =============================================================================
// 1. PAYMENT MODEL (Tests 1-4)
// =============================================================================

test('1. order creation stores payment_method = bank_transfer in D1', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedUsers(sqlite)
  const worker = createTestWorker(d1)

  const res = await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(createValidBankOrderPayload()),
    headers: { Authorization: 'Bearer customer-token-1', 'Content-Type': 'application/json' },
    method: 'POST',
  })

  assert.equal(res.status, 201)
  const body = await res.json()
  assert.equal(body.data?.order?.paymentMethod, 'bank_transfer')

  const row = sqlite.prepare('SELECT payment_method FROM orders WHERE id = ?').get(body.data.order.id)
  assert.equal(row.payment_method, 'bank_transfer')
})

test('2. order creation stores payment_status = pending in D1', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedUsers(sqlite)
  const worker = createTestWorker(d1)

  const res = await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(createValidBankOrderPayload()),
    headers: { Authorization: 'Bearer customer-token-1', 'Content-Type': 'application/json' },
    method: 'POST',
  })

  assert.equal(res.status, 201)
  const body = await res.json()
  assert.equal(body.data?.order?.paymentStatus, 'pending')

  const row = sqlite.prepare('SELECT payment_status FROM orders WHERE id = ?').get(body.data.order.id)
  assert.equal(row.payment_status, 'pending')
})

test('3. payment method label is formatted cleanly in Vietnamese', async () => {
  assert.equal(formatPaymentMethod('bank_transfer'), 'Chuyển khoản ngân hàng')
  assert.equal(formatPaymentMethod('bank_transfer_mock'), 'bank_transfer_mock')
  assert.equal(formatPaymentMethod('cod_mock'), 'cod_mock')
  assert.equal(formatPaymentMethod('cod'), 'cod')
})

test('4. payment status badge is formatted as Chờ thanh toán', async () => {
  assert.equal(formatPaymentStatus('pending'), 'Chờ thanh toán')
  assert.equal(formatPaymentStatus('mock_pending'), 'Chờ thanh toán')
  assert.equal(formatPaymentStatus('paid'), 'Đã thanh toán')
})

// =============================================================================
// 2. BANK CONFIGURATION (Tests 5-7)
// =============================================================================

test('5. bank details returned in payment presentation DTO when configured', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedUsers(sqlite)
  const worker = createTestWorker(d1)

  const res = await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(createValidBankOrderPayload()),
    headers: { Authorization: 'Bearer customer-token-1', 'Content-Type': 'application/json' },
    method: 'POST',
  })

  const body = await res.json()
  const payment = body.data?.order?.payment
  assert.ok(payment, 'Payment object must exist')
  assert.equal(payment.method, 'bank_transfer')
  assert.equal(payment.status, 'pending')
  assert.equal(payment.statusLabel, 'Chờ thanh toán')
  assert.equal(payment.bank?.available, true)
  assert.equal(payment.bank?.bankName, 'MB Bank')
  assert.equal(payment.bank?.bankCode, 'MB')
  assert.equal(payment.bank?.bankBin, '970422')
  assert.equal(payment.bank?.accountNumber, '0123456789')
  assert.equal(payment.bank?.accountName, 'HANAPIPI FLOWER')
  assert.ok(payment.bank?.qrPayload?.startsWith('00020101021238'))
})

test('6. missing bank configuration handled safely with PAYMENT_CONFIG_UNAVAILABLE', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedUsers(sqlite)
  // Worker with null bank config
  const worker = createTestWorker(d1, { bankConfig: null })

  const res = await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(createValidBankOrderPayload()),
    headers: { Authorization: 'Bearer customer-token-1', 'Content-Type': 'application/json' },
    method: 'POST',
  })

  assert.equal(res.status, 201)
  const body = await res.json()
  const payment = body.data?.order?.payment
  assert.equal(payment.bank?.available, false)
  assert.equal(payment.bank?.error, 'PAYMENT_CONFIG_UNAVAILABLE')
  assert.ok(payment.bank?.message?.includes('chưa được cấu hình'))
})

test('7. bank secrets/passwords are never present in config or returned in responses', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedUsers(sqlite)
  const worker = createTestWorker(d1)

  const res = await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(createValidBankOrderPayload()),
    headers: { Authorization: 'Bearer customer-token-1', 'Content-Type': 'application/json' },
    method: 'POST',
  })

  const bodyText = await res.text()
  assert.equal(bodyText.includes('password'), false)
  assert.equal(bodyText.includes('secret'), false)
  assert.equal(bodyText.includes('token'), false)
})

// =============================================================================
// 3. AMOUNT INTEGRITY (Tests 8-10)
// =============================================================================

test('8. payment presentation amount matches orders.total_vnd exactly', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedUsers(sqlite)
  const worker = createTestWorker(d1)

  const res = await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(createValidBankOrderPayload()),
    headers: { Authorization: 'Bearer customer-token-1', 'Content-Type': 'application/json' },
    method: 'POST',
  })

  const body = await res.json()
  const order = body.data.order
  assert.equal(order.payment.amountVnd, order.totalVnd)
  assert.equal(order.payment.bank.amountVnd, order.totalVnd)
})

test('9. VietQR payload amount matches orders.total_vnd exactly', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedUsers(sqlite)
  const worker = createTestWorker(d1)

  const res = await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(createValidBankOrderPayload()),
    headers: { Authorization: 'Bearer customer-token-1', 'Content-Type': 'application/json' },
    method: 'POST',
  })

  const body = await res.json()
  const order = body.data.order
  const qr = order.payment.bank.qrPayload

  // Tag 54 in EMVCo is Transaction Amount: 54 + len + amount
  const amountStr = String(order.totalVnd)
  const expectedTag54 = formatTlv('54', amountStr)
  assert.ok(qr.includes(expectedTag54), `QR payload must contain exact Tag 54 ${expectedTag54}`)
})

test('10. changes to current product catalogue price do NOT alter required payment amount', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedUsers(sqlite)
  const worker = createTestWorker(d1)

  const res = await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(createValidBankOrderPayload()),
    headers: { Authorization: 'Bearer customer-token-1', 'Content-Type': 'application/json' },
    method: 'POST',
  })

  const body = await res.json()
  const originalTotal = body.data.order.totalVnd
  const orderCode = body.data.order.orderCode

  // Mutate product price in D1
  sqlite.prepare("UPDATE products SET price_vnd = 99999999 WHERE id = 'nang-diu'").run()
  sqlite.prepare("UPDATE product_variants SET price_vnd = 99999999 WHERE product_id = 'nang-diu' AND option_type = 'size'").run()

  // Re-fetch order detail
  const detailRes = await worker.fetch(`/api/v1/orders/${orderCode}`, {
    headers: { Authorization: 'Bearer customer-token-1' },
  })
  const detailBody = await detailRes.json()
  assert.equal(detailBody.data.order.totalVnd, originalTotal)
  assert.equal(detailBody.data.order.payment.amountVnd, originalTotal)
  assert.equal(detailBody.data.order.payment.bank.amountVnd, originalTotal)
})

// =============================================================================
// 4. REFERENCE / TRANSFER CONTENT INTEGRITY (Tests 11-12)
// =============================================================================

test('11. transfer content deterministically matches HANAPIPI <orderCode>', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedUsers(sqlite)
  const worker = createTestWorker(d1)

  const res = await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(createValidBankOrderPayload()),
    headers: { Authorization: 'Bearer customer-token-1', 'Content-Type': 'application/json' },
    method: 'POST',
  })

  const body = await res.json()
  const order = body.data.order
  const expectedContent = `HANAPIPI ${order.orderCode}`
  assert.equal(order.payment.transferContent, expectedContent)
  assert.equal(order.payment.bank.transferContent, expectedContent)
})

test('12. unique order code is present in the transfer content', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedUsers(sqlite)
  const worker = createTestWorker(d1)

  const res = await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(createValidBankOrderPayload()),
    headers: { Authorization: 'Bearer customer-token-1', 'Content-Type': 'application/json' },
    method: 'POST',
  })

  const body = await res.json()
  const order = body.data.order
  assert.ok(order.payment.bank.transferContent.includes(order.orderCode))
})

// =============================================================================
// 5. QR CODE GENERATION & INTEGRITY (Tests 13-18)
// =============================================================================

test('13. VietQR payload contains correct NAPAS GUID, BIN, account, currency (704), and valid CRC', () => {
  const payload = generateVietQrPayload({
    accountNumber: '0123456789',
    amountVnd: 550000,
    bankBin: '970422',
    transferContent: 'HANAPIPI HF-20260923-ABCD1234',
  })

  assert.ok(payload.startsWith('00020101021238'))
  assert.ok(payload.includes('0010A000000727')) // NAPAS GUID
  assert.ok(payload.includes('0006970422')) // BIN
  assert.ok(payload.includes('01100123456789')) // Account
  assert.ok(payload.includes('0208QRIBFTTA')) // Service code
  assert.ok(payload.includes('5303704')) // Currency VND
  assert.ok(payload.includes('5406550000')) // Amount
  assert.ok(payload.includes('5802VN')) // Country
  assert.ok(payload.includes('6304')) // CRC tag

  const rawWithoutCrc = payload.slice(0, -4)
  const expectedCrc = crc16Ccitt(rawWithoutCrc)
  assert.equal(payload.slice(-4), expectedCrc)
})

test('14. generated QR code produces valid SVG', () => {
  const payload = generateVietQrPayload({
    accountNumber: '0123456789',
    amountVnd: 550000,
    bankBin: '970422',
    transferContent: 'HANAPIPI HF-20260923-ABCD1234',
  })

  const qr = qrcode(0, 'M')
  qr.addData(payload)
  qr.make()
  const svg = qr.createSvgTag({ scalable: true })

  assert.ok(svg.startsWith('<svg'))
  assert.ok(svg.includes('viewBox='))
  assert.ok(svg.endsWith('</svg>'))
})

test('15. changing amount changes the QR payload and CRC', () => {
  const p1 = generateVietQrPayload({
    accountNumber: '0123456789',
    amountVnd: 550000,
    bankBin: '970422',
    transferContent: 'HANAPIPI HF-20260923-ABCD1234',
  })
  const p2 = generateVietQrPayload({
    accountNumber: '0123456789',
    amountVnd: 750000,
    bankBin: '970422',
    transferContent: 'HANAPIPI HF-20260923-ABCD1234',
  })

  assert.notEqual(p1, p2)
  assert.notEqual(p1.slice(-4), p2.slice(-4))
})

test('16. changing transfer content changes the QR payload and CRC', () => {
  const p1 = generateVietQrPayload({
    accountNumber: '0123456789',
    amountVnd: 550000,
    bankBin: '970422',
    transferContent: 'HANAPIPI ORDER-1',
  })
  const p2 = generateVietQrPayload({
    accountNumber: '0123456789',
    amountVnd: 550000,
    bankBin: '970422',
    transferContent: 'HANAPIPI ORDER-2',
  })

  assert.notEqual(p1, p2)
  assert.notEqual(p1.slice(-4), p2.slice(-4))
})

test('17. zero amount or negative amount validation in VietQR generator', () => {
  assert.doesNotThrow(() => {
    generateVietQrPayload({
      accountNumber: '0123456789',
      amountVnd: 0,
      bankBin: '970422',
      transferContent: 'HANAPIPI 001',
    })
  })

  assert.throws(() => {
    generateVietQrPayload({
      accountNumber: '0123456789',
      amountVnd: -100,
      bankBin: '970422',
      transferContent: 'HANAPIPI 001',
    })
  }, /non-negative integer amount/u)
})

test('18. invalid bank BIN or account number validation in VietQR generator', () => {
  assert.throws(() => {
    generateVietQrPayload({
      accountNumber: '0123456789',
      amountVnd: 1000,
      bankBin: '12345', // only 5 digits
      transferContent: 'HANAPIPI 001',
    })
  }, /valid 6-digit bank BIN/u)

  assert.throws(() => {
    generateVietQrPayload({
      accountNumber: '',
      amountVnd: 1000,
      bankBin: '970422',
      transferContent: 'HANAPIPI 001',
    })
  }, /valid bank account number/u)
})

// =============================================================================
// 6. AUTH & ACCESS (Tests 19-21)
// =============================================================================

test('19. unauthenticated access to payment details returns 401', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedUsers(sqlite)
  const worker = createTestWorker(d1)

  const createRes = await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(createValidBankOrderPayload()),
    headers: { Authorization: 'Bearer customer-token-1', 'Content-Type': 'application/json' },
    method: 'POST',
  })
  const { data: { order } } = await createRes.json()

  const res = await worker.fetch(`/api/v1/orders/${order.orderCode}`)
  assert.equal(res.status, 401)
})

test('20. cross-user access to payment details returns 404', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedUsers(sqlite)
  const worker = createTestWorker(d1)

  const createRes = await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(createValidBankOrderPayload()),
    headers: { Authorization: 'Bearer customer-token-1', 'Content-Type': 'application/json' },
    method: 'POST',
  })
  const { data: { order } } = await createRes.json()

  // User 2 attempts to fetch User 1's order
  const res = await worker.fetch(`/api/v1/orders/${order.orderCode}`, {
    headers: { Authorization: 'Bearer customer-token-2' },
  })
  assert.equal(res.status, 404)
})

test('21. authenticated owner can access payment details via GET /api/v1/orders/:idOrCode', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedUsers(sqlite)
  const worker = createTestWorker(d1)

  const createRes = await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(createValidBankOrderPayload()),
    headers: { Authorization: 'Bearer customer-token-1', 'Content-Type': 'application/json' },
    method: 'POST',
  })
  const { data: { order } } = await createRes.json()

  const res = await worker.fetch(`/api/v1/orders/${order.orderCode}`, {
    headers: { Authorization: 'Bearer customer-token-1' },
  })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.data.order.payment.method, 'bank_transfer')
  assert.equal(body.data.order.payment.bank.available, true)
})

// =============================================================================
// 7. REVISIT & PERSISTENCE (Tests 22-30)
// =============================================================================

test('22. direct fetch to GET /api/v1/orders/:idOrCode returns canonical payment details', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedUsers(sqlite)
  const worker = createTestWorker(d1)

  const createRes = await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(createValidBankOrderPayload()),
    headers: { Authorization: 'Bearer customer-token-1', 'Content-Type': 'application/json' },
    method: 'POST',
  })
  const { data: { order } } = await createRes.json()

  const res = await worker.fetch(`/api/v1/orders/${order.id}`, {
    headers: { Authorization: 'Bearer customer-token-1' },
  })
  const body = await res.json()
  assert.equal(body.data.order.orderCode, order.orderCode)
  assert.equal(body.data.order.payment.bank.accountNumber, '0123456789')
})

test('23. payment instructions remain available while payment_status is pending', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedUsers(sqlite)
  const worker = createTestWorker(d1)

  const createRes = await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(createValidBankOrderPayload()),
    headers: { Authorization: 'Bearer customer-token-1', 'Content-Type': 'application/json' },
    method: 'POST',
  })
  const { data: { order } } = await createRes.json()

  // First fetch
  const res1 = await worker.fetch(`/api/v1/orders/${order.orderCode}`, {
    headers: { Authorization: 'Bearer customer-token-1' },
  })
  const body1 = await res1.json()
  assert.equal(body1.data.order.paymentStatus, 'pending')
  assert.ok(body1.data.order.payment.bank.qrPayload)

  // Second fetch (revisit)
  const res2 = await worker.fetch(`/api/v1/orders/${order.orderCode}`, {
    headers: { Authorization: 'Bearer customer-token-1' },
  })
  const body2 = await res2.json()
  assert.equal(body2.data.order.paymentStatus, 'pending')
  assert.equal(body2.data.order.payment.bank.qrPayload, body1.data.order.payment.bank.qrPayload)
})

test('24. formatPaymentStatus maps pending and mock_pending to Chờ thanh toán', () => {
  assert.equal(formatPaymentStatus('pending'), 'Chờ thanh toán')
  assert.equal(formatPaymentStatus('mock_pending'), 'Chờ thanh toán')
  assert.equal(formatPaymentStatus('paid'), 'Đã thanh toán')
  assert.equal(formatPaymentStatus('failed'), 'Thanh toán thất bại')
})

test('25. formatPaymentMethod maps bank_transfer to Chuyển khoản ngân hàng', () => {
  assert.equal(formatPaymentMethod('bank_transfer'), 'Chuyển khoản ngân hàng')
  assert.equal(formatPaymentMethod('cod'), 'cod')
})

test('26. list endpoint returns orders with paymentStatus pending and no QR payload', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedUsers(sqlite)
  const worker = createTestWorker(d1)

  await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(createValidBankOrderPayload()),
    headers: { Authorization: 'Bearer customer-token-1', 'Content-Type': 'application/json' },
    method: 'POST',
  })

  const listRes = await worker.fetch('/api/v1/orders', {
    headers: { Authorization: 'Bearer customer-token-1' },
  })
  const body = await listRes.json()
  assert.equal(body.data.orders.length, 1)
  assert.equal(body.data.orders[0].paymentStatus, 'pending')
  assert.equal(body.data.orders[0].paymentMethod, 'bank_transfer')
  // List endpoint must not carry heavy QR payload
  assert.equal(body.data.orders[0].qrPayload, undefined)
})

test('27. retired mock and COD payment methods are rejected', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedUsers(sqlite)
  const worker = createTestWorker(d1)

  const payload = createValidBankOrderPayload()
  payload.paymentMethod = 'bank_transfer_mock'

  const res = await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(payload),
    headers: { Authorization: 'Bearer customer-token-1', 'Content-Type': 'application/json' },
    method: 'POST',
  })
  assert.equal(res.status, 400)
  const body = await res.json()
  assert.equal(body.error.code, 'INVALID_PAYMENT_METHOD')

  for (const paymentMethod of ['cod', 'cod_mock']) {
    payload.paymentMethod = paymentMethod
    const rejected = await worker.fetch('/api/v1/orders', {
      body: JSON.stringify(payload),
      headers: { Authorization: 'Bearer customer-token-1', 'Content-Type': 'application/json' },
      method: 'POST',
    })
    assert.equal(rejected.status, 400)
    assert.equal((await rejected.json()).error.code, 'INVALID_PAYMENT_METHOD')
  }
})

test('28. direct reload behavior preserves bank transfer instructions', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedUsers(sqlite)
  const worker = createTestWorker(d1)

  const createRes = await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(createValidBankOrderPayload()),
    headers: { Authorization: 'Bearer customer-token-1', 'Content-Type': 'application/json' },
    method: 'POST',
  })
  const { data: { order } } = await createRes.json()

  // Simulate multiple reloads
  for (let i = 0; i < 3; i++) {
    const res = await worker.fetch(`/api/v1/orders/${order.orderCode}`, {
      headers: { Authorization: 'Bearer customer-token-1' },
    })
    const body = await res.json()
    assert.equal(body.data.order.payment.bank.accountNumber, '0123456789')
    assert.equal(body.data.order.payment.bank.amountVnd, order.totalVnd)
    assert.equal(body.data.order.payment.bank.transferContent, `HANAPIPI ${order.orderCode}`)
  }
})

test('29. formatTlv helper formats tag and value correctly', () => {
  assert.equal(formatTlv('00', '01'), '000201')
  assert.equal(formatTlv('58', 'VN'), '5802VN')
  assert.equal(formatTlv('54', '1250000'), '54071250000')
})

test('30. QR code SVG element has proper attributes', () => {
  const payload = generateVietQrPayload({
    accountNumber: '0123456789',
    amountVnd: 550000,
    bankBin: '970422',
    transferContent: 'HANAPIPI HF-20260923-ABCD1234',
  })
  const qr = qrcode(0, 'M')
  qr.addData(payload)
  qr.make()
  const svg = qr.createSvgTag({ scalable: true })
  assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'))
  assert.ok(svg.includes('viewBox='))
})

// =============================================================================
// 8. REGRESSION & COMMERCE INVARIANTS (Tests 31-35)
// =============================================================================

test('31. cart with size, wrapping, and gift add-ons preserves calculated total in payment', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedUsers(sqlite)
  const worker = createTestWorker(d1)

  const payload = createValidBankOrderPayload()
  payload.items = [
    {
      giftAddOnIds: ['mini-scented-candle'], // 95,000 VND
      productId: 'nang-diu',
      quantity: 2,
      sizeId: 'standard', // 615,000 VND
      wrappingId: 'ivory-paper',
    },
  ]

  const res = await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(payload),
    headers: { Authorization: 'Bearer customer-token-1', 'Content-Type': 'application/json' },
    method: 'POST',
  })

  const body = await res.json()
  const expectedUnit = 615000 + 95000
  const expectedTotal = expectedUnit * 2
  assert.equal(body.data.order.totalVnd, expectedTotal)
  assert.equal(body.data.order.payment.amountVnd, expectedTotal)
  assert.equal(body.data.order.payment.bank.amountVnd, expectedTotal)
})

test('32. inactive / archived product checkout still rejected with 409', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedUsers(sqlite)
  sqlite.prepare("UPDATE products SET active = 0 WHERE id = 'nang-diu'").run()
  const worker = createTestWorker(d1)

  const res = await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(createValidBankOrderPayload()),
    headers: { Authorization: 'Bearer customer-token-1', 'Content-Type': 'application/json' },
    method: 'POST',
  })

  assert.equal(res.status, 409)
  const body = await res.json()
  assert.equal(body.error.code, 'PRODUCT_UNAVAILABLE')
})

test('33. API v1 gate still respected (404 when disabled)', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedUsers(sqlite)
  const worker = createTestWorker(d1, { apiV1Enabled: 'false' })

  const res = await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(createValidBankOrderPayload()),
    headers: { Authorization: 'Bearer customer-token-1', 'Content-Type': 'application/json' },
    method: 'POST',
  })

  assert.equal(res.status, 404)
})

test('34. atomic batch execution: on failure, no partial orders created', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedUsers(sqlite)
  const worker = createTestWorker(d1)

  const payload = createValidBankOrderPayload()
  payload.items.push({
    giftAddOnIds: [],
    productId: 'non-existent-product',
    quantity: 1,
    sizeId: 'standard',
    wrappingId: null,
  })

  const res = await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(payload),
    headers: { Authorization: 'Bearer customer-token-1', 'Content-Type': 'application/json' },
    method: 'POST',
  })

  assert.equal(res.status, 400)
  const orderCount = sqlite.prepare('SELECT COUNT(*) as count FROM orders').get().count
  assert.equal(orderCount, 0)
})

test('35. snapshot immutability: product rename does not affect payment presentation', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedUsers(sqlite)
  const worker = createTestWorker(d1)

  const createRes = await worker.fetch('/api/v1/orders', {
    body: JSON.stringify(createValidBankOrderPayload()),
    headers: { Authorization: 'Bearer customer-token-1', 'Content-Type': 'application/json' },
    method: 'POST',
  })
  const { data: { order } } = await createRes.json()

  // Rename product
  sqlite.prepare("UPDATE products SET name = 'Tên Mới Hoàn Toàn' WHERE id = 'nang-diu'").run()

  const detailRes = await worker.fetch(`/api/v1/orders/${order.orderCode}`, {
    headers: { Authorization: 'Bearer customer-token-1' },
  })
  const detailBody = await detailRes.json()
  assert.equal(detailBody.data.order.items[0].name, 'Nắng Dịu')
  assert.equal(detailBody.data.order.payment.bank.amountVnd, order.totalVnd)
})
