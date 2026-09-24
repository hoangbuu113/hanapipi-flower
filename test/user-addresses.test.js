import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import {
  createUserAddress,
  deleteUserAddress,
  fetchUserAddresses,
  setDefaultUserAddress,
  updateUserAddress,
} from '../src/services/apiClient.js'
import { createWorker } from '../src/worker.js'
import { encryptFulfilmentValue } from '../src/server/fulfilmentCrypto.js'

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
  const m8 = fs.readFileSync(path.resolve('drizzle/0008_create_user_addresses.sql'), 'utf8')
  db.exec(m1)
  db.exec(m2)
  db.exec(m3)
  db.exec(m4)
  db.exec(m5)
  db.exec(m6)
  db.exec(m7)
  db.exec(m8)
  return { d1: new D1Wrapper(db), sqlite: db }
}

const localOrigin = 'http://127.0.0.1:5173'
const testJwtKey = 'unit-test-user-addresses-key'
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
      return worker.fetch(new Request(fullUrl, {
        headers: {
          Origin: localOrigin,
          ...fetchOpts.headers,
        },
        ...fetchOpts,
      }), env)
    },
  }
}

test('1. unauthenticated requests to /api/v1/addresses return 401', async () => {
  const { d1 } = createSeededDatabase()
  const { fetch: testFetch } = createTestWorker(d1)

  const resList = await testFetch('/api/v1/addresses')
  assert.equal(resList.status, 401)
  const bodyList = await resList.json()
  assert.equal(bodyList.error.code, 'AUTHENTICATION_REQUIRED')

  const resCreate = await testFetch('/api/v1/addresses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipientName: 'Test' }),
  })
  assert.equal(resCreate.status, 401)

  const resUpdate = await testFetch('/api/v1/addresses/addr_123', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipientName: 'Test' }),
  })
  assert.equal(resUpdate.status, 401)

  const resDelete = await testFetch('/api/v1/addresses/addr_123', {
    method: 'DELETE',
  })
  assert.equal(resDelete.status, 401)

  const resDefault = await testFetch('/api/v1/addresses/addr_123/default', {
    method: 'POST',
  })
  assert.equal(resDefault.status, 401)
})

test('2. customer creates first address: automatically isDefault = true', async () => {
  const { d1 } = createSeededDatabase()
  const { fetch: testFetch } = createTestWorker(d1)

  const res = await testFetch('/api/v1/addresses', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer customer-a-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      label: 'Nhà riêng',
      recipientName: 'Nguyễn Văn A',
      recipientPhone: '0901234567',
      city: 'TP. Hồ Chí Minh',
      unitCode: '26740',
      district: '',
      ward: 'Phường Sài Gòn',
      detail: '123 Đồng Khởi',
      deliveryNote: 'Gọi trước khi giao',
      isDefault: false, // Even if false, first address becomes default
    }),
  })

  assert.equal(res.status, 201)
  const body = await res.json()
  assert.equal(body.data.address.label, 'Nhà riêng')
  assert.equal(body.data.address.recipientName, 'Nguyễn Văn A')
  assert.equal(body.data.address.recipientPhone, '0901234567')
  assert.equal(body.data.address.city, 'TP. Hồ Chí Minh')
  assert.equal(body.data.address.district, '')
  assert.equal(body.data.address.ward, 'Phường Sài Gòn')
  assert.equal(body.data.address.unitCode, '26740')
  assert.equal(body.data.address.detail, '123 Đồng Khởi')
  assert.equal(body.data.address.deliveryNote, 'Gọi trước khi giao')
  assert.equal(body.data.address.isDefault, true)
})

