import assert from 'node:assert/strict'
import test from 'node:test'

import { createWorker } from '../src/worker.js'

const localOrigin = 'http://127.0.0.1:5173'
const testJwtKey = 'unit-test-public-key'
const validAuthorization = 'Bearer unit-test-valid'
const ownerSubject = 'user_unit_test_owner'
const silentLogger = { info() {} }

class FakeD1Statement {
  constructor(database, sql) {
    this.database = database
    this.sql = sql
    this.values = []
  }

  bind(...values) {
    this.values = values
    return this
  }

  first() {
    return this.database.first(this.sql, this.values)
  }

  run() {
    return this.database.run(this.sql, this.values)
  }
}

class FakeD1Database {
  constructor() {
    this.users = new Map()
  }

  prepare(sql) {
    return new FakeD1Statement(this, sql)
  }

  batch(statements) {
    return Promise.all(statements.map((statement) => statement.run()))
  }

  async run(sql, values) {
    if (!/INSERT INTO users/iu.test(sql)) throw new Error('Unexpected D1 mutation in auth test.')
    const [id, provider, subject, createdAtUtc, updatedAtUtc] = values
    const key = `${provider}:${subject}`
    const alreadyExists = this.users.has(key)
    if (!alreadyExists) {
      this.users.set(key, {
        created_at_utc: createdAtUtc,
        display_name: null,
        id,
        locale: 'vi-VN',
        role: 'customer',
        status: 'active',
        updated_at_utc: updatedAtUtc,
      })
    }
    return { meta: { changes: alreadyExists ? 0 : 1 }, success: true }
  }

  async first(sql, values) {
    if (!/FROM users/iu.test(sql)) throw new Error('Unexpected D1 query in auth test.')
    const [provider, subject] = values
    return this.users.get(`${provider}:${subject}`) ?? null
  }
}

function createAssetsBinding() {
  return {
    async fetch() {
      return new Response('Not found', { status: 404 })
    },
  }
}

function createEnv(database = new FakeD1Database()) {
  return {
    API_ALLOWED_ORIGINS: localOrigin,
    API_V1_ENABLED: 'true',
    ASSETS: createAssetsBinding(),
    CLERK_AUTHORIZED_PARTIES: localOrigin,
    CLERK_JWT_KEY: testJwtKey,
    DB: database,
  }
}

function createMeRequest(options = {}) {
  const headers = new Headers()
  if (options.authorization) headers.set('Authorization', options.authorization)
  return new Request(`${localOrigin}/api/v1/me${options.query ?? ''}`, { headers })
}

function createAdminRequest(options = {}) {
  const headers = new Headers()
  if (options.authorization) headers.set('Authorization', options.authorization)
  return new Request(`${localOrigin}/api/v1/admin/me${options.query ?? ''}`, {
    headers,
    method: options.method ?? 'GET',
  })
}

async function readJson(response) {
  return JSON.parse(await response.text())
}

async function mockClerkVerifier(token, options) {
  assert.equal(options.jwtKey, testJwtKey)
  assert.deepEqual(options.authorizedParties, [localOrigin])
  if (token !== 'unit-test-valid') throw new Error('Unverifiable test credential')
  return { azp: localOrigin, sub: ownerSubject }
}

function createAuthWorker() {
  return createWorker({ clerkTokenVerifier: mockClerkVerifier, logger: silentLogger })
}

test('GET /api/v1/me returns 401 when authentication is missing', async () => {
  const database = new FakeD1Database()
  const response = await createAuthWorker().fetch(createMeRequest(), createEnv(database))
  const body = await readJson(response)

  assert.equal(response.status, 401)
  assert.equal(body.error.code, 'AUTHENTICATION_REQUIRED')
  assert.equal(database.users.size, 0)
})

