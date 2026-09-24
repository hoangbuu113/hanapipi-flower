import assert from 'node:assert/strict'
import test from 'node:test'
import { getAuthenticatedAddressOwner, getVisibleSavedAddresses } from '../src/utils/accountAddressLifecycle.js'
import { getCheckoutSavedAddressFields } from '../src/utils/savedAddress.js'
import { fetchUserAddresses } from '../src/services/apiClient.js'

const ready = { isAuthLoaded: true, isUserLoaded: true, isSignedIn: true, clerkSubject: 'clerk-a', canonicalSubject: 'clerk-a', canonicalUserId: 'd1-a' }

test('addresses start only after Clerk and canonical D1 identity are ready', () => {
  assert.equal(getAuthenticatedAddressOwner(ready), 'd1-a')
  for (const pending of [
    { isAuthLoaded: false },
    { isUserLoaded: false },
    { isSignedIn: false },
    { canonicalSubject: null },
    { canonicalUserId: null },
  ]) assert.equal(getAuthenticatedAddressOwner({ ...ready, ...pending }), null)
})

test('logout or user switch hides prior saved addresses immediately', () => {
  const addresses = [{ id: 'address-a' }]
  assert.equal(getVisibleSavedAddresses('d1-a', 'd1-a', addresses), addresses)
  assert.deepEqual(getVisibleSavedAddresses(null, 'd1-a', addresses), [])
  assert.deepEqual(getVisibleSavedAddresses('d1-b', 'd1-a', addresses), [])
  assert.equal(getAuthenticatedAddressOwner({ ...ready, clerkSubject: 'clerk-b' }), null)
})

test('default and switched saved addresses prefill checkout without mutating source records', () => {
  const first = { id: 'a', city: 'TP. Hồ Chí Minh', unitCode: '26740', ward: 'Phường Sài Gòn', detail: '18 Nguyễn Huệ', recipientName: 'Minh Anh', recipientPhone: '0901112233', deliveryNote: 'Gọi trước' }
  const second = { id: 'b', city: 'TP. Hồ Chí Minh', unitCode: '27664', ward: 'Xã Cần Giờ', detail: '20 Đường Duyên Hải', recipientName: 'Bảo Hân', recipientPhone: '0904445566' }
  const prefilled = getCheckoutSavedAddressFields(first)
  assert.equal(prefilled.unitCode, '26740')
  assert.equal(prefilled.receiverName, 'Minh Anh')
  assert.equal(prefilled.deliveryNote, 'Gọi trước')
  const edited = { ...prefilled, address: '22 Nguyễn Huệ' }
  assert.equal(first.detail, '18 Nguyễn Huệ')
  assert.equal(edited.address, '22 Nguyễn Huệ')
  const switched = getCheckoutSavedAddressFields(second)
  assert.equal(switched.unitCode, '27664')
  assert.equal(switched.receiverName, 'Bảo Hân')
  assert.equal(switched.deliveryNote, '')
})

test('legacy saved address remains selectable without silently mapping an administrative code', () => {
  const legacy = getCheckoutSavedAddressFields({ city: 'TP. Hồ Chí Minh', district: 'Quận 1', ward: 'Phường Bến Nghé', detail: '18 Nguyễn Huệ' })
  assert.equal(legacy.unitCode, '')
  assert.equal(legacy.district, 'Quận 1')
  assert.equal(legacy.ward, 'Phường Bến Nghé')
})

test('address fetch is separate from login and has safe 401, server-error, timeout states', async () => {
  let calls = 0
  const signedOut = await fetchUserAddresses({ getToken: async () => null, fetchImpl: async () => { calls += 1; throw new Error('unexpected') } })
  assert.equal(signedOut.status, 401)
  assert.equal(calls, 0)
  for (const status of [401, 500]) {
    const result = await fetchUserAddresses({
      getToken: async () => 'test-token',
      fetchImpl: async () => new Response(JSON.stringify({ error: { code: 'ADDRESS_UNAVAILABLE', message: 'Thử lại sau.' } }), { status }),
    })
    assert.equal(result.ok, false)
    assert.equal(result.status, status)
    assert.equal(getAuthenticatedAddressOwner(ready), 'd1-a')
  }
  const timeout = await fetchUserAddresses({
    getToken: async () => 'test-token',
    fetchImpl: async (_url, options) => {
      assert.ok(options.signal)
      throw Object.assign(new Error('timed out'), { name: 'TimeoutError' })
    },
  })
  assert.equal(timeout.error.code, 'ADDRESS_TIMEOUT')
  assert.equal(getAuthenticatedAddressOwner(ready), 'd1-a')
})
