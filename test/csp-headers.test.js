import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { createWorker } from '../src/worker.js'
import { createReportOnlyPolicy, getClerkFrontendOrigin } from '../src/server/csp.js'
import { MemoryMediaBucket } from '../src/server/mediaStorage.js'
import { imageFixture } from './fixtures/images.js'

const origin = 'https://hanapipi-flower.hutstudio.workers.dev'
const clerkOrigin = 'https://guided-mammal-8915.clerk.accounts.dev'
const publicTestKey = `pk_test_${btoa(new URL(clerkOrigin).hostname + '$')}`
const silentLogger = { info() {} }
const env = {
  API_V1_ENABLED: 'true',
  ASSETS: { async fetch(request) {
    const path = new URL(request.url).pathname
    const types = { '/index.html': 'text/html; charset=utf-8', '/assets/site.js': 'text/javascript', '/assets/site.css': 'text/css' }
    return new Response(path === '/index.html' ? '<html lang="vi">Hanapipi Flower</html>' : 'original asset', {
      status: types[path] ? 200 : 404,
      headers: { 'Content-Type': types[path] ?? 'text/plain', 'Cache-Control': 'public, max-age=60', ETag: 'original-etag' },
    })
  } },
}

function policyDirectives(policy) {
  return Object.fromEntries(policy.split('; ').map(directive => {
    const [name, ...sources] = directive.split(' ')
    return [name, sources]
  }))
}

test('HTML, SPA routes and JS/CSS receive report-only and retain existing security/cache headers', async () => {
  const worker = createWorker({ logger: silentLogger })
  for (const path of ['/index.html', '/shop', '/assets/site.js', '/assets/site.css']) {
    const response = await worker.fetch(new Request(origin + path), env)
    assert.equal(response.status, 200)
    assert.ok(response.headers.get('Content-Security-Policy-Report-Only'))
    assert.equal(response.headers.get('Content-Security-Policy'), null)
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff')
    assert.equal(response.headers.get('X-Frame-Options'), 'DENY')
    assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer')
    assert.equal(response.headers.get('Permissions-Policy'), 'camera=(), microphone=(), geolocation=(), payment=(), usb=()')
    assert.equal(response.headers.get('Strict-Transport-Security'), 'max-age=31536000; includeSubDomains')
    assert.equal(response.headers.get('Cache-Control'), 'public, max-age=60')
    assert.equal(response.headers.get('ETag'), 'original-etag')
    assert.match(await response.text(), /Hanapipi Flower|original asset/u)
  }
})

test('policy is restrictive, includes exact configured Clerk/media/font/connect sources and no wildcard/eval', () => {
  const directives = policyDirectives(createReportOnlyPolicy(publicTestKey))
  for (const name of ['default-src', 'base-uri', 'form-action']) assert.deepEqual(directives[name], ["'self'"])
  for (const name of ['object-src', 'frame-ancestors']) assert.deepEqual(directives[name], ["'none'"])
  for (const name of ['script-src', 'connect-src', 'frame-src']) assert.ok(directives[name].includes(clerkOrigin))
  assert.ok(directives['script-src'].includes('https://challenges.cloudflare.com'))
  assert.ok(directives['frame-src'].includes('https://challenges.cloudflare.com'))
  assert.ok(directives['img-src'].includes('https://img.clerk.com'))
  assert.ok(directives['img-src'].includes('blob:'))
  assert.deepEqual(directives['media-src'], ["'self'"])
  assert.ok(directives['style-src'].includes('https://fonts.googleapis.com'))
  assert.ok(directives['font-src'].includes('https://fonts.gstatic.com'))
  assert.ok(directives['connect-src'].includes('https://clerk-telemetry.com'))
  assert.deepEqual(directives['worker-src'], ["'self'", 'blob:'])
  assert.ok(directives['style-src'].includes("'unsafe-inline'"))
  assert.ok(!directives['script-src'].includes("'unsafe-inline'"))
  const policy = createReportOnlyPolicy(publicTestKey)
  assert.doesNotMatch(policy, /\*|unsafe-eval|api\.groq\.com|instagram\.com|(?:^| )https:(?: |;|$)/u)
})

test('Clerk instance is derived from public build key only and malformed values cannot inject sources', () => {
  assert.equal(getClerkFrontendOrigin(publicTestKey), clerkOrigin)
  assert.equal(getClerkFrontendOrigin(`pk_live_${btoa('clerk.example.com$')}`), 'https://clerk.example.com')
  for (const input of [null, '', 'secret-value', `pk_test_${btoa('evil.example; script-src *$')}`, `pk_test_${btoa('good.example/path$')}`, 'pk_test_!']) {
    assert.equal(getClerkFrontendOrigin(input), null)
    assert.doesNotMatch(createReportOnlyPolicy(input), /evil|secret-value|script-src \*/u)
  }
  const config = JSON.parse(fs.readFileSync('wrangler.jsonc', 'utf8'))
  assert.equal(config.assets.run_worker_first, true, 'Static requests must not bypass Worker headers')
  assert.equal(config.vars.API_V1_ENABLED, 'false')
})

test('API envelopes, binary media and local HSTS behavior are unchanged', async () => {
  const bucket = new MemoryMediaBucket()
  const bytes = imageFixture('image/png')
  await bucket.put('test-image.png', bytes, { httpMetadata: { contentType: 'image/png' } })
  const worker = createWorker({ logger: silentLogger })
  const health = await worker.fetch(new Request(origin + '/api/v1/health'), env)
  assert.equal(health.status, 200)
  assert.deepEqual((await health.json()).data, { status: 'ok', version: 'v1' })
  assert.equal(health.headers.get('Content-Security-Policy-Report-Only'), null)
  const media = await worker.fetch(new Request(origin + '/api/v1/media/test-image.png'), { ...env, MEDIA_BUCKET: bucket })
  assert.equal(media.status, 200)
  assert.equal(media.headers.get('Content-Type'), 'image/png')
  assert.equal(media.headers.get('X-Content-Type-Options'), 'nosniff')
  assert.equal(media.headers.get('Content-Security-Policy-Report-Only'), null)
  assert.deepEqual(new Uint8Array(await media.arrayBuffer()), bytes)
  const local = await worker.fetch(new Request('http://127.0.0.1:5173/index.html'), env)
  assert.equal(local.headers.get('Strict-Transport-Security'), null)
})
