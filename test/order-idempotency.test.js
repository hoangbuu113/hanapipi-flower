import assert from 'node:assert/strict'
import fs from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { LocalD1Database } from '../scripts/d1/local-d1.js'
import { createWorker } from '../src/worker.js'
import { createOrder } from '../src/services/apiClient.js'
import { clearCheckoutAttempt, getCheckoutAttempt } from '../src/utils/checkoutAttempt.js'
import { getCartScope, getCartStorageKey, writeScopedCart } from '../src/utils/cartIdentity.js'
import { createGuestOrderCookie, readGuestOrderCookie, GUEST_ORDER_ACCESS_LIFETIME_MS } from '../src/server/guestOrderAccess.js'

const origin = 'http://127.0.0.1:5173'
const fulfilmentKey = Buffer.alloc(32, 7).toString('base64')

function payload() {
  return {
    address: { city: 'TP. Hồ Chí Minh', unitCode: '26740', ward: 'Phường Sài Gòn', district: '', detail: '18 Nguyễn Huệ', deliveryNote: 'Không giao — kiểm thử' },
    buyer: { name: 'Nguyễn Kiểm Thử', phone: '0901234567', email: 'test@example.invalid' },
    recipient: { name: 'Người Nhận Kiểm Thử', phone: '0912345678' },
    delivery: { date: '2026-09-28', slot: 'morning' },
    gifting: { anonymous: false, message: 'Không xử lý giao — kiểm thử idempotency', senderName: 'Kiểm Thử' },
    items: [{ productId: 'nang-diu', sizeId: 'standard', wrappingId: 'ivory-paper', giftAddOnIds: ['mini-scented-candle'], quantity: 2 }],
    paymentMethod: 'momo',
  }
}