test('3. customer creates second address without isDefault: isDefault is false', async () => {
  const { d1 } = createSeededDatabase()
  const { fetch: testFetch } = createTestWorker(d1)

  await testFetch('/api/v1/addresses', {
    method: 'POST',
    headers: { Authorization: 'Bearer customer-a-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      label: 'Nhà',
      recipientName: 'Nguyễn Văn A',
      recipientPhone: '0901234567',
      city: 'TP. Hồ Chí Minh',
      unitCode: '26740',
      district: '',
      ward: 'Phường Sài Gòn',
      detail: '123 Đồng Khởi',
    }),
  })

  const res2 = await testFetch('/api/v1/addresses', {
    method: 'POST',
    headers: { Authorization: 'Bearer customer-a-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      label: 'Công ty',
      recipientName: 'Nguyễn Văn A (Cty)',
      recipientPhone: '0909876543',
      city: 'TP. Hồ Chí Minh',
      unitCode: '26740',
      district: '',
      ward: 'Phường Sài Gòn',
      detail: '456 Lê Văn Sỹ',
    }),
  })

  assert.equal(res2.status, 201)
  const body2 = await res2.json()
  assert.equal(body2.data.address.label, 'Công ty')
  assert.equal(body2.data.address.isDefault, false)

  const listRes = await testFetch('/api/v1/addresses', {
    headers: { Authorization: 'Bearer customer-a-token' },
  })
  const listBody = await listRes.json()
  assert.equal(listBody.data.items.length, 2)
  assert.equal(listBody.data.items[0].isDefault, true)
  assert.equal(listBody.data.items[0].label, 'Nhà')
  assert.equal(listBody.data.items[1].isDefault, false)
  assert.equal(listBody.data.items[1].label, 'Công ty')
})

test('4. customer creates third address with isDefault: true atomically unsets previous default', async () => {
  const { d1 } = createSeededDatabase()
  const { fetch: testFetch } = createTestWorker(d1)

  await testFetch('/api/v1/addresses', {
    method: 'POST',
    headers: { Authorization: 'Bearer customer-a-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      label: 'Nhà',
      recipientName: 'Nguyễn Văn A',
      recipientPhone: '0901234567',
      city: 'TP. Hồ Chí Minh',
      unitCode: '26740',
      district: '',
      ward: 'Phường Sài Gòn',
      detail: '123 Đồng Khởi',
    }),
  })

  await testFetch('/api/v1/addresses', {
    method: 'POST',
    headers: { Authorization: 'Bearer customer-a-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      label: 'Công ty',
      recipientName: 'Nguyễn Văn A',
      recipientPhone: '0909876543',
      city: 'TP. Hồ Chí Minh',
      unitCode: '26740',
      district: '',
      ward: 'Phường Sài Gòn',
      detail: '456 Lê Văn Sỹ',
    }),
  })

  const res3 = await testFetch('/api/v1/addresses', {
    method: 'POST',
    headers: { Authorization: 'Bearer customer-a-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      label: 'Nhà bố mẹ',
      recipientName: 'Nguyễn Văn B',
      recipientPhone: '0912345678',
      city: 'TP. Hồ Chí Minh',
      unitCode: '26740',
      district: '',
      ward: 'Phường Sài Gòn',
      detail: '789 Xuân Thủy',
      isDefault: true,
    }),
  })

  assert.equal(res3.status, 201)
  const body3 = await res3.json()
  assert.equal(body3.data.address.isDefault, true)
  assert.equal(body3.data.address.label, 'Nhà bố mẹ')

  const listRes = await testFetch('/api/v1/addresses', {
    headers: { Authorization: 'Bearer customer-a-token' },
  })
  const listBody = await listRes.json()
  assert.equal(listBody.data.items.length, 3)
  const defaultItems = listBody.data.items.filter((a) => a.isDefault)
  assert.equal(defaultItems.length, 1)
  assert.equal(defaultItems[0].label, 'Nhà bố mẹ')
})

test('5. PII is encrypted at rest in D1 table user_addresses', async () => {
  const { d1, sqlite } = createSeededDatabase()
  const { fetch: testFetch } = createTestWorker(d1)

  await testFetch('/api/v1/addresses', {
    method: 'POST',
    headers: { Authorization: 'Bearer customer-a-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      label: 'Nhà bí mật',
      recipientName: 'Tuyệt Mật Người Nhận',
      recipientPhone: '0988776655',
      city: 'TP. Hồ Chí Minh',
      unitCode: '26740',
      district: '',
      ward: 'Phường Sài Gòn',
      detail: 'Tòa nhà Landmark 81 tầng 50 phòng 5001',
      deliveryNote: 'Giao tận tay',
    }),
  })

  const row = sqlite.prepare('SELECT * FROM user_addresses LIMIT 1').get()
  assert.ok(row)
  assert.equal(row.key_version, 'aes-gcm-v1')
  assert.ok(row.recipient_ciphertext.startsWith('aes-gcm-v1.'))
  assert.ok(row.address_ciphertext.startsWith('aes-gcm-v1.'))

  // Plaintext must NOT appear in raw database values
  const rawRowString = JSON.stringify(row)
  assert.ok(!rawRowString.includes('Tuyệt Mật Người Nhận'))
  assert.ok(!rawRowString.includes('0988776655'))
  assert.ok(!rawRowString.includes('Tòa nhà Landmark 81'))
  assert.ok(!rawRowString.includes('Giao tận tay'))
})