test('GET /api/v1/me returns 401 for an unverifiable Clerk token', async () => {
  const database = new FakeD1Database()
  const response = await createAuthWorker().fetch(createMeRequest({
    authorization: 'Bearer unit-test-invalid',
  }), createEnv(database))

  assert.equal(response.status, 401)
  assert.equal((await readJson(response)).error.code, 'AUTHENTICATION_REQUIRED')
  assert.equal(database.users.size, 0)
})

test('a verified Clerk subject maps to a safe current-user response', async () => {
  const response = await createAuthWorker().fetch(createMeRequest({
    authorization: validAuthorization,
  }), createEnv())
  const body = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(body.data.user.role, 'customer')
  assert.equal(body.data.user.locale, 'vi-VN')
  assert.equal(body.data.user.status, 'active')
  assert.match(body.data.user.id, /^usr_[a-f0-9]{32}$/u)
  assert.doesNotMatch(JSON.stringify(body), new RegExp(ownerSubject, 'u'))
})

test('the same verified Clerk subject maps to the same logical D1 user', async () => {
  const database = new FakeD1Database()
  const worker = createAuthWorker()
  const env = createEnv(database)

  const first = await readJson(await worker.fetch(createMeRequest({
    authorization: validAuthorization,
  }), env))
  const second = await readJson(await worker.fetch(createMeRequest({
    authorization: validAuthorization,
  }), env))

  assert.equal(first.data.user.id, second.data.user.id)
})

test('caller-supplied ownership identifiers cannot override the verified subject', async () => {
  const response = await createAuthWorker().fetch(createMeRequest({
    authorization: validAuthorization,
    query: '?userId=usr_forged&profileId=profile_forged&role=admin',
  }), createEnv())
  const body = await readJson(response)

  assert.equal(response.status, 200)
  assert.notEqual(body.data.user.id, 'usr_forged')
  assert.equal(body.data.user.role, 'customer')
})

test('repeated verified requests do not create duplicate D1 users', async () => {
  const database = new FakeD1Database()
  const worker = createAuthWorker()
  const env = createEnv(database)

  for (let requestIndex = 0; requestIndex < 4; requestIndex += 1) {
    const response = await worker.fetch(createMeRequest({
      authorization: validAuthorization,
    }), env)
    assert.equal(response.status, 200)
  }

  assert.equal(database.users.size, 1)
})

test('GET /api/v1/admin/me returns 401 when authentication is missing', async () => {
  const database = new FakeD1Database()
  const response = await createAuthWorker().fetch(createAdminRequest(), createEnv(database))
  const body = await readJson(response)

  assert.equal(response.status, 401)
  assert.equal(body.error.code, 'AUTHENTICATION_REQUIRED')
  assert.equal(database.users.size, 0)
})

test('GET /api/v1/admin/me returns 401 for an unverifiable Clerk token', async () => {
  const database = new FakeD1Database()
  const response = await createAuthWorker().fetch(createAdminRequest({
    authorization: 'Bearer unit-test-invalid',
  }), createEnv(database))
  const body = await readJson(response)

  assert.equal(response.status, 401)
  assert.equal(body.error.code, 'AUTHENTICATION_REQUIRED')
  assert.equal(database.users.size, 0)
})

test('GET /api/v1/admin/me returns 403 for a valid authenticated customer', async () => {
  const database = new FakeD1Database()
  const response = await createAuthWorker().fetch(createAdminRequest({
    authorization: validAuthorization,
  }), createEnv(database))
  const body = await readJson(response)

  assert.equal(response.status, 403)
  assert.equal(body.error.code, 'FORBIDDEN')
  assert.equal(body.error.message, 'Bạn không có quyền truy cập tài nguyên này.')
})

test('GET /api/v1/admin/me returns 200 for a valid authenticated admin', async () => {
  const database = new FakeD1Database()
  const timestamp = new Date().toISOString()
  database.users.set(`clerk:${ownerSubject}`, {
    created_at_utc: timestamp,
    display_name: 'Quản trị viên',
    id: 'usr_admin_test_123',
    locale: 'vi-VN',
    role: 'admin',
    status: 'active',
    updated_at_utc: timestamp,
  })

  const response = await createAuthWorker().fetch(createAdminRequest({
    authorization: validAuthorization,
  }), createEnv(database))
  const body = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(body.data.authorized, true)
  assert.equal(body.data.user.id, 'usr_admin_test_123')
  assert.equal(body.data.user.role, 'admin')
  assert.equal(body.data.user.status, 'active')
  assert.doesNotMatch(JSON.stringify(body), new RegExp(ownerSubject, 'u'))
})