function harness(t) {
  const sqlite = new DatabaseSync(':memory:')
  t.after(() => sqlite.close())
  for (const name of fs.readdirSync('drizzle').filter((name) => /^\d+_.+\.sql$/u.test(name)).sort()) {
    sqlite.exec(fs.readFileSync(`drizzle/${name}`, 'utf8'))
  }
  const d1 = new LocalD1Database(sqlite)
  const logs = []
  const env = {
    PUBLIC_COMMERCE_MODE: 'checkout',
    API_ALLOWED_ORIGINS: origin, API_V1_ENABLED: 'true',
    CLERK_AUTHORIZED_PARTIES: origin, CLERK_JWT_KEY: 'test-public-key',
    DB: d1, ORDER_FULFILMENT_KEY: fulfilmentKey,
    MOMO_ACCOUNT_NAME: 'TEST PAYMENT', MOMO_PHONE_NUMBER: '0901234567',
  }
  const worker = createWorker({
    logger: { info: (...args) => logs.push(args) },
    clerkTokenVerifier: async (token) => {
      if (!['customer-a', 'customer-b'].includes(token)) throw new Error('Invalid test identity')
      return { azp: origin, sub: `clerk-${token}` }
    },
  })
  const fetchImpl = (url, options = {}) => worker.fetch(new Request(new URL(url, origin), options), env)
  const send = (key, order = payload(), token) => fetchImpl('/api/v1/orders', {
    method: 'POST', body: JSON.stringify(order),
    headers: { Origin: origin, 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
  const detail = (order, token, guestToken) => fetchImpl(`/api/v1/orders/${order.id}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(guestToken ? { 'X-Guest-Order-Token': guestToken } : {}) },
  })
  const count = (table) => sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n
  return { count, d1, detail, env, fetchImpl, logs, send, sqlite }
}

async function successful(response) {
  const body = await response.json()
  assert.equal(response.status, 201, JSON.stringify(body))
  assert.equal('guestAccessToken' in body.data, false, 'JSON never exposes the guest credential')
  // Test-only extraction; real browser JS cannot read Set-Cookie.
  const cookie = response.headers.get('Set-Cookie')
  return cookie ? { ...body.data, guestAccessToken: cookie.split(';')[0].split('=')[1] } : body.data
}

test('persistent guest recovery: independent order-scoped cookies survive storage-free reload and protect ownership', async (t) => {
  const h = harness(t)
  const orders = []
  for (let index = 0; index < 3; index += 1) {
    const response = await h.send(crypto.randomUUID())
    assert.equal(response.status, 201)
    const setCookie = response.headers.get('Set-Cookie')
    const body = await response.json()
    assert.equal(body.data.guestAccessToken, undefined)
    assert.match(setCookie, /; HttpOnly; SameSite=Lax/u)
    assert.match(setCookie, /Max-Age=25919\d{2}/u)
    assert.match(setCookie, /; Expires=/u)
    assert.ok(setCookie.includes(`Path=/api/v1/orders/${body.data.order.code};`))
    orders.push({ order: body.data.order, cookie: setCookie.split(';')[0] })
  }
  const jar = orders.map((entry) => entry.cookie).join('; ')
  const read = (code, headers = {}) => h.fetchImpl(`/api/v1/orders/${code}`, { headers })
  for (const { order } of orders) {
    // No sessionStorage, token getter or Authorization: simulate a reopened tab.
    const response = await read(order.code, { Cookie: jar })
    assert.equal(response.status, 200)
    const detail = (await response.json()).data.order
    assert.equal(detail.payment.momo.transferContent, `HANAPIPI ${order.code}`)
    assert.equal(detail.payment.status, 'pending')
    assert.equal(JSON.stringify(detail).includes('ciphertext'), false)
    assert.equal((await read(order.code)).status, 401)
  }
  assert.equal((await read(orders[1].order.code, { Cookie: orders[0].cookie })).status, 401)
  const wrongCookie = orders[1].cookie.split('=')[0] + '=' + orders[0].cookie.split('=')[1]
  assert.equal((await read(orders[1].order.code, { Cookie: wrongCookie })).status, 404)
  assert.equal((await read(orders[0].order.code, { Cookie: jar, Authorization: 'Bearer forged' })).status, 401)
  assert.equal((await read(orders[0].order.code, { Cookie: jar, Authorization: 'Bearer customer-b' })).status, 404)
  const history = await h.fetchImpl('/api/v1/orders', { headers: { Authorization: 'Bearer customer-b', Cookie: jar } })
  assert.equal(history.status, 200)
  assert.equal((await history.json()).data.total, 0)
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM orders WHERE user_id IS NOT NULL').get().n, 0)
})

test('HTTPS guest creation/replay emits identical Secure capability without JSON/log/storage exposure', async (t) => {
  const h = harness(t)
  const httpsOrigin = 'https://staging.example'
  h.env.API_ALLOWED_ORIGINS = httpsOrigin
  const key = crypto.randomUUID()
  const send = () => h.fetchImpl(`${httpsOrigin}/api/v1/orders`, {
    method: 'POST', body: JSON.stringify(payload()),
    headers: { Origin: httpsOrigin, 'Content-Type': 'application/json', 'Idempotency-Key': key },
  })
  const first = await send()
  const firstCookie = first.headers.get('Set-Cookie')
  const body = await first.json()
  assert.equal(first.status, 201)
  assert.match(firstCookie, /^__Secure-hf_guest_HF-/u)
  assert.match(firstCookie, /; Secure$/u)
  assert.match(firstCookie, /; HttpOnly;/u)
  assert.doesNotMatch(firstCookie, /Domain=/u)
  const replay = await send()
  assert.equal(replay.status, 201)
  assert.equal(replay.headers.get('Set-Cookie').split(';')[0], firstCookie.split(';')[0])
  assert.deepEqual((await replay.json()).data, body.data)
  const token = firstCookie.split(';')[0].split('=')[1]
  assert.equal(JSON.stringify(body).includes(token), false)
  assert.equal(JSON.stringify(h.logs).includes(token), false)
  for (const table of ['orders', 'idempotency_keys']) {
    assert.equal(JSON.stringify(h.sqlite.prepare(`SELECT * FROM ${table}`).all()).includes(token), false)
  }
  assert.equal(h.count('orders'), 1)
})

test('legacy header upgrades only verified order to cookie and never extends 30-day server expiry', async (t) => {
  const h = harness(t)
  const response = await h.send(crypto.randomUUID())
  const cookie = response.headers.get('Set-Cookie').split(';')[0]
  const token = cookie.split('=')[1]
  const { order } = (await response.json()).data
  const get = (headers) => h.fetchImpl(`/api/v1/orders/${order.code}`, { headers })
  const upgraded = await get({ 'X-Guest-Order-Token': token })
  assert.equal(upgraded.status, 200)
  assert.equal(upgraded.headers.get('Set-Cookie').split(';')[0], cookie)
  const invalid = await get({ 'X-Guest-Order-Token': 'x'.repeat(43) })
  assert.equal(invalid.status, 404)
  assert.equal(invalid.headers.has('Set-Cookie'), false)
  // Server-enforced expiry is independent of browser cookie expiry/replay lifetime.
  h.sqlite.prepare('UPDATE orders SET created_at_utc = ? WHERE id = ?')
    .run(new Date(Date.now() - GUEST_ORDER_ACCESS_LIFETIME_MS - 1000).toISOString(), order.id)
  for (const headers of [{ Cookie: cookie }, { 'X-Guest-Order-Token': token }]) {
    const expired = await get(headers)
    assert.equal(expired.status, 404)
    assert.equal((await expired.json()).error.code, 'ORDER_NOT_FOUND')
    assert.equal(expired.headers.has('Set-Cookie'), false)
  }
  assert.equal(h.count('orders'), 1, 'Expiry never deletes historical orders')
})

test('cookie helpers enforce narrow paths, Secure, duplicate rejection and original lifetime', () => {
  const code = 'HF-20260926-ABCDEF12'
  const request = new Request(`https://staging.example/api/v1/orders/${code}`)
  const token = 'a'.repeat(43)
  const now = Date.now()
  const order = { code, createdAtUtc: new Date(now - 86400000).toISOString() }
  const cookie = createGuestOrderCookie(request, order, token, now)
  assert.match(cookie, /Max-Age=2505600/u)
  const pair = cookie.split(';')[0]
  assert.equal(readGuestOrderCookie(new Request(request.url, { headers: { Cookie: pair } }), code), token)
  assert.equal(readGuestOrderCookie(new Request(request.url, { headers: { Cookie: `${pair}; ${pair}` } }), code), null)
  assert.equal(readGuestOrderCookie(new Request(request.url, { headers: { Cookie: pair } }), 'HF-20260926-ABCDEF13'), null)
  assert.throws(() => createGuestOrderCookie(request, { ...order, createdAtUtc: '2020-01-01T00:00:00.000Z' }, token, now))
})

test('30-day guest access expiry does not expire authenticated ownership', async (t) => {
  const h = harness(t)
  const created = await successful(await h.send(crypto.randomUUID(), payload(), 'customer-a'))
  h.sqlite.prepare('UPDATE orders SET created_at_utc = ? WHERE id = ?')
    .run('2020-01-01T00:00:00.000Z', created.order.id)
  assert.equal((await h.detail(created.order, 'customer-a')).status, 200)
  assert.equal((await h.detail(created.order, 'customer-b')).status, 404)
})

test('cookie capability grants READ only; cannot create ownership or authorize Admin mutations', async (t) => {
  const h = harness(t)
  const response = await h.send(crypto.randomUUID())
  const cookie = response.headers.get('Set-Cookie').split(';')[0]
  const { order } = (await response.json()).data
  const adminMutation = await h.fetchImpl(`/api/v1/admin/orders/${order.code}/confirm-payment`, {
    method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: '{}',
  })
  assert.equal(adminMutation.status, 401)
  const disallowedOrigin = await h.fetchImpl('/api/v1/orders', {
    method: 'POST', headers: { Cookie: cookie, Origin: 'https://attacker.invalid', 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify(payload()),
  })
  assert.equal(disallowedOrigin.status, 403)
  const mutationOnRead = await h.fetchImpl(`/api/v1/orders/${order.code}`, { method: 'POST', headers: { Cookie: cookie } })
  assert.equal(mutationOnRead.status, 405)
  assert.equal(h.sqlite.prepare('SELECT payment_status FROM orders WHERE id = ?').get(order.id).payment_status, 'pending')
})

test('new checkout/client flow never writes a raw guest credential or puts it in URLs', async () => {
  const checkout = fs.readFileSync('src/pages/CheckoutPage.jsx', 'utf8')
  const legacy = fs.readFileSync('src/utils/guestOrderAccess.js', 'utf8')
  assert.doesNotMatch(checkout, /guestAccessToken|saveGuestOrderAccess/u)
  assert.doesNotMatch(legacy, /setItem|localStorage/u)
  const { fetchGuestOrderDetail } = await import('../src/services/apiClient.js')
  let call
  const read = await fetchGuestOrderDetail('HF-20260926-ABCDEF12', { fetchImpl: async (url, init) => {
    call = { url, init }
    return Response.json({ data: { order: { code: 'HF-20260926-ABCDEF12' } } })
  } })
  assert.equal(read.ok, true)
  assert.equal(call.init.credentials, 'same-origin')
  assert.deepEqual(call.init.headers, {})
  assert.equal(call.url, '/api/v1/orders/HF-20260926-ABCDEF12')
})

test('A. authenticated replay returns one order and identical canonical response', async (t) => {
  const h = harness(t)
  const key = crypto.randomUUID()
  const first = await successful(await h.send(key, payload(), 'customer-a'))
  const second = await successful(await h.send(key, payload(), 'customer-a'))
  assert.deepEqual(second, first)
  assert.equal(h.count('orders'), 1)
  assert.equal(h.count('order_items'), 1)
  assert.equal(h.count('idempotency_keys'), 1)
  const record = h.sqlite.prepare('SELECT * FROM idempotency_keys').get()
  assert.equal(record.scope, `user:${record.user_id}`)
  assert.equal(record.guest_token_ciphertext, null)
})

test('B/J/K. guest replay recovers same credential without plaintext token or fulfilment PII in storage/logs', async (t) => {
  const h = harness(t)
  const key = crypto.randomUUID()
  const first = await successful(await h.send(key))
  const second = await successful(await h.send(key))
  assert.deepEqual(second, first)
  assert.equal(h.count('orders'), 1)
  const access = await h.detail(first.order, null, second.guestAccessToken)
  assert.equal(access.status, 200)
  assert.equal((await access.json()).data.order.receiver.name, payload().recipient.name)
  const record = h.sqlite.prepare('SELECT * FROM idempotency_keys').get()
  assert.equal(record.scope, 'guest')
  assert.equal(record.user_id, null)
  assert.match(record.guest_token_ciphertext, /^aes-gcm-v1\./u)
  assert.equal(Date.parse(record.expires_at_utc) - Date.parse(record.created_at_utc), 86400000)
  const orderRow = h.sqlite.prepare('SELECT * FROM orders').get()
  const stored = JSON.stringify({ record, orderRow, logs: h.logs })
  for (const secret of [first.guestAccessToken, key, payload().buyer.name, payload().buyer.email, payload().address.detail, payload().recipient.name, payload().gifting.message]) {
    assert.equal(stored.includes(secret), false, 'No raw credential or fulfilment PII in D1/logs')
  }
  assert.equal(orderRow.guest_access_token_hash.length, 64)
  const other = await successful(await h.send(crypto.randomUUID()))
  assert.equal((await h.detail(other.order, null, first.guestAccessToken)).status, 404)
})

test('C. changed logical inputs conflict, while untrusted totals/owner never affect fingerprint or pricing', async (t) => {
  const h = harness(t)
  const key = crypto.randomUUID()
  const first = await successful(await h.send(key))
  const fake = { ...payload(), userId: 'forged-owner', total: 1, totalVnd: 1, price: 1, paymentStatus: 'paid' }
  assert.deepEqual(await successful(await h.send(key, fake)), first)
  for (const changed of [
    { ...payload(), items: [{ ...payload().items[0], quantity: 3 }] },
    { ...payload(), buyer: { ...payload().buyer, name: 'Khác' } },
    { ...payload(), address: { ...payload().address, detail: '20 Nguyễn Huệ' } },
    { ...payload(), delivery: { ...payload().delivery, slot: 'afternoon' } },
    { ...payload(), gifting: { ...payload().gifting, message: 'Khác' } },
    { ...payload(), paymentMethod: 'bank_transfer' },
  ]) {
    const response = await h.send(key, changed)
    assert.equal(response.status, 409)
    assert.equal((await response.json()).error.code, 'IDEMPOTENCY_CONFLICT')
  }
  assert.equal(h.count('orders'), 1)
  assert.ok(first.order.totalVnd > 1)
  assert.equal(first.order.paymentStatus, 'pending')
})

test('D. simultaneous identical requests atomically claim exactly one guest/authenticated order', async (t) => {
  const h = harness(t)
  for (const token of [undefined, 'customer-a']) {
    const key = crypto.randomUUID()
    const responses = await Promise.all(Array.from({ length: 6 }, () => h.send(key, payload(), token)))
    const results = await Promise.all(responses.map(successful))
    for (const result of results) assert.deepEqual(result, results[0])
  }
  assert.equal(h.count('orders'), 2)
  assert.equal(h.count('order_items'), 2)
  assert.equal(h.count('order_item_add_ons'), 2)
  assert.equal(h.count('idempotency_keys'), 2)
})

test('D. concurrent differing requests with one key have one winner and one explicit conflict', async (t) => {
  const h = harness(t)
  const key = crypto.randomUUID()
  const responses = await Promise.all([
    h.send(key), h.send(key, { ...payload(), items: [{ ...payload().items[0], quantity: 3 }] }),
  ])
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409])
  assert.equal((await responses.find((response) => response.status === 409).json()).error.code, 'IDEMPOTENCY_CONFLICT')
  assert.equal(h.count('orders'), 1)
})

test('D. a failed concurrent writer refreshes its primary D1 session before replay', async (t) => {
  const h = harness(t)
  const sessions = []
  h.d1.withSession = (constraint) => {
    assert.equal(constraint, 'first-primary')
    let failedBatch = false
    const session = new LocalD1Database(h.sqlite)
    const batch = session.batch.bind(session)
    const prepare = session.prepare.bind(session)
    session.batch = async (statements) => {
      try { return await batch(statements) } catch (error) { failedBatch = true; throw error }
    }
    session.prepare = (sql) => {
      // Model a lagging replica allowed by a pre-conflict session bookmark.
      if (failedBatch && sql.includes('SELECT * FROM idempotency_keys')) {
        return { bind: () => ({ first: async () => null }) }
      }
      return prepare(sql)
    }
    sessions.push(session)
    return session
  }
  const key = crypto.randomUUID()
  const results = await Promise.all((await Promise.all([h.send(key), h.send(key)])).map(successful))
  assert.deepEqual(results[0], results[1])
  assert.ok(sessions.length >= 3, 'Losing batch creates a fresh primary session')
  assert.equal(h.count('orders'), 1)
})

test('E. committed transaction followed by lost HTTP response replays original through client retry', async (t) => {
  const h = harness(t)
  const key = crypto.randomUUID()
  let requests = 0
  const options = { getToken: async () => null, idempotencyKey: key, order: payload() }
  const lost = await createOrder({ ...options, fetchImpl: async (url, init) => {
    requests += 1
    assert.equal((await h.fetchImpl(url, { ...init, headers: { ...init.headers, Origin: origin } })).status, 201)
    throw new TypeError('Simulated lost response')
  } })
  assert.equal(lost.ok, false)
  assert.equal(lost.error.code, 'NETWORK_ERROR')
  assert.equal(requests, 1, 'No automatic POST retry')
  const original = h.sqlite.prepare('SELECT id, order_code FROM orders').get()
  let replayCookie
  const retried = await createOrder({ ...options, fetchImpl: async (url, init) => {
    const response = await h.fetchImpl(url, { ...init, headers: { ...init.headers, Origin: origin } })
    replayCookie = response.headers.get('Set-Cookie').split(';')[0]
    return response
  } })
  assert.equal(retried.ok, true)
  assert.equal(retried.order.id, original.id)
  assert.equal(retried.order.code, original.order_code)
  assert.equal(retried.guestAccessToken, undefined)
  assert.equal((await h.fetchImpl(`/api/v1/orders/${retried.order.code}`, { headers: { Cookie: replayCookie } })).status, 200)
  assert.equal(h.count('orders'), 1)
})

test('F. failed item persistence rolls back order and claim; same key then succeeds', async (t) => {
  const h = harness(t)
  const key = crypto.randomUUID()
  h.sqlite.exec("CREATE TRIGGER fail_test_item BEFORE INSERT ON order_items BEGIN SELECT RAISE(ABORT, 'isolated failure'); END")
  const failed = await h.send(key)
  assert.equal(failed.status, 500)
  assert.equal(h.count('orders'), 0)
  assert.equal(h.count('order_items'), 0)
  assert.equal(h.count('idempotency_keys'), 0)
  h.sqlite.exec('DROP TRIGGER fail_test_item')
  await successful(await h.send(key))
  assert.equal(h.count('orders'), 1)
  assert.equal(h.count('idempotency_keys'), 1)
  assert.deepEqual(h.sqlite.prepare('PRAGMA foreign_key_check').all(), [])
})

test('F. validation failure does not poison the key', async (t) => {
  const h = harness(t)
  const key = crypto.randomUUID()
  h.sqlite.exec("UPDATE products SET active = 0 WHERE id = 'nang-diu'")
  assert.equal((await h.send(key)).status, 409)
  assert.equal(h.count('idempotency_keys'), 0)
  h.sqlite.exec("UPDATE products SET active = 1 WHERE id = 'nang-diu'")
  await successful(await h.send(key))
  assert.equal(h.count('orders'), 1)
})

test('G/H. verified identity scopes replay, forged owner ignored, invalid bearer never becomes Guest', async (t) => {
  const h = harness(t)
  const key = crypto.randomUUID()
  const a = await successful(await h.send(key, payload(), 'customer-a'))
  const b = await successful(await h.send(key, { ...payload(), userId: 'customer-a', role: 'admin' }, 'customer-b'))
  assert.notEqual(a.order.id, b.order.id)
  assert.equal((await h.detail(a.order, 'customer-b')).status, 404)
  assert.equal((await h.detail(b.order, 'customer-a')).status, 404)
  const guest = await successful(await h.send(key))
  assert.notEqual(guest.order.id, a.order.id)
  const invalid = await h.send(crypto.randomUUID(), payload(), 'forged-token')
  assert.equal(invalid.status, 401)
  assert.equal(h.count('orders'), 3)
  const owners = h.sqlite.prepare('SELECT provider_subject FROM users JOIN orders ON users.id = orders.user_id ORDER BY provider_subject').all()
  assert.deepEqual(owners.map((owner) => owner.provider_subject), ['clerk-customer-a', 'clerk-customer-b'])
})

test('I. replay keeps original price/payment/items despite catalogue/options/payment-config changes', async (t) => {
  const h = harness(t)
  const key = crypto.randomUUID()
  const first = await successful(await h.send(key))
  h.sqlite.exec("UPDATE products SET active = 0 WHERE id = 'nang-diu'; UPDATE product_variants SET price_vnd = price_vnd + 100000, active = 0 WHERE product_id = 'nang-diu'; UPDATE gift_add_ons SET price_vnd = price_vnd + 50000")
  h.env.MOMO_ACCOUNT_NAME = 'CHANGED TEST CONFIG'
  assert.deepEqual(await successful(await h.send(key)), first)
  assert.equal(h.count('orders'), 1)
})

test('expired replay material is cleared, tombstone prevents accidental new order', async (t) => {
  const h = harness(t)
  const key = crypto.randomUUID()
  const first = await successful(await h.send(key))
  h.sqlite.exec("UPDATE idempotency_keys SET expires_at_utc = '2020-01-01T00:00:00.000Z'")
  const expired = await h.send(key)
  assert.equal(expired.status, 409)
  assert.equal((await expired.json()).error.code, 'IDEMPOTENCY_EXPIRED')
  const record = h.sqlite.prepare('SELECT * FROM idempotency_keys').get()
  assert.equal(record.response_snapshot_json, null)
  assert.equal(record.guest_token_ciphertext, null)
  assert.equal(h.count('orders'), 1)
  assert.equal((await h.detail(first.order, null, first.guestAccessToken)).status, 200)
})

test('missing or malformed key fails safely without creating an order', async (t) => {
  const h = harness(t)
  for (const key of [undefined, 'order-code-not-a-key', '0'.repeat(100)]) {
    const response = await h.send(key)
    assert.equal(response.status, 400)
    assert.equal((await response.json()).error.code, 'INVALID_IDEMPOTENCY_KEY')
  }
  assert.equal(h.count('orders'), 0)
})

test('canonical normalization ignores object/gift ordering and normalizes Vietnamese Unicode', async (t) => {
  const h = harness(t)
  const key = crypto.randomUUID()
  const order = payload()
  order.items[0].giftAddOnIds.push('handwritten-card')
  const first = await successful(await h.send(key, order))
  const equivalent = { ...order, items: [{ ...order.items[0], giftAddOnIds: [...order.items[0].giftAddOnIds].reverse() }], buyer: { ...order.buyer, name: ` ${order.buyer.name.normalize('NFD')} `, phone: '090 123 4567' } }
  assert.deepEqual(await successful(await h.send(key, equivalent)), first)
})

function storage() {
  const values = new Map()
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key), values }
}

