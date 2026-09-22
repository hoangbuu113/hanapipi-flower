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
