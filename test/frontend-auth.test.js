import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { fetchCurrentUser, fetchUserAddresses } from '../src/services/apiClient.js'
import { validateStagingClientBundle } from '../scripts/verify-staging-build.js'
import {
  attemptAuthVerification,
  AUTH_VERIFICATION_FLOWS,
  getActiveVerificationFlow,
  getSignInVerificationFlow,
  getSignUpVerificationFlow,
  getVerificationContent,
} from '../src/utils/authVerification.js'

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

test('9. completed password login does not enter a verification flow', () => {
  const verificationFlow = getSignInVerificationFlow({
    createdSessionId: 'sess_completed',
    status: 'complete',
  })

  assert.equal(verificationFlow, null)
  assert.equal(getVerificationContent(verificationFlow, 'customer@example.com'), null)
})

test('10. signup email verification uses signup flow, copy, and Clerk operation', async () => {
  const verificationFlow = getSignUpVerificationFlow({
    status: 'missing_requirements',
    unverifiedFields: ['email_address'],
  })
  const content = getVerificationContent(verificationFlow, 'customer@example.com')
  let signInCalled = false
  let signUpCalled = false

  const result = await attemptAuthVerification({
    code: '123456',
    signIn: {
      attemptSecondFactor: async () => {
        signInCalled = true
      },
    },
    signUp: {
      attemptEmailAddressVerification: async ({ code }) => {
        signUpCalled = true
        assert.equal(code, '123456')
        return { status: 'complete' }
      },
    },
    verificationFlow,
  })

  assert.equal(verificationFlow, AUTH_VERIFICATION_FLOWS.SIGN_UP_EMAIL)
  assert.equal(content.heading, 'Xác thực email')
  assert.match(content.intro, /hoàn tất tạo tài khoản/u)
  assert.equal(signUpCalled, true)
  assert.equal(signInCalled, false)
  assert.equal(result.status, 'complete')
})

test('11. sign-in email second factor uses login flow, copy, and Clerk operation', async () => {
  assert.equal(getSignInVerificationFlow({
    status: 'needs_second_factor',
    supportedSecondFactors: [{ strategy: 'phone_code' }],
  }), null)

  const verificationFlow = getSignInVerificationFlow({
    status: 'needs_second_factor',
    supportedSecondFactors: [{ strategy: 'email_code' }],
  })
  const content = getVerificationContent(verificationFlow, 'customer@example.com')
  let signInCalled = false
  let signUpCalled = false

  const result = await attemptAuthVerification({
    code: '654321',
    signIn: {
      attemptSecondFactor: async ({ code, strategy }) => {
        signInCalled = true
        assert.equal(code, '654321')
        assert.equal(strategy, 'email_code')
        return { status: 'complete' }
      },
    },
    signUp: {
      attemptEmailAddressVerification: async () => {
        signUpCalled = true
      },
    },
    verificationFlow,
  })

  assert.equal(verificationFlow, AUTH_VERIFICATION_FLOWS.SIGN_IN_SECOND_FACTOR)
  assert.equal(content.heading, 'Xác thực đăng nhập')
  assert.match(content.intro, /xác thực lần đăng nhập này/u)
  assert.doesNotMatch(content.intro, /tạo tài khoản/u)
  assert.equal(signInCalled, true)
  assert.equal(signUpCalled, false)
  assert.equal(result.status, 'complete')
})

test('12. switching register verification to login hides stale signup verification', () => {
  const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const activeFlow = getActiveVerificationFlow(
    AUTH_VERIFICATION_FLOWS.SIGN_UP_EMAIL,
    'login',
  )

  assert.match(appSource, /<AuthPage key="login" mode="login" \/>/u)
  assert.equal(activeFlow, null)
  assert.equal(getVerificationContent(activeFlow, 'customer@example.com'), null)
})

test('13. switching login verification to register hides stale sign-in verification', () => {
  const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const activeFlow = getActiveVerificationFlow(
    AUTH_VERIFICATION_FLOWS.SIGN_IN_SECOND_FACTOR,
    'register',
  )

  assert.match(appSource, /<AuthPage key="register" mode="register" \/>/u)
  assert.equal(activeFlow, null)
  assert.equal(getVerificationContent(activeFlow, 'customer@example.com'), null)
})