test('6. raw ciphertext is never exposed over the API response', async () => {
  const { d1 } = createSeededDatabase()
  const { fetch: testFetch } = createTestWorker(d1)

  const res = await testFetch('/api/v1/addresses', {
    method: 'POST',
    headers: { Authorization: 'Bearer customer-a-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      label: 'Nhà',
      recipientName: 'Minh Anh',
      recipientPhone: '0901112233',
      city: 'TP. Hồ Chí Minh',
      unitCode: '26740',
      district: '',
      ward: 'Phường Sài Gòn',
      detail: 'Số 10 Duy Tân',
    }),
  })

  const body = await res.json()
  const text = JSON.stringify(body)
  assert.ok(!text.includes('ciphertext'))
  assert.ok(!text.includes('aes-gcm-v1.'))
  assert.ok(!text.includes(testFulfilmentKey))
})

test('7. missing ORDER_FULFILMENT_KEY returns 503 FULFILMENT_ENCRYPTION_UNAVAILABLE', async () => {
  const { d1 } = createSeededDatabase()
  const { fetch: testFetch } = createTestWorker(d1, { fulfilmentKey: null })

  const res = await testFetch('/api/v1/addresses', {
    method: 'POST',
    headers: { Authorization: 'Bearer customer-a-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      label: 'Nhà',
      recipientName: 'Minh Anh',
      recipientPhone: '0901112233',
      city: 'TP. Hồ Chí Minh',
      unitCode: '26740',
      district: '',
      ward: 'Phường Sài Gòn',
      detail: 'Số 10 Duy Tân',
    }),
  })

  assert.equal(res.status, 503)
  const body = await res.json()
  assert.equal(body.error.code, 'FULFILMENT_ENCRYPTION_UNAVAILABLE')
})

test('8. customer isolation: User B cannot view, update, delete, or default User A address', async () => {
  const { d1 } = createSeededDatabase()
  const { fetch: testFetch } = createTestWorker(d1)

  const resA = await testFetch('/api/v1/addresses', {
    method: 'POST',
    headers: { Authorization: 'Bearer customer-a-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      label: 'Nhà User A',
      recipientName: 'User A',
      recipientPhone: '0901111111',
      city: 'TP. Hồ Chí Minh',
      unitCode: '26740',
      district: '',
      ward: 'Phường Sài Gòn',
      detail: 'Đường A',
    }),
  })
  const addressA = (await resA.json()).data.address

  // User B lists addresses: sees 0 items
  const resBList = await testFetch('/api/v1/addresses', {
    headers: { Authorization: 'Bearer customer-b-token' },
  })
  const bodyBList = await resBList.json()
  assert.equal(bodyBList.data.items.length, 0)

  // User B queries address A by ID: returns 404
  const resBGet = await testFetch(`/api/v1/addresses/${addressA.id}`, {
    headers: { Authorization: 'Bearer customer-b-token' },
  })
  assert.equal(resBGet.status, 404)

  // User B tries to update address A: returns 404
  const resBUpdate = await testFetch(`/api/v1/addresses/${addressA.id}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer customer-b-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ label: 'Hacked by B' }),
  })
  assert.equal(resBUpdate.status, 404)

  // User B tries to delete address A: returns 404
  const resBDelete = await testFetch(`/api/v1/addresses/${addressA.id}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer customer-b-token' },
  })
  assert.equal(resBDelete.status, 404)

  // User B tries to default address A: returns 404
  const resBDefault = await testFetch(`/api/v1/addresses/${addressA.id}/default`, {
    method: 'POST',
    headers: { Authorization: 'Bearer customer-b-token' },
  })
  assert.equal(resBDefault.status, 404)
})

