import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { formatPaymentMethod } from '../src/utils/order.js'
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
  const migrationFiles = [
    '0001_phase16_foundation.sql',
    '0002_phase16_catalogue_seed.sql',
    '0003_add_product_internal_note.sql',
    '0004_update_order_payment_constraints.sql',
    '0005_add_order_delivering_status.sql',
    '0006_add_momo_payment_method.sql',
  ]
  for (const m of migrationFiles) {
    db.exec(fs.readFileSync(path.resolve('drizzle', m), 'utf8'))
  }
  return { d1: new D1Wrapper(db), sqlite: db }
}

const localOrigin = 'http://127.0.0.1:5173'
const testJwtKey = 'unit-test-momo-public-key'
const testFulfilmentKey = Buffer.from('01234567890123456789012345678901').toString('base64')

const defaultTestMomoConfig = {
  accountName: 'HANAPIPI FLOWER',
  phoneNumber: '0901234567',
  qrMediaKey: 'payment_momo_qr_staging.png',
}

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
  momoConfig = defaultTestMomoConfig,
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
  if (momoConfig !== null) {
    env.MOMO_ACCOUNT_NAME = momoConfig.accountName
    env.MOMO_PHONE_NUMBER = momoConfig.phoneNumber
    env.MOMO_QR_MEDIA_KEY = momoConfig.qrMediaKey
  }
  return env
}

function createTestHarness(d1, options = {}) {
  const mockVerifier = async (token) => {
    if (token === 'customer-token-1') {
      return { azp: localOrigin, sub: 'user_customer_1_subject' }
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

function seedUsers(sqlite) {
  const now = new Date().toISOString()
  sqlite.exec(`
    INSERT INTO users (id, auth_provider, provider_subject, role, status, locale, created_at_utc, updated_at_utc)
    VALUES
      ('usr_cust_001', 'clerk', 'user_customer_1_subject', 'customer', 'active', 'vi-VN', '${now}', '${now}'),
      ('usr_admin_001', 'clerk', 'user_admin_subject', 'admin', 'active', 'vi-VN', '${now}', '${now}');
  `)
}

function createValidOrderPayload(paymentMethod = 'momo') {
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
    paymentMethod,
    recipient: {
      name: 'Trần Thị Người Nhận',
      phone: '0912345678',
    },
  }
}

test('1. D1 schema accepts payment_method = momo and stores pending payment_status', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedUsers(sqlite)
  const harness = createTestHarness(d1)

  const payload = createValidOrderPayload('momo')
  const res = await harness.fetch('/api/v1/orders', {
    body: JSON.stringify(payload),
    headers: {
      Authorization: 'Bearer customer-token-1',
      Origin: localOrigin,
      'content-type': 'application/json',
    },
    method: 'POST',
  })

  assert.equal(res.status, 201)
  const body = await res.json()
  assert.equal(body.data?.order?.paymentMethod, 'momo')
  assert.equal(body.data?.order?.paymentStatus, 'pending')

  const row = sqlite.prepare('SELECT payment_method, payment_status FROM orders WHERE id = ?').get(body.data.order.id)
  assert.equal(row.payment_method, 'momo')
  assert.equal(row.payment_status, 'pending')
})

test('2. Historical bank_transfer orders remain completely valid with migration 0006', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedUsers(sqlite)
  const harness = createTestHarness(d1)

  const payload = createValidOrderPayload('bank_transfer')
  const res = await harness.fetch('/api/v1/orders', {
    body: JSON.stringify(payload),
    headers: {
      Authorization: 'Bearer customer-token-1',
      Origin: localOrigin,
      'content-type': 'application/json',
    },
    method: 'POST',
  })

  assert.equal(res.status, 201)
  const body = await res.json()
  assert.equal(body.data?.order?.paymentMethod, 'bank_transfer')

  const row = sqlite.prepare('SELECT payment_method FROM orders WHERE id = ?').get(body.data.order.id)
  assert.equal(row.payment_method, 'bank_transfer')
})

test('3. MoMo payment presentation DTO contains authoritative fields and QR media URL', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedUsers(sqlite)
  const harness = createTestHarness(d1)

  const payload = createValidOrderPayload('momo')
  const res = await harness.fetch('/api/v1/orders', {
    body: JSON.stringify(payload),
    headers: {
      Authorization: 'Bearer customer-token-1',
      Origin: localOrigin,
      'content-type': 'application/json',
    },
    method: 'POST',
  })

  assert.equal(res.status, 201)
  const body = await res.json()
  const payment = body.data?.order?.payment

  assert.equal(payment.method, 'momo')
  assert.equal(payment.methodLabel, 'MoMo')
  assert.equal(payment.status, 'pending')
  assert.equal(payment.statusLabel, 'Chờ thanh toán')
  assert.ok(payment.momo)
  assert.equal(payment.momo.available, true)
  assert.equal(payment.momo.accountName, 'HANAPIPI FLOWER')
  assert.equal(payment.momo.phoneNumber, '0901234567')
  assert.equal(payment.momo.qrUrl, '/api/v1/media/payment_momo_qr_staging.png')
  assert.equal(payment.momo.amountVnd, body.data.order.totalVnd)
  assert.equal(payment.momo.transferContent, `HANAPIPI ${body.data.order.orderCode}`)
  assert.equal(payment.transferContent, `HANAPIPI ${body.data.order.orderCode}`)
})