test('L. stable client attempt survives retry/session reload, changed payload/identity gets new key', async () => {
  const store = storage()
  const scope = `user:${crypto.randomUUID()}`
  const order = payload()
  order.items[0].giftAddOnIds.push('handwritten-card')
  const key = await getCheckoutAttempt({ scope, order, storage: store })
  assert.match(key, /^[0-9a-f-]{36}$/u)
  assert.equal(await getCheckoutAttempt({ scope, order: { ...order }, storage: store }), key)
  assert.equal(await getCheckoutAttempt({ scope, order: { ...order, items: [{ ...order.items[0], giftAddOnIds: [...order.items[0].giftAddOnIds].reverse() }] }, storage: store }), key)
  // A fresh module models reload: sessionStorage, not module memory, recovers key.
  const reloaded = await import(`../src/utils/checkoutAttempt.js?reload=${crypto.randomUUID()}`)
  assert.equal(await reloaded.getCheckoutAttempt({ scope, order, storage: store }), key)
  assert.equal(JSON.stringify([...store.values.values()]).includes(order.buyer.name), false)
  const changed = await getCheckoutAttempt({ scope, order: { ...order, paymentMethod: 'bank_transfer' }, storage: store })
  assert.notEqual(changed, key)
  const guestKey = await getCheckoutAttempt({ scope: 'guest', order, storage: store })
  assert.notEqual(guestKey, key)
  clearCheckoutAttempt(scope, key, store)
  assert.equal(await getCheckoutAttempt({ scope, order: { ...order, paymentMethod: 'bank_transfer' }, storage: store }), changed)
  clearCheckoutAttempt(scope, changed, store)
  assert.notEqual(await getCheckoutAttempt({ scope, order, storage: store }), key)
  assert.equal(await getCheckoutAttempt({ scope: 'guest', order, storage: store }), guestKey)
})