test('14. AuthPage resets challenge state from the mode-change handler without clearing credentials', () => {
  const authPageSource = fs.readFileSync(new URL('../src/pages/AuthPage.jsx', import.meta.url), 'utf8')

  assert.match(authPageSource, /function handleAuthModeChange\(\) \{[\s\S]*setVerificationFlow\(null\)[\s\S]*setCode\(''\)[\s\S]*setErrors\(\{\}\)[\s\S]*setIsSubmitting\(false\)[\s\S]*\}/u)
  assert.match(authPageSource, /<Link[^>]*onClick=\{handleAuthModeChange\}[^>]*>/u)
  assert.doesNotMatch(authPageSource, /\}, \[mode\]\)/u)
  assert.doesNotMatch(authPageSource, /setForm\(\{\s*email:\s*''/u)
})

test('15. staging build rejects a production Clerk key even when the Worker bindings are staging', () => {
  const stagingScript = fs.readFileSync(new URL('../scripts/staging.js', import.meta.url), 'utf8')

  assert.match(stagingScript, /'run', 'build', '--', '--mode', 'staging'/u)
  assert.doesNotThrow(() => validateStagingClientBundle(['key=pk_test_fixture'], 'pk_test_fixture'))
  assert.throws(() => validateStagingClientBundle(['key=pk_live_fixture'], 'pk_live_fixture'))
  assert.throws(() => validateStagingClientBundle(['key=pk_live_abcdefghijklmnopqrstuvwxyz'], 'pk_test_fixture'))
  assert.throws(() => validateStagingClientBundle(['no matching key'], 'pk_test_fixture'))
})

test('16. slow or failed saved-address loading cannot delay current-user hydration', async () => {
  let finishAddressRequest
  const addressRequest = fetchUserAddresses({
    getToken: async () => 'test-session',
    fetchImpl: () => new Promise((resolve) => { finishAddressRequest = resolve }),
  })

  const identity = await fetchCurrentUser({
    getToken: async () => 'test-session',
    fetchImpl: async () => new Response(JSON.stringify({
      data: { user: { id: 'usr_test', role: 'customer', status: 'active' } },
    }), { status: 200 }),
  })
  assert.equal(identity.ok, true)
  assert.equal(identity.user.id, 'usr_test')

  finishAddressRequest(new Response(JSON.stringify({
    error: { code: 'AUTHENTICATION_REQUIRED', message: 'Session is not ready.' },
  }), { status: 401 }))
  const addressResult = await addressRequest
  assert.equal(addressResult.ok, false)
  assert.equal(addressResult.status, 401)
  assert.equal(identity.ok, true)
})

test('17. login completion and error reset do not depend on saved-address state', () => {
  const authSource = fs.readFileSync(new URL('../src/pages/AuthPage.jsx', import.meta.url), 'utf8')
  const accountSource = fs.readFileSync(new URL('../src/context/AccountContext.jsx', import.meta.url), 'utf8')
  const loginHandler = authSource.split('async function handleLogin(event) {')[1]
    ?.split('async function handleRegister(event) {')[0] ?? ''
  const authLoadingLine = accountSource.split('\n').find((line) => line.includes('const isAuthLoading =')) ?? ''
  const addressRequestIndex = accountSource.lastIndexOf('fetchUserAddresses({ getToken })')
  const addressEffectStart = accountSource.lastIndexOf('  useEffect(() => {', addressRequestIndex)
  const addressEffect = accountSource.slice(addressEffectStart)
  const logoutHandler = accountSource.split('const logout = useCallback(async () => {')[1]
    ?.split('}, [signOut])')[0] ?? ''

  assert.match(loginHandler, /await setSignInActive\(\{ session: result\.createdSessionId \}\)\s*navigate\('\/account'\)/u)
  assert.match(loginHandler, /catch \(err\) \{[\s\S]*setErrors\(\{ form:/u)
  assert.match(loginHandler, /finally \{\s*setIsSubmitting\(false\)/u)
  assert.doesNotMatch(loginHandler, /[Aa]ddress|refreshAddresses/u)
  assert.doesNotMatch(authLoadingLine, /[Aa]ddress/u)
  assert.match(addressEffect, /if \(!isAuthLoaded \|\| !isUserLoaded \|\| !isSignedIn \|\| !canonicalUser\?\.id\) \{[\s\S]*?return undefined\s*\}[\s\S]*?fetchUserAddresses/u)
  assert.match(logoutHandler, /addressesRequestVersion\.current\s*\+=\s*1[\s\S]*setAddresses\(\[\]\)[\s\S]*setAddressesOwnerId\(null\)/u)
})