test('9. customer updates an address (PATCH)', async () => {
  const { d1 } = createSeededDatabase()
  const { fetch: testFetch } = createTestWorker(d1)

  const createRes = await testFetch('/api/v1/addresses', {
    method: 'POST',
    headers: { Authorization: 'Bearer customer-a-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      label: 'Nhà cũ',
      recipientName: 'Minh Anh',
      recipientPhone: '0901112233',
      city: 'TP. Hồ Chí Minh',
      unitCode: '26740',
      district: '',
      ward: 'Phường Sài Gòn',
      detail: 'Số 10 Nguyễn Huệ',
    }),
  })
  const created = (await createRes.json()).data.address

  const updateRes = await testFetch(`/api/v1/addresses/${created.id}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer customer-a-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      label: 'Nhà mới',
      detail: 'Số 20 Lê Lợi',
      deliveryNote: 'Bấm chuông tầng 2',
    }),
  })

  assert.equal(updateRes.status, 200)
  const updated = (await updateRes.json()).data.address
  assert.equal(updated.label, 'Nhà mới')
  assert.equal(updated.detail, 'Số 20 Lê Lợi')
  assert.equal(updated.deliveryNote, 'Bấm chuông tầng 2')
  // Preserved fields
  assert.equal(updated.recipientName, 'Minh Anh')
  assert.equal(updated.recipientPhone, '0901112233')
  assert.equal(updated.city, 'TP. Hồ Chí Minh')
  assert.equal(updated.isDefault, true)
})

test('10. setting default address via POST /api/v1/addresses/:id/default', async () => {
  const { d1 } = createSeededDatabase()
  const { fetch: testFetch } = createTestWorker(d1)

  const res1 = await testFetch('/api/v1/addresses', {
    method: 'POST',
    headers: { Authorization: 'Bearer customer-a-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      label: 'Địa chỉ 1',
      recipientName: 'Minh Anh',
      recipientPhone: '0901112233',
      city: 'TP. Hồ Chí Minh',
      unitCode: '26740',
      district: '',
      ward: 'Phường Sài Gòn',
      detail: 'Địa chỉ 1',
    }),
  })
  const addr1 = (await res1.json()).data.address
  assert.equal(addr1.isDefault, true)

  const res2 = await testFetch('/api/v1/addresses', {
    method: 'POST',
    headers: { Authorization: 'Bearer customer-a-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      label: 'Địa chỉ 2',
      recipientName: 'Minh Anh',
      recipientPhone: '0901112233',
      city: 'TP. Hồ Chí Minh',
      unitCode: '26740',
      district: '',
      ward: 'Phường Sài Gòn',
      detail: 'Địa chỉ 2',
    }),
  })
  const addr2 = (await res2.json()).data.address
  assert.equal(addr2.isDefault, false)

  // Now set addr2 as default
  const defaultRes = await testFetch(`/api/v1/addresses/${addr2.id}/default`, {
    method: 'POST',
    headers: { Authorization: 'Bearer customer-a-token' },
  })
  assert.equal(defaultRes.status, 200)
  const defaultBody = await defaultRes.json()
  assert.equal(defaultBody.data.address.id, addr2.id)
  assert.equal(defaultBody.data.address.isDefault, true)

  // Verify list
  const listRes = await testFetch('/api/v1/addresses', {
    headers: { Authorization: 'Bearer customer-a-token' },
  })
  const list = (await listRes.json()).data.items
  const currentDefault = list.find((a) => a.isDefault)
  assert.equal(currentDefault.id, addr2.id)
  const nonDefault = list.find((a) => !a.isDefault)
  assert.equal(nonDefault.id, addr1.id)
})

test('11. deleting default address automatically promotes the newest remaining address to default', async () => {
  const { d1 } = createSeededDatabase()
  const { fetch: testFetch } = createTestWorker(d1)

  // Create addr1 (default)
  const res1 = await testFetch('/api/v1/addresses', {
    method: 'POST',
    headers: { Authorization: 'Bearer customer-a-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      label: 'Địa chỉ 1',
      recipientName: 'Minh Anh',
      recipientPhone: '0901112233',
      city: 'TP. Hồ Chí Minh',
      unitCode: '26740',
      district: '',
      ward: 'Phường Sài Gòn',
      detail: 'Địa chỉ 1',
    }),
  })
  const addr1 = (await res1.json()).data.address

  // Create addr2
  const res2 = await testFetch('/api/v1/addresses', {
    method: 'POST',
    headers: { Authorization: 'Bearer customer-a-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      label: 'Địa chỉ 2',
      recipientName: 'Minh Anh',
      recipientPhone: '0901112233',
      city: 'TP. Hồ Chí Minh',
      unitCode: '26740',
      district: '',
      ward: 'Phường Sài Gòn',
      detail: 'Địa chỉ 2',
    }),
  })
  const addr2 = (await res2.json()).data.address

  // Delete addr1 (the current default)
  const delRes = await testFetch(`/api/v1/addresses/${addr1.id}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer customer-a-token' },
  })
  assert.equal(delRes.status, 200)

  // List should now only have addr2, and addr2 should now be isDefault: true
  const listRes = await testFetch('/api/v1/addresses', {
    headers: { Authorization: 'Bearer customer-a-token' },
  })
  const list = (await listRes.json()).data.items
  assert.equal(list.length, 1)
  assert.equal(list[0].id, addr2.id)
  assert.equal(list[0].isDefault, true)
})

