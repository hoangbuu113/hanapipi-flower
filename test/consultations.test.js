import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { LocalD1Database } from '../scripts/d1/local-d1.js'
import { createWorker } from '../src/worker.js'
import { consultationNotification } from '../src/server/telegramConsultations.js'
import { createConsultationRepository } from '../src/server/repositories/consultationRepository.js'
import { createCatalogueRepository } from '../src/server/repositories/catalogueRepository.js'
import { buildConsultationPayload, createConsultation, getConsultationAttempt } from '../src/services/consultationClient.js'

const origin = 'https://staging.example'
function payload() {
  return { items: [{ productId: 'nang-diu', sizeId: 'standard', wrappingId: 'ivory-paper', giftAddOnIds: ['mini-scented-candle'], quantity: 2 }] }
}
function harness(t, options = {}) {
  const sqlite = new DatabaseSync(':memory:')
  t.after(() => sqlite.close())
  for (const file of fs.readdirSync('drizzle').filter((file) => /^\d+_.+\.sql$/u.test(file)).sort()) sqlite.exec(fs.readFileSync(`drizzle/${file}`, 'utf8'))
  const d1 = new LocalD1Database(sqlite)
  const calls = []
  const tasks = []
  const logs = []
  const env = { DB: d1, API_V1_ENABLED: 'true', API_ALLOWED_ORIGINS: origin,
    CLERK_JWT_KEY: 'test-verification-material', CLERK_AUTHORIZED_PARTIES: origin,
    TELEGRAM_BOT_TOKEN: 'mock-bot-token', TELEGRAM_OWNER_CHAT_ID: 'mock-owner-chat',
    RATE_LIMIT_KEY_SECRET: Buffer.alloc(32, 11).toString('base64') }
  const worker = createWorker({ logger: { info: (entry) => logs.push(entry) },
    clerkTokenVerifier: async (token) => { if (!['customer', 'admin'].includes(token)) throw new Error('Invalid identity'); return { sub: `clerk-${token}`, azp: origin } },
    telegramFetch: async (url, init) => {
      calls.push({ method: url.split('/').pop(), body: JSON.parse(init.body) })
      return options.telegramFetch ? options.telegramFetch(url, init) : Response.json({ ok: true })
    },
  })
  const fetch = (path, init = {}) => worker.fetch(new Request(new URL(path, origin), init), env, { waitUntil: (task) => tasks.push(task) })
  const send = (body = payload(), key = crypto.randomUUID(), headers = {}) => fetch('/api/v1/consultations', { method: 'POST', body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', Origin: origin, 'Idempotency-Key': key, 'CF-Connecting-IP': '192.0.2.3', ...headers } })
  const count = (table) => sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n
  const admin = (path = '', init = {}) => fetch(`/api/v1/admin/consultations${path}`, { ...init, headers: { Authorization: 'Bearer admin', Origin: origin, 'Content-Type': 'application/json', ...init.headers } })
  const readyAdmin = async () => {
    assert.equal((await fetch('/api/v1/me', { headers: { Authorization: 'Bearer admin' } })).status, 200)
    sqlite.prepare("UPDATE users SET role='admin' WHERE provider_subject='clerk-admin'").run()
  }
  return { sqlite, d1, env, calls, logs, tasks, send, fetch, count, admin, readyAdmin, flush: () => Promise.all(tasks) }
}
async function created(response) {
  const body = await response.json()
  assert.ok([200, 201].includes(response.status), JSON.stringify(body))
  return body.data.consultation
}

test('Guest consultation stores authoritative immutable snapshots, no orders/payment/identity; notifies text then images', async (t) => {
  const h = harness(t)
  const input = payload()
  Object.assign(input, { total: 1, userId: 'forged', paymentStatus: 'paid', buyer: { name: 'not collected' } })
  Object.assign(input.items[0], { name: 'forged', image: 'https://attacker.invalid/image', unitPrice: 1 })
  const result = await created(await h.send(input))
  assert.match(result.referenceCode, /^HP-[A-F0-9]{10}$/u)
  assert.deepEqual(Object.keys(result).sort(), ['createdAt', 'items', 'referenceCode', 'referenceTotal', 'status'])
  assert.equal(result.items[0].name, 'Nắng Dịu')
  assert.equal(result.items[0].lineReferenceTotal, result.referenceTotal)
  assert.equal(result.items[0].productId, undefined)
  assert.equal(result.status, 'new')
  const variant = h.sqlite.prepare("SELECT price_vnd FROM product_variants WHERE product_id='nang-diu' AND option_type='size' AND code='standard'").get()
  const gift = h.sqlite.prepare("SELECT price_vnd FROM gift_add_ons WHERE id='mini-scented-candle'").get()
  assert.equal(result.referenceTotal, (variant.price_vnd + gift.price_vnd) * 2)
  const item = h.sqlite.prepare('SELECT * FROM consultation_request_items').get()
  assert.equal(item.product_name_snapshot, 'Nắng Dịu')
  assert.match(item.image_url_snapshot, /^\/api\/v1\/media\//u)
  assert.equal(item.unit_reference_price, variant.price_vnd + gift.price_vnd)
  assert.equal(item.line_reference_total, result.referenceTotal)
  const selections = JSON.parse(item.selections_json)
  assert.equal(selections.gifts[0].price, gift.price_vnd)
  assert.equal(h.count('orders'), 0); assert.equal(h.count('order_items'), 0); assert.equal(h.count('users'), 0)
  await h.flush()
  assert.deepEqual(h.calls.map((call) => call.method), ['sendMessage', 'sendPhoto'])
  assert.match(h.calls[0].body.text, /YÊU CẦU TƯ VẤN/u)
  assert.match(h.calls[0].body.text, /Nắng Dịu × 2/u)
  assert.doesNotMatch(JSON.stringify(h.logs), /mock-bot-token|mock-owner-chat|forged|Authorization|192\.0\.2\.3/u)
  assert.equal(h.sqlite.prepare('SELECT notification_status FROM consultation_requests').get().notification_status, 'sent')
  h.sqlite.prepare("UPDATE products SET name='Changed later' WHERE id='nang-diu'").run()
  assert.equal(h.sqlite.prepare('SELECT product_name_snapshot FROM consultation_request_items').get().product_name_snapshot, 'Nắng Dịu')
})

test('same key, concurrency and lost-response replay create one request/notification; changed payload conflicts', async (t) => {
  const h = harness(t)
  const key = crypto.randomUUID()
  const results = await Promise.all([h.send(payload(), key), h.send(payload(), key), h.send(payload(), key)])
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 200, 201])
  const references = await Promise.all(results.map(created))
  assert.equal(new Set(references.map((r) => r.referenceCode)).size, 1)
  assert.equal(h.count('consultation_requests'), 1); assert.equal(h.count('consultation_request_items'), 1)
  await h.flush()
  assert.equal(h.calls.filter((call) => call.method === 'sendMessage').length, 1)
  const changed = payload(); changed.items[0].quantity = 3
  const conflict = await h.send(changed, key)
  assert.equal(conflict.status, 409); assert.equal((await conflict.json()).error.code, 'IDEMPOTENCY_CONFLICT')
  // Catalogue changes after commit never invalidate a successful replay.
  h.sqlite.prepare("UPDATE products SET active=0 WHERE id='nang-diu'").run()
  const replay = await created(await h.send(payload(), key))
  assert.equal(replay.referenceCode, references[0].referenceCode)
  assert.deepEqual(replay.items, references[0].items)
})

test('two different products generate distinct references and a unique-image Telegram album', async (t) => {
  const h = harness(t)
  const body = payload()
  body.items.push({ productId: 'du-am-hong', sizeId: 'standard', giftAddOnIds: [], quantity: 2 })
  const first = await created(await h.send(body))
  const second = await created(await h.send(body))
  assert.notEqual(first.referenceCode, second.referenceCode)
  await h.flush()
  assert.deepEqual(h.calls.map((call) => call.method), ['sendMessage', 'sendMediaGroup', 'sendMessage', 'sendMediaGroup'])
  assert.equal(h.calls[1].body.media.length, 2)
  assert.equal(new Set(h.calls[1].body.media.map((item) => item.media)).size, 2)
  assert.ok(h.calls[1].body.media.every((item) => item.media.startsWith(`${origin}/api/v1/media/`)))
  h.sqlite.prepare("UPDATE gift_add_ons SET active=0 WHERE id='mini-scented-candle'").run()
  assert.equal((await h.send()).status, 409)
})

test('invalid/priceless/archived product, variant, gifts, quantity and oversized/malformed payload are rejected', async (t) => {
  const h = harness(t)
  for (const override of [{ productId: 'no-watering-flower' }, { productId: 'missing' }, { sizeId: 'missing' }, { wrappingId: 'invalid' }, { giftAddOnIds: ['missing'] }, { quantity: 0 }, { quantity: 21 }, { message: 'x'.repeat(201) }]) {
    const input = payload(); Object.assign(input.items[0], override)
    assert.ok((await h.send(input)).status >= 400)
  }
  assert.equal((await h.send({ items: Array.from({ length: 21 }, () => payload().items[0]) })).status, 400)
  assert.equal((await h.send({ items: [] })).status, 400)
  assert.equal((await h.send(payload(), 'short')).status, 400)
  assert.equal((await h.send({ ...payload(), oversized: 'x'.repeat(17000) })).status, 413)
  assert.equal((await h.fetch('/api/v1/consultations', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{broken' })).status, 400)
  h.sqlite.prepare("UPDATE product_variants SET active=0 WHERE product_id='nang-diu' AND option_type='size'").run()
  assert.equal((await h.send()).status, 409)
  h.sqlite.prepare("UPDATE products SET active=0 WHERE id='nang-diu'").run()
  assert.equal((await h.send()).status, 409)
  assert.equal(h.count('consultation_requests'), 0)
})

test('atomic item failure leaves no consultation or notification', async (t) => {
  const h = harness(t)
  h.sqlite.exec("CREATE TRIGGER fail_consultation_item BEFORE INSERT ON consultation_request_items BEGIN SELECT RAISE(ABORT, 'forced failure'); END")
  assert.equal((await h.send()).status, 503)
  assert.equal(h.count('consultation_requests'), 0); assert.equal(h.calls.length, 0)
})

test('custom bouquets use current D1 option labels/prices, reject malformed or inactive options', async (t) => {
  const h = harness(t)
  const options = h.sqlite.prepare('SELECT * FROM bouquet_options WHERE active=1').all()
  const pick = (type) => options.find((o) => o.option_type === type)
  const body = { items: [{ kind: 'custom', quantity: 2, message: 'Một ngày thật dịu dàng', selections: {
    style: pick('style').option_code, palette: pick('palette').option_code, size: pick('size').option_code,
    wrapping: pick('wrapping').option_code, flowers: [pick('flower').option_code],
  } }] }
  const result = await created(await h.send(body))
  assert.equal(result.referenceTotal, (pick('size').base_price_vnd + pick('wrapping').price_delta_vnd + pick('flower').price_delta_vnd) * 2)
  assert.equal(h.sqlite.prepare('SELECT product_id FROM consultation_request_items').get().product_id, null)
  await h.flush()
  assert.match(h.calls[0].body.text, /Một ngày thật dịu dàng/u)
  h.sqlite.prepare("UPDATE bouquet_options SET active=0 WHERE option_type='size'").run()
  assert.equal((await h.send(body)).status, 409)
})

for (const scenario of ['partial', 'failed', 'missing']) {
  test(`Telegram ${scenario} preserves D1 and safe successful public reference`, async (t) => {
    const h = harness(t, { telegramFetch: async (url) => {
      if (scenario === 'failed' || url.endsWith('/sendPhoto')) throw new Error('Sensitive provider failure')
      return Response.json({ ok: true })
    } })
    if (scenario === 'missing') delete h.env.TELEGRAM_BOT_TOKEN
    const result = await created(await h.send())
    await h.flush()
    assert.equal(h.count('consultation_requests'), 1)
    assert.equal(h.sqlite.prepare('SELECT notification_status FROM consultation_requests').get().notification_status, scenario === 'missing' ? 'failed' : scenario)
    assert.doesNotMatch(JSON.stringify(result), /mock-bot-token|mock-owner-chat|notificationStatus|Sensitive/u)
  })
}

test('image album deduplicates quantity/images, caps at 10, mentions omissions and keeps all text', () => {
  const item = { name: 'Hoa', image: '/api/v1/media/one.jpg', quantity: 20, unitReferencePrice: 590000, lineReferenceTotal: 11800000, selections: { message: 'x'.repeat(200) } }
  const notification = consultationNotification({ referenceCode: 'HP-TEST123456', referenceTotal: 1, items: [item, item, ...Array.from({ length: 12 }, (_, i) => ({ ...item, image: `/api/v1/media/${i}.jpg` }))] }, origin)
  assert.equal(notification.images.length, 10)
  assert.equal(notification.images.filter((src) => src.endsWith('one.jpg')).length, 1)
  assert.match(notification.texts.join(''), /còn 3 ảnh khác/u)
  assert.ok(notification.texts.length > 1)
  assert.ok(notification.texts.every((text) => Array.from(text).length <= 3800))
})

test('public rate limit uses independent IP HMAC keys, 429/Retry-After and fail-closed; GET unaffected', async (t) => {
  const h = harness(t)
  h.env.CONSULTATION_RATE_LIMITING_ENABLED = 'true'
  const keys = []; let count = 0
  h.env.CONSULTATION_RATE_LIMITER = { limit: async ({ key }) => { keys.push(key); return { success: ++count <= 3 } } }
  for (let n = 0; n < 3; n++) assert.equal((await h.send()).status, 201)
  const denied = await h.send(payload(), crypto.randomUUID(), { 'X-User-Id': 'forged' })
  assert.equal(denied.status, 429); assert.equal(denied.headers.get('Retry-After'), '60')
  assert.equal((await denied.json()).error.code, 'RATE_LIMITED')
  assert.equal(new Set(keys).size, 1); assert.match(keys[0], /^[0-9a-f]{64}$/u)
  assert.equal((await h.fetch('/api/v1/catalogue')).status, 200)
  delete h.env.CONSULTATION_RATE_LIMITER
  const failure = await h.send()
  assert.equal(failure.status, 503); assert.equal((await failure.json()).error.code, 'RATE_LIMIT_UNAVAILABLE')
  assert.equal((await h.send(payload(), crypto.randomUUID(), { Origin: 'https://unrelated.example' })).status, 403)
  await h.flush()
})

test('Admin list/detail/transitions require verified D1 Admin; existing order tables untouched', async (t) => {
  const h = harness(t)
  await created(await h.send()); await h.flush()
  assert.equal((await h.fetch('/api/v1/admin/consultations')).status, 401)
  assert.equal((await h.fetch('/api/v1/admin/consultations', { headers: { Authorization: 'Bearer customer' } })).status, 403)
  await h.readyAdmin()
  const list = await h.admin(); assert.equal(list.status, 200)
  const [item] = (await list.json()).data.items
  const detail = await h.admin(`/${item.id}`); assert.equal(detail.status, 200)
  assert.equal((await detail.json()).data.consultation.items[0].name, 'Nắng Dịu')
  assert.equal((await h.admin(`/${item.id}/status`, { method: 'POST', body: JSON.stringify({ status: 'closed' }) })).status, 409)
  for (const status of ['contacted', 'closed']) {
    const response = await h.admin(`/${item.id}/status`, { method: 'POST', body: JSON.stringify({ status }) })
    assert.equal(response.status, 200); assert.equal((await response.json()).data.consultation.status, status)
  }
  assert.equal((await h.admin(`/${item.id}/status`, { method: 'POST', body: JSON.stringify({ status: 'new' }) })).status, 409)
  assert.equal(h.count('orders'), 0); assert.equal(h.count('order_items'), 0)
})

test('notification work extends Worker lifetime without blocking public response', async (t) => {
  let finish
  const h = harness(t, { telegramFetch: () => new Promise((resolve) => { finish = resolve }) })
  const response = await h.send({ items: [{ ...payload().items[0], productId: 'nang-diu' }] })
  assert.equal(response.status, 201); assert.equal(h.tasks.length, 1)
  assert.equal(h.sqlite.prepare('SELECT notification_status FROM consultation_requests').get().notification_status, 'pending')
  // Both Telegram calls are released without waiting for the HTTP response.
  finish(Response.json({ ok: true }))
  await new Promise((resolve) => setImmediate(resolve))
  finish(Response.json({ ok: true }))
  await h.flush()
})

test('client sends identifiers only, preserves attempt after retry/refresh and handles 429 safely', async () => {
  const cart = [{ productId: 'nang-diu', sizeId: 'standard', wrappingId: 'ivory-paper', quantity: 2, unitPrice: 1, name: 'forged', image: { src: 'forged' }, giftAddOns: [{ id: 'mini-scented-candle', price: 1 }] }]
  const input = buildConsultationPayload(cart)
  assert.equal(input.items[0].unitPrice, undefined); assert.equal(input.items[0].name, undefined)
  const store = new Map(); const storage = { getItem: (key) => store.get(key), setItem: (key, value) => store.set(key, value) }
  const key = await getConsultationAttempt(input, storage)
  assert.equal(await getConsultationAttempt(input, storage), key)
  assert.notEqual(await getConsultationAttempt({ items: [{ ...input.items[0], quantity: 3 }] }, storage), key)
  assert.doesNotMatch([...store.values()].join(''), /nang-diu|message|price/u)
  const original = structuredClone(cart)
  const result = await createConsultation(input, { idempotencyKey: key, fetchImpl: async () => Response.json({ error: { message: 'private provider error' } }, { status: 429 }) })
  assert.equal(result.ok, false); assert.match(result.error, /một phút/u); assert.doesNotMatch(result.error, /private/u)
  assert.deepEqual(cart, original)
})

test('consultation schema has no contact fields; environment namespaces/policies remain isolated', () => {
  const config = JSON.parse(fs.readFileSync('wrangler.jsonc', 'utf8'))
  const prod = config.ratelimits.find((item) => item.name === 'CONSULTATION_RATE_LIMITER')
  const staging = config.env.staging.ratelimits.find((item) => item.name === 'CONSULTATION_RATE_LIMITER')
  assert.deepEqual(prod.simple, { limit: 3, period: 60 }); assert.deepEqual(staging.simple, prod.simple)
  assert.notEqual(prod.namespace_id, staging.namespace_id)
  assert.equal(config.vars.API_V1_ENABLED, 'false'); assert.equal(config.env.staging.vars.RATE_LIMITING_ENABLED, 'false')
  assert.equal(config.ratelimits.find((item) => item.name === 'ORDER_RATE_LIMITER').simple.limit, 5)
  assert.equal(config.ratelimits.find((item) => item.name === 'CONCIERGE_RATE_LIMITER').simple.limit, 6)
  const repository = fs.readFileSync('src/server/repositories/consultationRepository.js', 'utf8')
  assert.doesNotMatch(repository, /INSERT INTO orders|INSERT INTO order_items|console\./u)
  assert.ok(createConsultationRepository && createCatalogueRepository)
})
