import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { register } from 'node:module'
register('./cart-component-loader.js', import.meta.url)
const React = await import('react')
const { act, create } = await import('react-test-renderer')
const { MemoryRouter } = await import('react-router-dom')
const { CommerceContext } = await import('../src/context/commerceStore.js')
const CheckoutPage = (await import('../src/pages/CheckoutPage.jsx')).default
const AdminConsultations = (await import('../src/components/admin/AdminConsultations.jsx')).default

const item = { key: 'a', productId: 'nang-diu', slug: 'nang-diu', name: 'Nắng Dịu', sizeId: 'standard', wrappingId: 'ivory-paper', quantity: 2, unitPrice: 590000, size: { label: 'Tiêu chuẩn' }, wrapping: { label: 'Giấy ivory' }, giftAddOns: [], image: { src: '/api/v1/media/flowers.jfif', alt: 'Nắng Dịu' } }
const text = (renderer) => JSON.stringify(renderer.toJSON())
const button = (renderer, label) => renderer.root.findAllByType('button').find((node) => node.props.children === label)

test('Guest summary submit locks duplicate click, shows reference and contacts, never clears Cart', async (t) => {
  const originalFetch = globalThis.fetch
  const originalAct = globalThis.IS_REACT_ACT_ENVIRONMENT
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  t.after(() => { globalThis.fetch = originalFetch; globalThis.IS_REACT_ACT_ENVIRONMENT = originalAct })
  const cartItems = [structuredClone(item)]
  const before = structuredClone(cartItems)
  let mutations = 0; let calls = 0; let release
  globalThis.fetch = async (url, init) => {
    calls++
    assert.equal(url, '/api/v1/consultations')
    const submitted = JSON.parse(init.body)
    assert.equal(submitted.items[0].quantity, 2)
    assert.equal(submitted.items[0].unitPrice, undefined)
    return new Promise((resolve) => { release = resolve })
  }
  let renderer
  await act(async () => { renderer = create(React.createElement(MemoryRouter, null, React.createElement(CommerceContext.Provider, { value: {
    cartItems, cartError: null, isCartLoading: false, retryCart() {}, clearCart() { mutations++ },
  } }, React.createElement(CheckoutPage)))) })
  try {
    assert.equal(calls, 0)
    const submit = button(renderer, 'Gửi yêu cầu tư vấn')
    await act(async () => { submit.props.onClick(); submit.props.onClick() })
    assert.equal(calls, 1)
    assert.equal(button(renderer, 'Đang gửi yêu cầu...').props.disabled, true)
    await act(async () => { release(Response.json({ data: { consultation: { referenceCode: 'HP-TEST123456', referenceTotal: 1180000, status: 'new', createdAt: new Date().toISOString() } } }, { status: 201 })) })
    assert.match(text(renderer), /Hanapipi đã nhận thông tin lựa chọn của bạn/u)
    assert.match(text(renderer), /HP-TEST123456/u)
    assert.match(text(renderer), /Nhắn qua Zalo/u); assert.match(text(renderer), /Gọi tư vấn/u)
    assert.doesNotMatch(text(renderer), /Tổng thanh toán|Đặt hoa|Ví MoMo/u)
    assert.equal(mutations, 0); assert.deepEqual(cartItems, before)
    assert.equal(button(renderer, 'Gửi yêu cầu tư vấn'), undefined)
  } finally { await act(async () => renderer.unmount()) }
})

test('failed consultation keeps selections and retries the same idempotency key', async (t) => {
  const originalFetch = globalThis.fetch
  const originalAct = globalThis.IS_REACT_ACT_ENVIRONMENT
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  t.after(() => { globalThis.fetch = originalFetch; globalThis.IS_REACT_ACT_ENVIRONMENT = originalAct })
  const keys = []
  globalThis.fetch = async (_, init) => { keys.push(init.headers['Idempotency-Key']); return Response.json({}, { status: 429 }) }
  let renderer
  await act(async () => { renderer = create(React.createElement(MemoryRouter, null, React.createElement(CommerceContext.Provider, { value: { cartItems: [item], cartError: null, isCartLoading: false } }, React.createElement(CheckoutPage)))) })
  try {
    await act(async () => { await button(renderer, 'Gửi yêu cầu tư vấn').props.onClick() })
    assert.match(text(renderer), /thử lại sau một phút/u)
    assert.equal(button(renderer, 'Gửi yêu cầu tư vấn').props.disabled, false)
    await act(async () => { await button(renderer, 'Gửi yêu cầu tư vấn').props.onClick() })
    assert.equal(keys.length, 2); assert.equal(keys[0], keys[1])
    assert.match(text(renderer), /Nắng Dịu/u)
  } finally { await act(async () => renderer.unmount()) }
})

test('small Admin consultation view loads snapshots, localized notification/status and updates without order API calls', async (t) => {
  const originalFetch = globalThis.fetch
  const originalAct = globalThis.IS_REACT_ACT_ENVIRONMENT
  const originalDocument = globalThis.document
  globalThis.document = { activeElement: null, addEventListener() {}, removeEventListener() {} }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  t.after(() => { globalThis.fetch = originalFetch; globalThis.IS_REACT_ACT_ENVIRONMENT = originalAct; globalThis.document = originalDocument })
  const consultation = { id: 'cr_test', referenceCode: 'HP-TEST123456', referenceTotal: 1180000, createdAt: '2026-09-26T12:00:00.000Z', status: 'new', notificationStatus: 'partial', items: [{ name: 'Nắng Dịu', image: item.image.src, quantity: 2, unitReferencePrice: 590000, lineReferenceTotal: 1180000, selections: { size: { label: 'Tiêu chuẩn' }, message: 'Một ngày thật dịu dàng', gifts: [] } }] }
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push(url); assert.equal(init.headers.Authorization, 'Bearer test-admin-token')
    if (url.endsWith('/status')) { consultation.status = JSON.parse(init.body).status; return Response.json({ data: { consultation } }) }
    return Response.json({ data: url.endsWith('/cr_test') ? { consultation } : { items: [consultation] } })
  }
  let renderer
  await act(async () => { renderer = create(React.createElement(AdminConsultations, { getToken: async () => 'test-admin-token' }), {
    createNodeMock: () => ({ querySelectorAll: () => [], focus() {}, contains: () => false }),
  }) })
  try {
    assert.match(text(renderer), /Đã gửi một phần/u)
    await act(async () => { await button(renderer, 'Xem chi tiết').props.onClick() })
    assert.match(text(renderer), /Một ngày thật dịu dàng/u)
    assert.equal(renderer.root.findByProps({ role: 'dialog' }).props['aria-modal'], 'true')
    await act(async () => { await button(renderer, 'Đánh dấu đã liên hệ').props.onClick() })
    assert.match(text(renderer), /Đã liên hệ/u)
    await act(async () => { await button(renderer, 'Khép lại yêu cầu').props.onClick() })
    assert.match(text(renderer), /Đã khép lại/u)
    await act(async () => { button(renderer, 'Đóng').props.onClick() })
    assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 0)
    assert.ok(calls.every((url) => url.startsWith('/api/v1/admin/consultations')))
    assert.match(fs.readFileSync('src/components/admin/AdminConsultations.jsx', 'utf8'), /<AdminModal/u)
  } finally { await act(async () => renderer.unmount()) }
})
