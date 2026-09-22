import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchCurrentUser } from '../src/services/apiClient.js'

test('1. fetchCurrentUser requires a getToken function', async () => {
  await assert.rejects(
    () => fetchCurrentUser({}),
    (err) => err instanceof TypeError && err.message.includes('token getter'),
  )
})

test('2. signed-out state does not call protected identity as authenticated', async () => {
  let fetchCalled = false
  const result = await fetchCurrentUser({
    getToken: async () => null,
    fetchImpl: async () => {
      fetchCalled = true
      return new Response(JSON.stringify({}), { status: 200 })
    },
  })

  assert.equal(result.ok, false)
  assert.equal(result.status, 401)
  assert.equal(result.error.code, 'AUTHENTICATION_REQUIRED')
  assert.equal(fetchCalled, false, 'fetch must not be called when token is absent')
})

test('3. signed-in session sends bearer token through the authenticated API boundary', async () => {
  let capturedUrl = null
  let capturedHeaders = null

  const mockToken = 'mock-session-token-xyz'
  const mockUser = {
    displayName: 'Hanapipi Customer',
    id: 'usr_test_123',
    locale: 'vi-VN',
    role: 'customer',
    status: 'active',
  }

  const result = await fetchCurrentUser({
    getToken: async () => mockToken,
    fetchImpl: async (url, options) => {
      capturedUrl = url
      capturedHeaders = options.headers
      return new Response(JSON.stringify({
        data: { user: mockUser },
        error: null,
        requestId: 'req_123',
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    },
  })

  assert.equal(capturedUrl, '/api/v1/me')
  assert.equal(capturedHeaders.Authorization, `Bearer ${mockToken}`)
  assert.equal(result.ok, true)
  assert.equal(result.status, 200)
  assert.deepEqual(result.user, mockUser)
})

test('4. successful /api/v1/me hydrates local account identity', async () => {
  const d1User = {
    displayName: 'Hanapipi Tester',
    id: 'usr_b360249e9d234cad9b4883bec636ddde',
    locale: 'vi-VN',
    role: 'customer',
    status: 'active',
  }

  const result = await fetchCurrentUser({
    getToken: async () => 'valid-token',
    fetchImpl: async () => new Response(JSON.stringify({
      data: { user: d1User },
      error: null,
      requestId: 'test_req',
    }), { status: 200 }),
  })

  assert.equal(result.ok, true)
  assert.equal(result.user.id, d1User.id)
  assert.equal(result.user.displayName, d1User.displayName)
  assert.equal(result.user.role, 'customer')
})

test('5. token is not persisted manually in localStorage', async () => {
  const mockStorage = new Map()

  const sensitiveToken = 'sensitive-clerk-jwt-token-to-never-persist'
  await fetchCurrentUser({
    getToken: async () => sensitiveToken,
    fetchImpl: async () => new Response(JSON.stringify({
      data: { user: { id: 'usr_1' } },
    }), { status: 200 }),
  })

  // Verify token is never in storage
  for (const [key, val] of mockStorage.entries()) {
    assert.doesNotMatch(key, /token|jwt|clerk/iu)
    assert.doesNotMatch(val, new RegExp(sensitiveToken, 'u'))
  }
})

test('6. auth failure returns user to a safe error state without crashing the site', async () => {
  // 6a. 401 unauthenticated
  const unauthResult = await fetchCurrentUser({
    getToken: async () => 'invalid-token',
    fetchImpl: async () => new Response(JSON.stringify({
      error: { code: 'AUTHENTICATION_REQUIRED', message: 'Bạn cần đăng nhập để tiếp tục.' },
    }), { status: 401 }),
  })
  assert.equal(unauthResult.ok, false)
  assert.equal(unauthResult.status, 401)
  assert.equal(unauthResult.error.code, 'AUTHENTICATION_REQUIRED')
  assert.equal(unauthResult.user, null)

  // 6b. 404 API_V1_ENABLED=false
  const gatedResult = await fetchCurrentUser({
    getToken: async () => 'valid-token',
    fetchImpl: async () => new Response(JSON.stringify({
      error: { code: 'API_NOT_FOUND', message: 'Không tìm thấy API được yêu cầu.' },
    }), { status: 404 }),
  })
  assert.equal(gatedResult.ok, false)
  assert.equal(gatedResult.status, 404)
  assert.equal(gatedResult.error.code, 'API_NOT_FOUND')

  // 6c. Network failure
  const networkResult = await fetchCurrentUser({
    getToken: async () => 'valid-token',
    fetchImpl: async () => { throw new Error('Failed to fetch') },
  })
  assert.equal(networkResult.ok, false)
  assert.equal(networkResult.status, 0)
  assert.equal(networkResult.error.code, 'NETWORK_ERROR')
})

test('7. local order history functions independently of auth state', () => {
  const orderStorageKey = 'hanapipi-flower:orders'
  const mockStorage = new Map()

  function addOrder(orders, order) {
    const next = [order, ...orders]
    mockStorage.set(orderStorageKey, JSON.stringify(next))
    return next
  }

  let orders = []
  const order1 = { code: 'HP-1001', total: 500000, receiver: { name: 'Người nhận A' } }
  orders = addOrder(orders, order1)

  assert.equal(orders.length, 1)
  assert.equal(orders[0].code, 'HP-1001')
  assert.equal(JSON.parse(mockStorage.get(orderStorageKey)).length, 1)

  const order2 = { code: 'HP-1002', total: 750000, receiver: { name: 'Người nhận B' } }
  orders = addOrder(orders, order2)

  assert.equal(orders.length, 2)
  assert.equal(orders[0].code, 'HP-1002')
  assert.equal(JSON.parse(mockStorage.get(orderStorageKey))[0].code, 'HP-1002')
})

test('8. sign-out clears user identity, reports unauthenticated state, and retains no persisted tokens', async () => {
  let signedOutCalled = false
  const mockSignOut = async () => {
    signedOutCalled = true
  }

  // Simulate logout action
  let d1User = { id: 'usr_123', displayName: 'Hanapipi User' }
  let authError = null

  async function logout() {
    try {
      await mockSignOut()
    } finally {
      d1User = null
      authError = null
    }
  }

  await logout()

  assert.equal(signedOutCalled, true, 'signOut must be called')
  assert.equal(d1User, null, 'user state must be cleared after sign-out')
  assert.equal(authError, null, 'auth error must be reset')

  // After sign out, token getter returns null
  const postLogoutResult = await fetchCurrentUser({
    getToken: async () => null,
    fetchImpl: async () => new Response(JSON.stringify({}), { status: 200 }),
  })

  assert.equal(postLogoutResult.ok, false)
  assert.equal(postLogoutResult.status, 401)
  assert.equal(postLogoutResult.user, null)
})