test('GET /api/v1/admin/me rejects caller-supplied role=admin in query or headers', async () => {
  const database = new FakeD1Database()
  const response = await createAuthWorker().fetch(createAdminRequest({
    authorization: validAuthorization,
    query: '?role=admin',
  }), createEnv(database))
  const body = await readJson(response)

  assert.equal(response.status, 403)
  assert.equal(body.error.code, 'FORBIDDEN')
})

test('GET /api/v1/admin/me rejects caller-supplied userId in query or headers', async () => {
  const database = new FakeD1Database()
  const response = await createAuthWorker().fetch(createAdminRequest({
    authorization: validAuthorization,
    query: '?userId=usr_admin_test_123&profileId=admin_profile',
  }), createEnv(database))
  const body = await readJson(response)

  assert.equal(response.status, 403)
  assert.equal(body.error.code, 'FORBIDDEN')
})

test('D1 role is the authorization source of truth', async () => {
  const database = new FakeD1Database()
  const worker = createAuthWorker()
  const env = createEnv(database)

  // 1. Initial request as customer -> 403
  const customerRes = await worker.fetch(createAdminRequest({
    authorization: validAuthorization,
  }), env)
  assert.equal(customerRes.status, 403)
  const customerBody = await readJson(customerRes)
  assert.equal(customerBody.error.code, 'FORBIDDEN')

  // 2. Promote role to admin in D1
  const user = database.users.get(`clerk:${ownerSubject}`)
  assert.equal(user.role, 'customer')
  user.role = 'admin'

  // 3. Same Clerk identity request -> 200
  const adminRes = await worker.fetch(createAdminRequest({
    authorization: validAuthorization,
  }), env)
  assert.equal(adminRes.status, 200)
  const adminBody = await readJson(adminRes)
  assert.equal(adminBody.data.authorized, true)
  assert.equal(adminBody.data.user.role, 'admin')

  // 4. Demote role back to customer in D1 -> 403
  user.role = 'customer'
  const demotedRes = await worker.fetch(createAdminRequest({
    authorization: validAuthorization,
  }), env)
  assert.equal(demotedRes.status, 403)
  const demotedBody = await readJson(demotedRes)
  assert.equal(demotedBody.error.code, 'FORBIDDEN')
})

test('GET /api/v1/admin/me returns 403 ACCOUNT_UNAVAILABLE for an inactive admin user', async () => {
  const database = new FakeD1Database()
  const timestamp = new Date().toISOString()
  database.users.set(`clerk:${ownerSubject}`, {
    created_at_utc: timestamp,
    display_name: 'Quản trị viên',
    id: 'usr_admin_disabled',
    locale: 'vi-VN',
    role: 'admin',
    status: 'disabled',
    updated_at_utc: timestamp,
  })

  const response = await createAuthWorker().fetch(createAdminRequest({
    authorization: validAuthorization,
  }), createEnv(database))
  const body = await readJson(response)

  assert.equal(response.status, 403)
  assert.equal(body.error.code, 'ACCOUNT_UNAVAILABLE')
})

test('POST /api/v1/admin/me returns 405 METHOD_NOT_ALLOWED', async () => {
  const database = new FakeD1Database()
  const response = await createAuthWorker().fetch(createAdminRequest({
    authorization: validAuthorization,
    method: 'POST',
  }), createEnv(database))
  const body = await readJson(response)

  assert.equal(response.status, 405)
  assert.equal(body.error.code, 'METHOD_NOT_ALLOWED')
  assert.equal(response.headers.get('Allow'), 'GET')
})