test('4. Missing MoMo configuration returns safe PAYMENT_CONFIG_UNAVAILABLE', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedUsers(sqlite)
  const harness = createTestHarness(d1, { momoConfig: null })

  const payload = createValidOrderPayload('momo')
  const res = await harness.fetch('/api/v1/orders', {
    body: JSON.stringify(payload),
    headers: {
      Authorization: 'Bearer customer-token-1',
      Origin: localOrigin,
      'content-type': 'application/json',
    },
    method: 'POST',
  })

  assert.equal(res.status, 201)
  const body = await res.json()
  const payment = body.data?.order?.payment

  assert.equal(payment.method, 'momo')
  assert.equal(payment.momo.available, false)
  assert.equal(payment.momo.error, 'PAYMENT_CONFIG_UNAVAILABLE')
  assert.ok(payment.momo.message)
})

test('5. formatPaymentMethod formats momo as MoMo and bank_transfer as Chuyển khoản ngân hàng', () => {
  assert.equal(formatPaymentMethod('momo'), 'MoMo')
  assert.equal(formatPaymentMethod('bank_transfer'), 'Chuyển khoản ngân hàng')
  assert.equal(formatPaymentMethod('bank_transfer_mock'), 'Chuyển khoản ngân hàng')
  assert.equal(formatPaymentMethod('cod'), 'Thanh toán khi nhận hoa')
})

test('6. Admin can confirm payment on pending MoMo order -> paid and preparing', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedUsers(sqlite)
  const harness = createTestHarness(d1)

  // Customer creates MoMo order
  const payload = createValidOrderPayload('momo')
  const createRes = await harness.fetch('/api/v1/orders', {
    body: JSON.stringify(payload),
    headers: {
      Authorization: 'Bearer customer-token-1',
      Origin: localOrigin,
      'content-type': 'application/json',
    },
    method: 'POST',
  })
  assert.equal(createRes.status, 201)
  const createdOrder = (await createRes.json()).data.order
  assert.equal(createdOrder.paymentMethod, 'momo')
  assert.equal(createdOrder.paymentStatus, 'pending')

  // Admin gets order detail
  const adminDetailRes = await harness.fetch(`/api/v1/admin/orders/${createdOrder.id}`, {
    headers: {
      Authorization: 'Bearer admin-token',
      Origin: localOrigin,
    },
    method: 'GET',
  })
  assert.equal(adminDetailRes.status, 200)
  const adminDetail = (await adminDetailRes.json()).data.order
  assert.equal(adminDetail.paymentMethod, 'momo')
  assert.equal(adminDetail.payment.method, 'momo')
  assert.equal(adminDetail.payment.methodLabel, 'MoMo')
  assert.equal(adminDetail.payment.momo.accountName, 'HANAPIPI FLOWER')
  assert.equal(adminDetail.payment.momo.phoneNumber, '0901234567')

  // Admin confirms payment
  const confirmRes = await harness.fetch(`/api/v1/admin/orders/${createdOrder.id}/confirm-payment`, {
    headers: {
      Authorization: 'Bearer admin-token',
      Origin: localOrigin,
      'content-type': 'application/json',
    },
    method: 'POST',
  })
  assert.equal(confirmRes.status, 200)
  const confirmedOrder = (await confirmRes.json()).data.order
  assert.equal(confirmedOrder.paymentStatus, 'paid')
  assert.equal(confirmedOrder.status, 'preparing')

  // Verify D1 state directly
  const row = sqlite.prepare('SELECT payment_status, status FROM orders WHERE id = ?').get(createdOrder.id)
  assert.equal(row.payment_status, 'paid')
  assert.equal(row.status, 'preparing')

  // Verify audit event
  const audit = sqlite.prepare("SELECT * FROM audit_events WHERE entity_id = ? AND action = 'order_payment_confirmed'").get(createdOrder.id)
  assert.ok(audit, 'Audit event must exist for MoMo payment confirmation')
  assert.equal(audit.status_before, 'received')
  assert.equal(audit.status_after, 'preparing')
})

test('7. Admin can advance MoMo order through delivering to completed', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedUsers(sqlite)
  const harness = createTestHarness(d1)

  const payload = createValidOrderPayload('momo')
  const createRes = await harness.fetch('/api/v1/orders', {
    body: JSON.stringify(payload),
    headers: {
      Authorization: 'Bearer customer-token-1',
      Origin: localOrigin,
      'content-type': 'application/json',
    },
    method: 'POST',
  })
  const orderId = (await createRes.json()).data.order.id

  // Confirm payment
  await harness.fetch(`/api/v1/admin/orders/${orderId}/confirm-payment`, {
    headers: { Authorization: 'Bearer admin-token', Origin: localOrigin },
    method: 'POST',
  })

  // Transition preparing -> delivering
  const delRes = await harness.fetch(`/api/v1/admin/orders/${orderId}/status`, {
    body: JSON.stringify({ status: 'delivering' }),
    headers: { Authorization: 'Bearer admin-token', Origin: localOrigin, 'content-type': 'application/json' },
    method: 'POST',
  })
  assert.equal(delRes.status, 200)
  assert.equal((await delRes.json()).data.order.status, 'delivering')

  // Transition delivering -> completed
  const compRes = await harness.fetch(`/api/v1/admin/orders/${orderId}/status`, {
    body: JSON.stringify({ status: 'completed' }),
    headers: { Authorization: 'Bearer admin-token', Origin: localOrigin, 'content-type': 'application/json' },
    method: 'POST',
  })
  assert.equal(compRes.status, 200)
  assert.equal((await compRes.json()).data.order.status, 'completed')
})
