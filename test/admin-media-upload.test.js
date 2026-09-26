import assert from 'node:assert/strict'
import fs from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { LocalD1Database } from '../scripts/d1/local-d1.js'
import { createWorker } from '../src/worker.js'
import { uploadAdminMedia } from '../src/services/adminClient.js'
import { detectImageType, MAX_MEDIA_SIZE_BYTES, MemoryMediaBucket } from '../src/server/mediaStorage.js'
import { imageFixture } from './fixtures/images.js'

const origin = 'http://127.0.0.1:5173'
const types = ['image/jpeg', 'image/png', 'image/webp']

function harness(t) {
  const sqlite = new DatabaseSync(':memory:')
  t.after(() => sqlite.close())
  for (const name of fs.readdirSync('drizzle').filter((name) => /^\d+_.+\.sql$/u.test(name)).sort()) {
    sqlite.exec(fs.readFileSync(`drizzle/${name}`, 'utf8'))
  }
  const timestamp = new Date().toISOString()
  for (const role of ['admin', 'customer']) {
    sqlite.prepare(`INSERT INTO users (id, auth_provider, provider_subject, role, status, locale, created_at_utc, updated_at_utc)
      VALUES (?, 'clerk', ?, ?, 'active', 'vi-VN', ?, ?)`)
      .run(`d1-${role}`, `clerk-${role}`, role, timestamp, timestamp)
  }
  const bucket = new MemoryMediaBucket()
  let writes = 0
  const put = bucket.put.bind(bucket)
  bucket.put = (...args) => { writes += 1; return put(...args) }
  const worker = createWorker({
    logger: { info() {} },
    clerkTokenVerifier: async (token) => {
      if (!['test-admin', 'test-customer'].includes(token)) throw new Error('Invalid test identity')
      return { sub: `clerk-${token.slice(5)}`, azp: origin }
    },
  })
  const env = {
    API_V1_ENABLED: 'true', API_ALLOWED_ORIGINS: origin,
    CLERK_JWT_KEY: 'test-public-verification-key', CLERK_AUTHORIZED_PARTIES: origin,
    DB: new LocalD1Database(sqlite), MEDIA_BUCKET: bucket,
  }
  const fetchImpl = (url, opts = {}) => {
    const headers = new Headers(opts.headers)
    if (opts.method === 'POST' || opts.method === 'DELETE') headers.set('Origin', origin)
    return worker.fetch(new Request(new URL(url, origin), { ...opts, headers }), env)
  }
  const upload = (bytes, mime = 'image/jpeg', { token = 'test-admin', headers = {}, ...rest } = {}) => fetchImpl('/api/v1/admin/media', {
    method: 'POST', body: bytes,
    headers: { 'Content-Type': mime, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, ...rest,
  })
  const refs = () => JSON.stringify(sqlite.prepare('SELECT id, media_json FROM products ORDER BY id').all())
  return { bucket, fetchImpl, refs, upload, writes: () => writes }
}

for (const type of types) {
  test(`A/B/C/O. real ${type} accepted raw/multipart and served with detected MIME + nosniff`, async (t) => {
    const h = harness(t)
    const bytes = imageFixture(type)
    assert.equal(detectImageType(bytes), type)
    const before = h.refs()
    const raw = await h.upload(bytes, type.toUpperCase() + '; test=1')
    assert.equal(raw.status, 201)
    const rawData = (await raw.json()).data
    const form = await uploadAdminMedia(new File([bytes], 'irrelevant-name.exe', { type }), {
      fetchImpl: h.fetchImpl, getToken: async () => 'test-admin',
    })
    assert.equal(form.ok, true)
    assert.notEqual(rawData.key, form.data.key)
    for (const data of [rawData, form.data]) {
      assert.match(data.key, /^prod_media_[0-9a-f]{32}\.(jpg|png|webp)$/u)
      assert.equal(data.contentType, type)
      assert.equal(data.size, bytes.byteLength)
      assert.equal((await h.bucket.get(data.key)).httpMetadata.contentType, type)
      const media = await h.fetchImpl(data.url)
      assert.equal(media.status, 200)
      assert.equal(media.headers.get('Content-Type'), type)
      assert.equal(media.headers.get('X-Content-Type-Options'), 'nosniff')
      assert.deepEqual(new Uint8Array(await media.arrayBuffer()), bytes)
    }
    assert.equal(h.refs(), before, 'Upload does not create a D1 product reference')
    assert.equal(h.writes(), 2)
  })
}

const text = new TextEncoder()
const invalid = [
  ['D. text disguised as JPEG', text.encode('this is not a jpeg'), 'image/jpeg', 'INVALID_MEDIA_FILE'],
  ['E. HTML/script disguised as PNG', text.encode('<html><script>alert(1)</script></html>'), 'image/png', 'INVALID_MEDIA_FILE'],
  ['F. JPEG claiming PNG', imageFixture('image/jpeg'), 'image/png', 'INVALID_MEDIA_FILE'],
  ['G. PNG claiming JPEG', imageFixture('image/png'), 'image/jpeg', 'INVALID_MEDIA_FILE'],
  ['WebP claiming JPEG', imageFixture('image/webp'), 'image/jpeg', 'INVALID_MEDIA_FILE'],
  ['I. empty file', new Uint8Array(), 'image/jpeg', 'EMPTY_FILE'],
  ['K. SVG MIME', text.encode('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml', 'INVALID_MEDIA_TYPE'],
  ['L. SVG falsely claiming PNG', text.encode('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/png', 'INVALID_MEDIA_FILE'],
]
for (const type of types) {
  for (const length of [1, 3, 8, 12, imageFixture(type).length - 1]) {
    invalid.push([`H. truncated ${type} at ${length} bytes`, imageFixture(type).slice(0, length), type, 'INVALID_MEDIA_FILE'])
  }
}
for (const [name, bytes, mime, code] of invalid) {
  test(`${name}: no R2 object/write or D1 reference`, async (t) => {
    const h = harness(t)
    const before = h.refs()
    const raw = await h.upload(bytes, mime)
    assert.equal(raw.status, 400)
    assert.equal((await raw.json()).error.code, code)
    const multipart = await uploadAdminMedia(new Blob([bytes], { type: mime }), {
      fetchImpl: h.fetchImpl, getToken: async () => 'test-admin',
    })
    assert.equal(multipart.status, 400)
    assert.equal(multipart.error.code, code)
    assert.equal(h.writes(), 0)
    assert.equal(h.bucket.objects.size, 0)
    assert.equal(h.refs(), before)
  })
}

test('H. inconsistent PNG chunk and WebP RIFF/chunk sizes are rejected safely', async (t) => {
  const h = harness(t)
  const png = imageFixture('image/png')
  new DataView(png.buffer).setUint32(8, 0xffffffff)
  const riff = imageFixture('image/webp')
  new DataView(riff.buffer).setUint32(4, riff.length, true)
  const chunk = imageFixture('image/webp')
  new DataView(chunk.buffer).setUint32(16, 0xffffffff, true)
  for (const [bytes, type] of [[png, 'image/png'], [riff, 'image/webp'], [chunk, 'image/webp']]) {
    const response = await h.upload(bytes, type)
    assert.equal(response.status, 400)
    assert.equal((await response.json()).error.code, 'INVALID_MEDIA_FILE')
  }
  assert.equal(h.writes(), 0)
})

test('J. oversized known Content-Length rejected before consuming raw or multipart body', async (t) => {
  const h = harness(t)
  for (const mime of ['image/jpeg', 'multipart/form-data; boundary=test-boundary']) {
    let reads = 0
    let cancelled = false
    const stream = new ReadableStream({ pull() { reads += 1 }, cancel() { cancelled = true } }, { highWaterMark: 0 })
    const response = await h.upload(stream, mime, { headers: { 'Content-Length': String(MAX_MEDIA_SIZE_BYTES + 1024 * 1024) }, duplex: 'half' })
    assert.equal(response.status, 400)
    assert.equal((await response.json()).error.code, 'FILE_TOO_LARGE')
    assert.equal(reads, 0)
    assert.equal(cancelled, true)
  }
  assert.equal(h.writes(), 0)
})

test('J. actual raw size enforced despite missing, understated or unusable Content-Length', async (t) => {
  const h = harness(t)
  const bytes = new Uint8Array(MAX_MEDIA_SIZE_BYTES + 1)
  for (const value of [undefined, '1', 'invalid-length']) {
    const response = await h.upload(bytes, 'image/png', { headers: value ? { 'Content-Length': value } : {} })
    assert.equal(response.status, 400)
    assert.equal((await response.json()).error.code, 'FILE_TOO_LARGE')
  }
  assert.equal(h.writes(), 0)
  assert.equal(h.bucket.objects.size, 0)
})

test('J. stream exceeding the bound is cancelled without consuming remaining chunks', async (t) => {
  const h = harness(t)
  let reads = 0
  let cancelled = false
  const stream = new ReadableStream({
    pull(controller) {
      reads += 1
      controller.enqueue(new Uint8Array(MAX_MEDIA_SIZE_BYTES / 2 + 1))
    },
    cancel() { cancelled = true },
  }, { highWaterMark: 0 })
  const response = await h.upload(stream, 'image/png', { duplex: 'half' })
  assert.equal(response.status, 400)
  assert.equal((await response.json()).error.code, 'FILE_TOO_LARGE')
  assert.equal(reads, 2)
  assert.equal(cancelled, true)
  assert.equal(h.writes(), 0)
})

test('J. multipart file over 10 MB rejected even within bounded envelope allowance', async (t) => {
  const h = harness(t)
  const before = h.refs()
  const result = await uploadAdminMedia(new Blob([new Uint8Array(MAX_MEDIA_SIZE_BYTES + 1)], { type: 'image/png' }), {
    fetchImpl: h.fetchImpl, getToken: async () => 'test-admin',
  })
  assert.equal(result.status, 400)
  assert.equal(result.error.code, 'FILE_TOO_LARGE')
  assert.equal(h.writes(), 0)
  assert.equal(h.refs(), before)
})

test('M/N. Guest and Customer upload rejected before reading or writing', async (t) => {
  const h = harness(t)
  for (const [token, status] of [[null, 401], ['test-customer', 403], ['forged-token', 401]]) {
    let reads = 0
    const stream = new ReadableStream({ pull() { reads += 1 } }, { highWaterMark: 0 })
    const response = await h.upload(stream, 'image/jpeg', { token, duplex: 'half' })
    assert.equal(response.status, status)
    assert.equal(reads, 0)
    await stream.cancel()
  }
  assert.equal(h.writes(), 0)
})

test('read failure returns a safe validation error and no storage side effects', async (t) => {
  const h = harness(t)
  const stream = new ReadableStream({ pull(controller) { controller.error(new Error('private transport detail')) } })
  const response = await h.upload(stream, 'image/jpeg', { duplex: 'half' })
  assert.equal(response.status, 400)
  const result = await response.json()
  assert.equal(result.error.code, 'INVALID_MEDIA_FILE')
  assert.equal(JSON.stringify(result).includes('private transport detail'), false)
  assert.equal(h.writes(), 0)
})

test('invalid replacement leaves existing media bytes and product references unchanged', async (t) => {
  const h = harness(t)
  const original = imageFixture('image/jpeg')
  const created = await h.upload(original)
  const { key } = (await created.json()).data
  const before = h.refs()
  const response = await h.upload(text.encode('<script>not an image</script>'), 'image/jpeg')
  assert.equal(response.status, 400)
  assert.equal(h.writes(), 1)
  assert.equal(h.bucket.objects.size, 1)
  assert.deepEqual((await h.bucket.get(key)).body, original)
  assert.equal(h.refs(), before)
})

test('existing multipart alias and safe malformed payload errors remain supported', async (t) => {
  const h = harness(t)
  const form = new FormData()
  form.append('image', new Blob([imageFixture('image/png')], { type: 'image/png' }))
  const accepted = await h.fetchImpl('/api/v1/admin/media', { body: form, method: 'POST', headers: { Authorization: 'Bearer test-admin' } })
  assert.equal(accepted.status, 201)
  const malformed = await h.upload(text.encode('invalid multipart'), 'multipart/form-data; boundary=missing')
  assert.equal(malformed.status, 400)
  assert.equal((await malformed.json()).error.code, 'INVALID_MULTIPART_PAYLOAD')
  const noFile = new FormData()
  noFile.append('file', 'not a file')
  const invalidFile = await h.fetchImpl('/api/v1/admin/media', { body: noFile, method: 'POST', headers: { Authorization: 'Bearer test-admin' } })
  assert.equal(invalidFile.status, 400)
  assert.equal((await invalidFile.json()).error.code, 'INVALID_PAYLOAD')
})
