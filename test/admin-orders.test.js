import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import {
  confirmAdminOrderPayment,
  deleteAdminOrder,
  fetchAdminOrderDetail,
  fetchAdminOrders,
  updateAdminOrderStatus,
} from '../src/services/adminClient.js'
import {
  formatDeliveryDate,
  formatDeliverySlot,
  formatOrderAuditEvent,
  formatOrderStatus,
  formatPaymentMethod,
  formatPaymentStatus,
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
    this.db.exec('BEGIN')
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
const testJwtKey = 'unit-test-admin-orders-public-key'
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
    if (token === 'admin-token') {
      return { azp: localOrigin, sub: 'user_admin_subject' }
    }
    if (token === 'customer-token') {
      return { azp: localOrigin, sub: 'user_customer_subject' }
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
      ('usr_admin_1', 'clerk', 'user_admin_subject', 'admin', 'active', 'vi-VN', '${now}', '${now}'),
      ('usr_cust_1', 'clerk', 'user_customer_subject', 'customer', 'active', 'vi-VN', '${now}', '${now}')
    ON CONFLICT(id) DO UPDATE SET role = excluded.role;
  `)
}

async function createTestOrder(testWorker, token = 'customer-token') {
  const res = await testWorker.fetch('/api/v1/orders', {
    body: JSON.stringify({
      address: {
        city: 'TP. Hồ Chí Minh',
        unitCode: '26740',
        detail: 'Không giao',
        district: '',
        ward: 'Phường Sài Gòn',
      },
      buyer: {
        email: 'customer@example.com',
        name: 'Nguyễn Văn A',
        phone: '0901234567',
      },
      recipient: {
        name: 'Nguyễn',
        phone: '0907654321',
      },
      delivery: {
        date: '2026-10-01',
        slot: '09:00 - 12:00',
      },
      gifting: {
        anonymous: false,
        message: 'Không xử lý giao',
        senderName: 'Bạn Thân',
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
    }),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Origin: localOrigin,
    },
    method: 'POST',
  })
  const body = await res.json().catch(() => null)
  if (res.status !== 201) {
    throw new Error(`createTestOrder failed with status ${res.status}: ${JSON.stringify(body)}`)
  }
  return body.data.order
}

test('Admin Orders Fulfilment Workflow - Comprehensive Suite', async (t) => {
  const { d1, sqlite } = createSeededDatabase()
  seedTestUsers(sqlite)
  const testWorker = createTestWorker(d1)

  // 1. Auth Guard - Guest GET /api/v1/admin/orders returns 401
  await t.test('1. Guest GET /api/v1/admin/orders returns 401', async () => {
    const res = await testWorker.fetch('/api/v1/admin/orders')
    assert.equal(res.status, 401)
  })

  // 2. Auth Guard - Customer GET /api/v1/admin/orders returns 403
  await t.test('2. Customer GET /api/v1/admin/orders returns 403', async () => {
    const res = await testWorker.fetch('/api/v1/admin/orders', {
      headers: { Authorization: 'Bearer customer-token' },
    })
    assert.equal(res.status, 403)
  })

  // 3. Admin GET /api/v1/admin/orders returns 200 with orders array
  await t.test('3. Admin GET /api/v1/admin/orders returns 200 with orders array', async () => {
    const created = await createTestOrder(testWorker)
    assert.ok(created?.id)

    const res = await testWorker.fetch('/api/v1/admin/orders', {
      headers: { Authorization: 'Bearer admin-token' },
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.ok(body.data?.orders)
    assert.ok(body.data.orders.length > 0)
    const found = body.data.orders.find((o) => o.id === created.id)
    assert.ok(found)
    assert.equal(found.orderCode, created.orderCode)
    assert.equal(found.status, 'received')
    assert.equal(found.paymentStatus, 'pending')
  })

  // 4. Guest GET /api/v1/admin/orders/:id returns 401
  await t.test('4. Guest GET /api/v1/admin/orders/:id returns 401', async () => {
    const res = await testWorker.fetch('/api/v1/admin/orders/non-existent')
    assert.equal(res.status, 401)
  })

  // 5. Customer GET /api/v1/admin/orders/:id returns 403
  await t.test('5. Customer GET /api/v1/admin/orders/:id returns 403', async () => {
    const res = await testWorker.fetch('/api/v1/admin/orders/non-existent', {
      headers: { Authorization: 'Bearer customer-token' },
    })
    assert.equal(res.status, 403)
  })

  // 6. Admin GET /api/v1/admin/orders/:id returns 200 with decrypted fulfilment details
  await t.test('6. Admin GET /api/v1/admin/orders/:id returns 200 with decrypted fulfilment details', async () => {
    const created = await createTestOrder(testWorker)
    const res = await testWorker.fetch(`/api/v1/admin/orders/${created.id}`, {
      headers: { Authorization: 'Bearer admin-token' },
    })
    assert.equal(res.status, 200)
    const responseText = await res.text()
    assert.doesNotMatch(responseText, /ciphertext|aes-gcm-v1|ORDER_FULFILMENT_KEY/u)
    const body = JSON.parse(responseText)
    assert.ok(body.data?.order)
    const order = body.data.order
    assert.equal(order.id, created.id)
    assert.equal(order.buyer.name, 'Nguyễn Văn A')
    assert.equal(order.buyer.phone, '0901234567')
    assert.equal(order.recipient.name, 'Nguyễn')
    assert.equal(order.address.detail, 'Không giao')
    assert.equal(order.address.ward, 'Phường Sài Gòn')
    assert.equal(order.address.district, '')
    assert.equal(order.address.city, 'TP. Hồ Chí Minh')
    assert.equal(order.gifting.message, 'Không xử lý giao')
    assert.ok(Array.isArray(order.items))
    assert.equal(order.items.length, 1)
    assert.ok(Array.isArray(order.auditHistory))
  })

  await t.test('6a. Admin audit history preserves millisecond event order', async () => {
    const created = await createTestOrder(testWorker)
    const insertAudit = sqlite.prepare(`
      INSERT INTO audit_events (
        id, actor_user_id, action, entity_type, entity_id, result,
        status_before, status_after, metadata_version, created_at_utc
      ) VALUES (?, 'usr_admin_1', ?, 'order', ?, 'success', ?, ?, '1', ?)
    `)
    insertAudit.run('aud_z_payment', 'order_payment_confirmed', created.id, 'received', 'preparing', '2026-09-23T11:37:27.100Z')
    insertAudit.run('aud_a_delivering', 'order_status_updated', created.id, 'preparing', 'delivering', '2026-09-23T11:37:27.200Z')
    insertAudit.run('aud_b_completed', 'order_status_updated', created.id, 'delivering', 'completed', '2026-09-23T11:37:27.300Z')

    const response = await testWorker.fetch(`/api/v1/admin/orders/${created.id}`, {
      headers: { Authorization: 'Bearer admin-token' },
    })
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.deepEqual(
      body.data.order.auditHistory.map((event) => event.statusAfter),
      ['preparing', 'delivering', 'completed'],
    )
  })

  // 7. Admin GET /api/v1/admin/orders/:id with non-existent ID returns 404
  await t.test('7. Admin GET /api/v1/admin/orders/:id with non-existent ID returns 404', async () => {
    const res = await testWorker.fetch('/api/v1/admin/orders/ord_nonexistent_9999', {
      headers: { Authorization: 'Bearer admin-token' },
    })
    assert.equal(res.status, 404)
  })

  // 8. Guest POST /api/v1/admin/orders/:id/confirm-payment returns 401
  await t.test('8. Guest POST /api/v1/admin/orders/:id/confirm-payment returns 401', async () => {
    const res = await testWorker.fetch('/api/v1/admin/orders/ord_test/confirm-payment', {
      headers: { Origin: localOrigin },
      method: 'POST',
    })
    assert.equal(res.status, 401)
  })

  // 9. Customer POST /api/v1/admin/orders/:id/confirm-payment returns 403
  await t.test('9. Customer POST /api/v1/admin/orders/:id/confirm-payment returns 403', async () => {
    const res = await testWorker.fetch('/api/v1/admin/orders/ord_test/confirm-payment', {
      headers: { Authorization: 'Bearer customer-token', Origin: localOrigin },
      method: 'POST',
    })
    assert.equal(res.status, 403)
  })

  // 10. Admin confirms payment on pending order -> moves to paid and preparing
  await t.test('10. Admin confirms payment on pending order -> paid and preparing', async () => {
    const order = await createTestOrder(testWorker)
    assert.equal(order.status, 'received')
    assert.equal(order.paymentStatus, 'pending')

    const res = await testWorker.fetch(`/api/v1/admin/orders/${order.id}/confirm-payment`, {
      headers: {
        Authorization: 'Bearer admin-token',
        'Content-Type': 'application/json',
        Origin: localOrigin,
      },
      method: 'POST',
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.ok(body.data?.order)
    assert.equal(body.data.order.paymentStatus, 'paid')
    assert.equal(body.data.order.status, 'preparing')

    // Verify audit event written
    const auditEv = sqlite.prepare(`
      SELECT * FROM audit_events
      WHERE entity_type = 'order' AND entity_id = ? AND action = 'order_payment_confirmed'
    `).get(order.id)
    assert.ok(auditEv)
    assert.equal(auditEv.actor_user_id, 'usr_admin_1')
    assert.equal(auditEv.status_before, 'received')
    assert.equal(auditEv.status_after, 'preparing')
  })

  // 11. Confirm payment is idempotent when order is already paid
  await t.test('11. Confirm payment is idempotent when order is already paid', async () => {
    const order = await createTestOrder(testWorker)
    const res1 = await testWorker.fetch(`/api/v1/admin/orders/${order.id}/confirm-payment`, {
      headers: { Authorization: 'Bearer admin-token', Origin: localOrigin },
      method: 'POST',
    })
    assert.equal(res1.status, 200)

    // Second confirmation
    const res2 = await testWorker.fetch(`/api/v1/admin/orders/${order.id}/confirm-payment`, {
      headers: { Authorization: 'Bearer admin-token', Origin: localOrigin },
      method: 'POST',
    })
    assert.equal(res2.status, 200)
    const body2 = await res2.json()
    assert.equal(body2.data.order.paymentStatus, 'paid')
  })

  // 12. Guest POST /api/v1/admin/orders/:id/status returns 401
  await t.test('12. Guest POST /api/v1/admin/orders/:id/status returns 401', async () => {
    const res = await testWorker.fetch('/api/v1/admin/orders/ord_test/status', {
      body: JSON.stringify({ status: 'delivering' }),
      headers: { 'Content-Type': 'application/json', Origin: localOrigin },
      method: 'POST',
    })
    assert.equal(res.status, 401)
  })

  // 13. Customer POST /api/v1/admin/orders/:id/status returns 403
  await t.test('13. Customer POST /api/v1/admin/orders/:id/status returns 403', async () => {
    const res = await testWorker.fetch('/api/v1/admin/orders/ord_test/status', {
      body: JSON.stringify({ status: 'delivering' }),
      headers: {
        Authorization: 'Bearer customer-token',
        'Content-Type': 'application/json',
        Origin: localOrigin,
      },
      method: 'POST',
    })
    assert.equal(res.status, 403)
  })

  // 14. Admin transitions preparing -> delivering succeeds
  await t.test('14. Admin transitions preparing -> delivering succeeds', async () => {
    const order = await createTestOrder(testWorker)
    // First confirm payment so it reaches preparing
    await testWorker.fetch(`/api/v1/admin/orders/${order.id}/confirm-payment`, {
      headers: { Authorization: 'Bearer admin-token', Origin: localOrigin },
      method: 'POST',
    })

    const res = await testWorker.fetch(`/api/v1/admin/orders/${order.id}/status`, {
      body: JSON.stringify({ status: 'delivering' }),
      headers: {
        Authorization: 'Bearer admin-token',
        'Content-Type': 'application/json',
        Origin: localOrigin,
      },
      method: 'POST',
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.ok(body.data?.order)
    assert.equal(body.data.order.status, 'delivering')

    // Check audit event
    const auditEv = sqlite.prepare(`
      SELECT * FROM audit_events
      WHERE entity_type = 'order' AND entity_id = ? AND status_after = 'delivering'
    `).get(order.id)
    assert.ok(auditEv)
    assert.equal(auditEv.status_before, 'preparing')
  })

  // 15. Admin transitions delivering -> completed succeeds
  await t.test('15. Admin transitions delivering -> completed succeeds', async () => {
    const order = await createTestOrder(testWorker)
    await testWorker.fetch(`/api/v1/admin/orders/${order.id}/confirm-payment`, {
      headers: { Authorization: 'Bearer admin-token', Origin: localOrigin },
      method: 'POST',
    })
    await testWorker.fetch(`/api/v1/admin/orders/${order.id}/status`, {
      body: JSON.stringify({ status: 'delivering' }),
      headers: {
        Authorization: 'Bearer admin-token',
        'Content-Type': 'application/json',
        Origin: localOrigin,
      },
      method: 'POST',
    })

    const res = await testWorker.fetch(`/api/v1/admin/orders/${order.id}/status`, {
      body: JSON.stringify({ status: 'completed' }),
      headers: {
        Authorization: 'Bearer admin-token',
        'Content-Type': 'application/json',
        Origin: localOrigin,
      },
      method: 'POST',
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.ok(body.data?.order)
    assert.equal(body.data.order.status, 'completed')

    // Check audit event
    const auditEv = sqlite.prepare(`
      SELECT * FROM audit_events
      WHERE entity_type = 'order' AND entity_id = ? AND status_after = 'completed'
    `).get(order.id)
    assert.ok(auditEv)
    assert.equal(auditEv.status_before, 'delivering')
  })

  // 16. Transition received -> delivering directly is rejected (400)
  await t.test('16. Transition received -> delivering directly is rejected (400)', async () => {
    const order = await createTestOrder(testWorker)
    const res = await testWorker.fetch(`/api/v1/admin/orders/${order.id}/status`, {
      body: JSON.stringify({ status: 'delivering' }),
      headers: {
        Authorization: 'Bearer admin-token',
        'Content-Type': 'application/json',
        Origin: localOrigin,
      },
      method: 'POST',
    })
    assert.equal(res.status, 400)
  })

  // 17. Transition preparing -> completed directly (skipping delivering) is rejected (400)
  await t.test('17. Transition preparing -> completed directly is rejected (400)', async () => {
    const order = await createTestOrder(testWorker)
    await testWorker.fetch(`/api/v1/admin/orders/${order.id}/confirm-payment`, {
      headers: { Authorization: 'Bearer admin-token', Origin: localOrigin },
      method: 'POST',
    })
    const res = await testWorker.fetch(`/api/v1/admin/orders/${order.id}/status`, {
      body: JSON.stringify({ status: 'completed' }),
      headers: {
        Authorization: 'Bearer admin-token',
        'Content-Type': 'application/json',
        Origin: localOrigin,
      },
      method: 'POST',
    })
    assert.equal(res.status, 400)
  })

  // 18. Transition backward delivering -> preparing is rejected (400)
  await t.test('18. Transition backward delivering -> preparing is rejected (400)', async () => {
    const order = await createTestOrder(testWorker)
    await testWorker.fetch(`/api/v1/admin/orders/${order.id}/confirm-payment`, {
      headers: { Authorization: 'Bearer admin-token', Origin: localOrigin },
      method: 'POST',
    })
    await testWorker.fetch(`/api/v1/admin/orders/${order.id}/status`, {
      body: JSON.stringify({ status: 'delivering' }),
      headers: {
        Authorization: 'Bearer admin-token',
        'Content-Type': 'application/json',
        Origin: localOrigin,
      },
      method: 'POST',
    })
    const res = await testWorker.fetch(`/api/v1/admin/orders/${order.id}/status`, {
      body: JSON.stringify({ status: 'preparing' }),
      headers: {
        Authorization: 'Bearer admin-token',
        'Content-Type': 'application/json',
        Origin: localOrigin,
      },
      method: 'POST',
    })
    assert.equal(res.status, 400)
  })

  // 19. Any transition from completed is rejected (400)
  await t.test('19. Any transition from completed is rejected (400)', async () => {
    const order = await createTestOrder(testWorker)
    await testWorker.fetch(`/api/v1/admin/orders/${order.id}/confirm-payment`, {
      headers: { Authorization: 'Bearer admin-token', Origin: localOrigin },
      method: 'POST',
    })
    await testWorker.fetch(`/api/v1/admin/orders/${order.id}/status`, {
      body: JSON.stringify({ status: 'delivering' }),
      headers: {
        Authorization: 'Bearer admin-token',
        'Content-Type': 'application/json',
        Origin: localOrigin,
      },
      method: 'POST',
    })
    await testWorker.fetch(`/api/v1/admin/orders/${order.id}/status`, {
      body: JSON.stringify({ status: 'completed' }),
      headers: {
        Authorization: 'Bearer admin-token',
        'Content-Type': 'application/json',
        Origin: localOrigin,
      },
      method: 'POST',
    })

    const res = await testWorker.fetch(`/api/v1/admin/orders/${order.id}/status`, {
      body: JSON.stringify({ status: 'delivering' }),
      headers: {
        Authorization: 'Bearer admin-token',
        'Content-Type': 'application/json',
        Origin: localOrigin,
      },
      method: 'POST',
    })
    assert.equal(res.status, 400)
  })

  // 20. Transition to preparing requires payment_status === 'paid'
  await t.test('20. Transition to preparing requires payment_status === paid', async () => {
    const order = await createTestOrder(testWorker)
    assert.equal(order.paymentStatus, 'pending')
    const res = await testWorker.fetch(`/api/v1/admin/orders/${order.id}/status`, {
      body: JSON.stringify({ status: 'preparing' }),
      headers: {
        Authorization: 'Bearer admin-token',
        'Content-Type': 'application/json',
        Origin: localOrigin,
      },
      method: 'POST',
    })
    assert.equal(res.status, 409)
  })

  // 21. Client-supplied adminId / role in body or headers is ignored
  await t.test('21. Client-supplied adminId / role in body or headers is ignored', async () => {
    const order = await createTestOrder(testWorker)
    const res = await testWorker.fetch(`/api/v1/admin/orders/${order.id}/confirm-payment`, {
      body: JSON.stringify({
        actorUserId: 'usr_fake_attacker',
        adminId: 'usr_fake_attacker',
        role: 'superadmin',
      }),
      headers: {
        'Admin-Id': 'usr_fake_attacker',
        Authorization: 'Bearer admin-token',
        'Content-Type': 'application/json',
        Origin: localOrigin,
        'X-Admin-Role': 'superadmin',
      },
      method: 'POST',
    })
    assert.equal(res.status, 200)

    const auditEv = sqlite.prepare(`
      SELECT * FROM audit_events
      WHERE entity_type = 'order' AND entity_id = ? AND action = 'order_payment_confirmed'
    `).get(order.id)
    assert.equal(auditEv.actor_user_id, 'usr_admin_1') // Derived from verified token, not fake attacker
  })

  // 22. Admin list response does not leak ciphertext or encryption keys
  await t.test('22. Admin list response does not leak ciphertext or encryption keys', async () => {
    const res = await testWorker.fetch('/api/v1/admin/orders', {
      headers: { Authorization: 'Bearer admin-token' },
    })
    const bodyText = await res.text()
    assert.equal(bodyText.includes('ciphertext'), false)
    assert.equal(bodyText.includes(testFulfilmentKey), false)
  })

  // 23. Admin detail response does not leak ciphertext or encryption keys
  await t.test('23. Admin detail response does not leak ciphertext or encryption keys', async () => {
    const order = await createTestOrder(testWorker)
    const res = await testWorker.fetch(`/api/v1/admin/orders/${order.id}`, {
      headers: { Authorization: 'Bearer admin-token' },
    })
    const bodyText = await res.text()
    assert.equal(bodyText.includes('ciphertext'), false)
    assert.equal(bodyText.includes(testFulfilmentKey), false)
  })

  // 24. Unsupported HTTP method on admin orders returns 405
  await t.test('24. Unsupported HTTP method on admin orders returns 405', async () => {
    const res = await testWorker.fetch('/api/v1/admin/orders', {
      headers: { Authorization: 'Bearer admin-token', Origin: localOrigin },
      method: 'DELETE',
    })
    assert.equal(res.status, 405)
  })

  // 25. Malformed status payload returns 400
  await t.test('25. Malformed status payload returns 400', async () => {
    const order = await createTestOrder(testWorker)
    const res = await testWorker.fetch(`/api/v1/admin/orders/${order.id}/status`, {
      body: JSON.stringify({ status: 12345 }),
      headers: {
        Authorization: 'Bearer admin-token',
        'Content-Type': 'application/json',
        Origin: localOrigin,
      },
      method: 'POST',
    })
    assert.equal(res.status, 400)
  })

  // 26. Unknown status value returns 400
  await t.test('26. Unknown status value returns 400', async () => {
    const order = await createTestOrder(testWorker)
    const res = await testWorker.fetch(`/api/v1/admin/orders/${order.id}/status`, {
      body: JSON.stringify({ status: 'teleported' }),
      headers: {
        Authorization: 'Bearer admin-token',
        'Content-Type': 'application/json',
        Origin: localOrigin,
      },
      method: 'POST',
    })
    assert.equal(res.status, 400)
  })

  // 27. Cross-origin mutation without allowed origin is rejected
  await t.test('27. Cross-origin mutation without allowed origin is rejected', async () => {
    const order = await createTestOrder(testWorker)
    const res = await testWorker.fetch(`/api/v1/admin/orders/${order.id}/confirm-payment`, {
      headers: {
        Authorization: 'Bearer admin-token',
        Origin: 'http://malicious-site.com',
      },
      method: 'POST',
    })
    assert.equal(res.status, 403)
  })

  // 28. Client service fetchAdminOrders works properly
  await t.test('28. Client service fetchAdminOrders works properly', async () => {
    const mockGetToken = async () => 'admin-token'
    const result = await fetchAdminOrders({
      fetchImpl: (url, opts) => testWorker.fetch(url, opts),
      getToken: mockGetToken,
    })
    assert.equal(result.ok, true)
    assert.ok(Array.isArray(result.orders))
  })

  // 29. Client service fetchAdminOrderDetail works properly
  await t.test('29. Client service fetchAdminOrderDetail works properly', async () => {
    const order = await createTestOrder(testWorker)
    const mockGetToken = async () => 'admin-token'
    const result = await fetchAdminOrderDetail(order.id, {
      fetchImpl: (url, opts) => testWorker.fetch(url, opts),
      getToken: mockGetToken,
    })
    assert.equal(result.ok, true)
    assert.equal(result.order.id, order.id)
    assert.ok(result.order.buyer)
  })

  // 30. Client service confirmAdminOrderPayment works properly
  await t.test('30. Client service confirmAdminOrderPayment works properly', async () => {
    const order = await createTestOrder(testWorker)
    const mockGetToken = async () => 'admin-token'
    const result = await confirmAdminOrderPayment(order.id, {
      fetchImpl: (url, opts) => testWorker.fetch(url, opts),
      getToken: mockGetToken,
    })
    assert.equal(result.ok, true)
    assert.equal(result.order.paymentStatus, 'paid')
    assert.equal(result.order.status, 'preparing')
  })

  // 31. Client service updateAdminOrderStatus works properly
  await t.test('31. Client service updateAdminOrderStatus works properly', async () => {
    const order = await createTestOrder(testWorker)
    const mockGetToken = async () => 'admin-token'
    await confirmAdminOrderPayment(order.id, {
      fetchImpl: (url, opts) => testWorker.fetch(url, opts),
      getToken: mockGetToken,
    })
    const result = await updateAdminOrderStatus(order.id, 'delivering', {
      fetchImpl: (url, opts) => testWorker.fetch(url, opts),
      getToken: mockGetToken,
    })
    assert.equal(result.ok, true)
    assert.equal(result.order.status, 'delivering')
  })

  // 32. Client service throws when getToken is missing
  await t.test('32. Client service throws when getToken is missing', async () => {
    assert.rejects(async () => fetchAdminOrders({}), TypeError)
    assert.rejects(async () => fetchAdminOrderDetail('ord_1', {}), TypeError)
    assert.rejects(async () => confirmAdminOrderPayment('ord_1', {}), TypeError)
    assert.rejects(async () => updateAdminOrderStatus('ord_1', 'delivering', {}), TypeError)
  })

  // 33. Utility formatOrderStatus formats all canonical statuses accurately
  await t.test('33. Utility formatOrderStatus formats all canonical statuses accurately', () => {
    assert.equal(formatOrderStatus('received'), 'Đã tiếp nhận')
    assert.equal(formatOrderStatus('confirmed'), 'Đã xác nhận')
    assert.equal(formatOrderStatus('preparing'), 'Đang chuẩn bị')
    assert.equal(formatOrderStatus('processing'), 'Đang chuẩn bị')
    assert.equal(formatOrderStatus('delivering'), 'Đang giao')
    assert.equal(formatOrderStatus('out_for_delivery'), 'Đang giao')
    assert.equal(formatOrderStatus('completed'), 'Hoàn tất')
    assert.equal(formatOrderStatus('cancelled'), 'Đã hủy')
  })

  // 34. Utility formatPaymentStatus formats all payment statuses accurately
  await t.test('34. Utility formatPaymentStatus formats all payment statuses accurately', () => {
    assert.equal(formatPaymentStatus('pending'), 'Chờ thanh toán')
    assert.equal(formatPaymentStatus('mock_pending'), 'Chờ thanh toán')
    assert.equal(formatPaymentStatus('paid'), 'Đã thanh toán')
    assert.equal(formatPaymentStatus('failed'), 'Thanh toán thất bại')
    assert.equal(formatPaymentStatus('cancelled'), 'Đã hủy')
  })

  // 35. Utility formatPaymentMethod formats payment methods accurately
  await t.test('35. Utility formatPaymentMethod formats payment methods accurately', () => {
    assert.equal(formatPaymentMethod('bank_transfer'), 'Chuyển khoản ngân hàng')
    assert.equal(formatPaymentMethod('bank_transfer_mock'), 'bank_transfer_mock')
    assert.equal(formatPaymentMethod('cod'), 'cod')
    assert.equal(formatPaymentMethod('cod_mock'), 'cod_mock')
  })

  // 36. Utility formatDeliveryDate formats date accurately
  await t.test('36. Utility formatDeliveryDate formats date accurately', () => {
    assert.equal(formatDeliveryDate(null), 'Chưa chọn ngày')
    const formatted = formatDeliveryDate('2026-10-01')
    assert.ok(formatted.includes('2026') || formatted.includes('10'))
  })

  await t.test('36a. delivery slots render localized labels without leaking internal enum values', () => {
    assert.equal(formatDeliverySlot('morning'), 'Buổi sáng')
    assert.equal(formatDeliverySlot('afternoon'), 'Buổi chiều')
    assert.equal(formatDeliverySlot('evening'), 'Buổi tối')
    assert.equal(formatDeliverySlot('09:00 – 12:00'), '09:00 – 12:00')
  })

  await t.test('36b. audit events render natural Vietnamese state changes', () => {
    assert.equal(
      formatOrderAuditEvent({ action: 'order_payment_confirmed' }),
      'Xác nhận thanh toán: Chờ thanh toán → Đã thanh toán',
    )
    assert.equal(
      formatOrderAuditEvent({ action: 'order_status_updated', statusBefore: 'received', statusAfter: 'preparing' }),
      'Đơn hàng: Đã tiếp nhận → Đang chuẩn bị',
    )
    assert.equal(
      formatOrderAuditEvent({ action: 'order_status_updated', statusBefore: 'preparing', statusAfter: 'delivering' }),
      'Đơn hàng: Đang chuẩn bị → Đang giao',
    )
    assert.equal(
      formatOrderAuditEvent({ action: 'order_status_updated', statusBefore: 'delivering', statusAfter: 'completed' }),
      'Đơn hàng: Đang giao → Hoàn tất',
    )
  })

  // 37. Customer order read model shows updated paid status after admin confirms payment
  await t.test('37. Customer order read model shows updated paid status after admin confirms payment', async () => {
    const order = await createTestOrder(testWorker)

    // Admin confirms payment
    await testWorker.fetch(`/api/v1/admin/orders/${order.id}/confirm-payment`, {
      headers: { Authorization: 'Bearer admin-token', Origin: localOrigin },
      method: 'POST',
    })

    // Customer reloads own order detail
    const res = await testWorker.fetch(`/api/v1/orders/${order.id}`, {
      headers: { Authorization: 'Bearer customer-token' },
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.data.order.paymentStatus, 'paid')
    assert.equal(body.data.order.status, 'preparing')
  })
})

test('Admin permanently deletes only the selected order aggregate', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedTestUsers(sqlite)
  const testWorker = createTestWorker(d1)
  const target = await createTestOrder(testWorker)
  const untouched = await createTestOrder(testWorker)
  const targetItemId = sqlite.prepare('SELECT id FROM order_items WHERE order_id = ?').get(target.id).id
  const now = new Date().toISOString()

  sqlite.prepare(`
    INSERT INTO audit_events (
      id, actor_user_id, action, entity_type, entity_id, result, metadata_version, created_at_utc
    ) VALUES (?, ?, ?, 'order', ?, 'success', 'v1', ?)
  `).run('evt_delete_target', 'usr_admin_1', 'order_status_updated', target.id, now)
  sqlite.prepare(`
    INSERT INTO audit_events (
      id, actor_user_id, action, entity_type, entity_id, result, metadata_version, created_at_utc
    ) VALUES (?, ?, ?, 'order', ?, 'success', 'v1', ?)
  `).run('evt_delete_untouched', 'usr_admin_1', 'order_status_updated', untouched.id, now)

  const unauthorized = await testWorker.fetch(`/api/v1/admin/orders/${target.id}`, { method: 'DELETE' })
  assert.equal(unauthorized.status, 401)
  const forbidden = await testWorker.fetch(`/api/v1/admin/orders/${target.id}`, {
    body: JSON.stringify({ role: 'admin', userId: 'usr_admin_1' }),
    headers: { Authorization: 'Bearer customer-token', 'Content-Type': 'application/json' },
    method: 'DELETE',
  })
  assert.equal(forbidden.status, 403)

  const result = await deleteAdminOrder(target.id, {
    fetchImpl: (url, options) => testWorker.fetch(url, options),
    getToken: async () => 'admin-token',
  })
  assert.equal(result.ok, true)
  assert.equal(sqlite.prepare('SELECT 1 FROM orders WHERE id = ?').get(target.id), undefined)
  assert.equal(sqlite.prepare('SELECT 1 FROM order_items WHERE order_id = ?').get(target.id), undefined)
  assert.equal(sqlite.prepare('SELECT 1 FROM order_item_add_ons WHERE order_item_id = ?').get(targetItemId), undefined)
  assert.equal(sqlite.prepare("SELECT 1 FROM audit_events WHERE entity_type = 'order' AND entity_id = ?").get(target.id), undefined)
  assert.ok(sqlite.prepare('SELECT 1 FROM orders WHERE id = ?').get(untouched.id))
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM order_items WHERE order_id = ?').get(untouched.id).count, 1)
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE entity_type = 'order' AND entity_id = ?").get(untouched.id).count, 1)

  const repeated = await deleteAdminOrder(target.id, {
    fetchImpl: (url, options) => testWorker.fetch(url, options),
    getToken: async () => 'admin-token',
  })
  assert.equal(repeated.ok, false)
  assert.equal(repeated.status, 404)
  assert.equal(repeated.error.code, 'ORDER_NOT_FOUND')
})

test('Admin order deletion rolls back every child when the parent delete fails', async () => {
  const { d1, sqlite } = createSeededDatabase()
  seedTestUsers(sqlite)
  const testWorker = createTestWorker(d1)
  const target = await createTestOrder(testWorker)
  const itemId = sqlite.prepare('SELECT id FROM order_items WHERE order_id = ?').get(target.id).id
  const addOnCount = sqlite.prepare(`
    SELECT COUNT(*) AS count FROM order_item_add_ons WHERE order_item_id = ?
  `).get(itemId).count
  const now = new Date().toISOString()
  sqlite.prepare(`
    INSERT INTO audit_events (
      id, actor_user_id, action, entity_type, entity_id, result, metadata_version, created_at_utc
    ) VALUES ('evt_delete_rollback', 'usr_admin_1', 'order_status_updated', 'order', ?, 'success', 'v1', ?)
  `).run(target.id, now)
  sqlite.exec(`
    CREATE TRIGGER fail_order_delete
    BEFORE DELETE ON orders
    BEGIN
      SELECT RAISE(ABORT, 'forced order delete failure');
    END;
  `)

  const result = await deleteAdminOrder(target.id, {
    fetchImpl: (url, options) => testWorker.fetch(url, options),
    getToken: async () => 'admin-token',
  })
  assert.equal(result.ok, false)
  assert.equal(result.status, 500)
  assert.ok(sqlite.prepare('SELECT 1 FROM orders WHERE id = ?').get(target.id))
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM order_items WHERE order_id = ?').get(target.id).count, 1)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM order_item_add_ons WHERE order_item_id = ?').get(itemId).count, addOnCount)
  assert.ok(sqlite.prepare("SELECT 1 FROM audit_events WHERE entity_type = 'order' AND entity_id = ?").get(target.id))
})