test('client attempt remains stable without sessionStorage or with a corrupt stored key', async () => {
  const scope = `user:${crypto.randomUUID()}`
  const first = await getCheckoutAttempt({ scope, order: payload(), storage: null })
  assert.equal(await getCheckoutAttempt({ scope, order: payload(), storage: null }), first)
  const store = storage()
  const secondScope = `user:${crypto.randomUUID()}`
  const key = await getCheckoutAttempt({ scope: secondScope, order: payload(), storage: store })
  const [storageKey, value] = [...store.values][0]
  store.setItem(storageKey, JSON.stringify({ ...JSON.parse(value), key: '-'.repeat(36) }))
  const reloaded = await import(`../src/utils/checkoutAttempt.js?reload=${crypto.randomUUID()}`)
  assert.notEqual(await reloaded.getCheckoutAttempt({ scope: secondScope, order: payload(), storage: store }), key)
})

test('L. clearing active cart/attempt cannot clear other identity; ambiguous failure preserves state', async () => {
  const store = storage()
  const guest = getCartScope({ isLoaded: true, isSignedIn: false })
  const user = getCartScope({ isLoaded: true, isSignedIn: true, userId: 'clerk-test' })
  const cart = { items: [{ productId: 'nang-diu', quantity: 2 }], delivery: { date: '2026-09-28', slot: 'morning' } }
  writeScopedCart(store, guest, cart)
  writeScopedCart(store, user, cart)
  const key = await getCheckoutAttempt({ scope: user, order: payload(), storage: store })
  const result = await createOrder({ getToken: async () => 'customer-a', order: payload(), idempotencyKey: key, fetchImpl: async () => { throw new TypeError('Network') } })
  assert.equal(result.ok, false)
  assert.equal(await getCheckoutAttempt({ scope: user, order: payload(), storage: store }), key)
  assert.equal(JSON.parse(store.getItem(getCartStorageKey(user))).items.length, 1)
  writeScopedCart(store, user, { items: [], delivery: cart.delivery })
  clearCheckoutAttempt(user, key, store)
  assert.equal(JSON.parse(store.getItem(getCartStorageKey(guest))).items.length, 1)
  const source = fs.readFileSync('src/pages/CheckoutPage.jsx', 'utf8')
  assert.doesNotMatch(source, /createOrder\(|getCheckoutAttempt\(/u, 'Public summary must leave commerce replay attempts untouched')
  assert.match(source, /if \(result.ok\) \{[\s\S]*?clearCart\(\)/u)
})

test('migration preserves existing user-scoped keys without inventing guest users', (t) => {
  const sqlite = new DatabaseSync(':memory:')
  t.after(() => sqlite.close())
  for (const name of fs.readdirSync('drizzle').filter((name) => /^000[1-9]_/u.test(name)).sort()) sqlite.exec(fs.readFileSync(`drizzle/${name}`, 'utf8'))
  sqlite.exec("INSERT INTO users (id, auth_provider, provider_subject, role, status, locale, created_at_utc, updated_at_utc) VALUES ('old-user', 'clerk', 'old-subject', 'customer', 'active', 'vi-VN', '2026-09-26T00:00:00.000Z', '2026-09-26T00:00:00.000Z')")
  sqlite.prepare("INSERT INTO idempotency_keys (id, user_id, action, key_hash, request_hash, created_at_utc, expires_at_utc) VALUES ('old-key', 'old-user', 'future-action', ?, ?, '2026-09-26T00:00:00.000Z', '2026-09-27T00:00:00.000Z')").run('a'.repeat(64), 'b'.repeat(64))
  sqlite.exec(fs.readFileSync('drizzle/0010_order_idempotency.sql', 'utf8'))
  const row = sqlite.prepare('SELECT * FROM idempotency_keys').get()
  assert.equal(row.id, 'old-key')
  assert.equal(row.scope, 'user:old-user')
  assert.equal(row.request_hash, 'b'.repeat(64))
  assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(), [])
})