test('12. input validation: invalid phone number and missing fields rejected with 400', async () => {
  const { d1 } = createSeededDatabase()
  const { fetch: testFetch } = createTestWorker(d1)

  const resInvalidPhone = await testFetch('/api/v1/addresses', {
    method: 'POST',
    headers: { Authorization: 'Bearer customer-a-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipientName: 'Minh Anh',
      recipientPhone: '12345',
      city: 'TP. Hồ Chí Minh',
      unitCode: '26740',
      district: '',
      ward: 'Phường Sài Gòn',
      detail: 'Số 10 Nguyễn Huệ',
    }),
  })
  assert.equal(resInvalidPhone.status, 400)
  const bodyPhone = await resInvalidPhone.json()
  assert.ok(bodyPhone.error.fieldErrors.recipientPhone)

  const resMissingFields = await testFetch('/api/v1/addresses', {
    method: 'POST',
    headers: { Authorization: 'Bearer customer-a-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      label: 'Nhà',
    }),
  })
  assert.equal(resMissingFields.status, 400)
  const bodyFields = await resMissingFields.json()
  assert.ok(bodyFields.error.fieldErrors.recipientName)
  assert.ok(bodyFields.error.fieldErrors.recipientPhone)
  assert.ok(bodyFields.error.fieldErrors.unitCode)
  assert.ok(bodyFields.error.fieldErrors.detail)
})

test('13. apiClient address helpers function correctly with auth tokens', async () => {
  const { d1 } = createSeededDatabase()
  const { fetch: testFetch } = createTestWorker(d1)

  const getToken = async () => 'customer-a-token'

  // Create via client helper
  const createResult = await createUserAddress({
    getToken,
    fetchImpl: (url, opts) => testFetch(url, opts),
    address: {
      label: 'Studio',
      recipientName: 'Hoa Tươi Hanapipi',
      recipientPhone: '0901234567',
      city: 'TP. Hồ Chí Minh',
      unitCode: '26740',
      district: '',
      ward: 'Phường Sài Gòn',
      detail: 'Tầng 3, 12 Hoa Cúc',
    },
  })
  assert.equal(createResult.ok, true)
  assert.equal(createResult.address.label, 'Studio')

  // Fetch list
  const listResult = await fetchUserAddresses({
    getToken,
    fetchImpl: (url, opts) => testFetch(url, opts),
  })
  assert.equal(listResult.ok, true)
  assert.equal(listResult.addresses.length, 1)

  // Update
  const updateResult = await updateUserAddress({
    getToken,
    id: createResult.address.id,
    address: { label: 'Studio Hanapipi Q1' },
    fetchImpl: (url, opts) => testFetch(url, opts),
  })
  assert.equal(updateResult.ok, true)
  assert.equal(updateResult.address.label, 'Studio Hanapipi Q1')

  // Set default
  const defaultResult = await setDefaultUserAddress({
    getToken,
    id: createResult.address.id,
    fetchImpl: (url, opts) => testFetch(url, opts),
  })
  assert.equal(defaultResult.ok, true)
  assert.equal(defaultResult.address.isDefault, true)

  // Delete
  const deleteResult = await deleteUserAddress({
    getToken,
    id: createResult.address.id,
    fetchImpl: (url, opts) => testFetch(url, opts),
  })
  assert.equal(deleteResult.ok, true)

  // Verify list empty
  const finalList = await fetchUserAddresses({
    getToken,
    fetchImpl: (url, opts) => testFetch(url, opts),
  })
  assert.equal(finalList.addresses.length, 0)
})

test('new saved addresses reject forged code/name and non-HCMC city', async () => {
  const { d1 } = createSeededDatabase()
  const { fetch: testFetch } = createTestWorker(d1)
  const base = { recipientName: 'Minh Anh', recipientPhone: '0901112233', city: 'TP. Hồ Chí Minh', unitCode: '26740', detail: '18 Nguyễn Huệ' }
  for (const [address, field] of [
    [{ ...base, city: 'Hà Nội' }, 'city'],
    [{ ...base, unitCode: '99999' }, 'unitCode'],
    [{ ...base, ward: 'Phường Bến Nghé' }, 'ward'],
    [{ ...base, detail: '' }, 'detail'],
  ]) {
    const response = await testFetch('/api/v1/addresses', {
      method: 'POST',
      headers: { Authorization: 'Bearer customer-a-token', 'Content-Type': 'application/json' },
      body: JSON.stringify(address),
    })
    assert.equal(response.status, 400)
    assert.ok((await response.json()).error.fieldErrors[field])
  }
})

test('saved-address API distinguishes invalid codes from current units outside delivery scope', async () => {
  const { d1 } = createSeededDatabase()
  const { fetch: testFetch } = createTestWorker(d1)
  const base = { recipientName: 'Minh Anh', recipientPhone: '0901112233', city: 'TP. Hồ Chí Minh', detail: '18 Nguyễn Huệ' }

  for (const [unitCode, expectedCode] of [['99999', 'INVALID_ADMIN_UNIT'], ['25942', 'NOT_SERVICEABLE'], ['26506', 'NOT_SERVICEABLE']]) {
    const response = await testFetch('/api/v1/addresses', {
      method: 'POST',
      headers: { Authorization: 'Bearer customer-a-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...base, unitCode }),
    })
    assert.equal(response.status, 400)
    assert.equal((await response.json()).error.code, expectedCode)
  }
})

test('legacy saved address remains readable but needs an explicit current unit on edit', async () => {
  const { d1, sqlite } = createSeededDatabase()
  const { fetch: testFetch } = createTestWorker(d1)
  await testFetch('/api/v1/addresses', { headers: { Authorization: 'Bearer customer-a-token' } })
  const userId = sqlite.prepare("SELECT id FROM users WHERE provider_subject = 'user_cust_a_subject'").get().id
  const recipientCiphertext = await encryptFulfilmentValue({ name: 'Minh Anh', phone: '0901112233' }, testFulfilmentKey)
  const addressCiphertext = await encryptFulfilmentValue({ city: 'TP. Hồ Chí Minh', district: 'Quận 1', ward: 'Phường Bến Nghé', detail: '18 Nguyễn Huệ' }, testFulfilmentKey)
  const now = new Date().toISOString()
  sqlite.prepare(`INSERT INTO user_addresses (id, user_id, label, recipient_ciphertext, address_ciphertext, key_version, is_default, created_at_utc, updated_at_utc)
    VALUES (?, ?, ?, ?, ?, 'aes-gcm-v1', 1, ?, ?)`).run('addr_legacy', userId, 'Địa chỉ cũ', recipientCiphertext, addressCiphertext, now, now)
  const list = await testFetch('/api/v1/addresses', { headers: { Authorization: 'Bearer customer-a-token' } })
  const legacy = (await list.json()).data.items[0]
  assert.equal(legacy.district, 'Quận 1')
  assert.equal(legacy.ward, 'Phường Bến Nghé')
  assert.equal(legacy.unitCode, null)

  const headers = { Authorization: 'Bearer customer-a-token', 'Content-Type': 'application/json' }
  const rejected = await testFetch('/api/v1/addresses/addr_legacy', { method: 'PATCH', headers, body: JSON.stringify({ detail: '20 Nguyễn Huệ' }) })
  assert.equal(rejected.status, 400)
  assert.ok((await rejected.json()).error.fieldErrors.unitCode)
  const converted = await testFetch('/api/v1/addresses/addr_legacy', { method: 'PATCH', headers, body: JSON.stringify({ detail: '20 Nguyễn Huệ', unitCode: '26740' }) })
  assert.equal(converted.status, 200)
  const current = (await converted.json()).data.address
  assert.equal(current.unitCode, '26740')
  assert.equal(current.ward, 'Phường Sài Gòn')
  assert.equal(current.district, '')
})
