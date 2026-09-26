import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { register } from 'node:module'
register('./cart-component-loader.js', import.meta.url)
const React = await import('react')
const { act, create } = await import('react-test-renderer')
const { MemoryRouter } = await import('react-router-dom')
const { PublicCommerceContext } = await import('../src/context/publicCommerceStore.js')
const { PublicCommerceProvider } = await import('../src/context/PublicCommerceProvider.jsx')
const Success = (await import('../src/pages/CheckoutSuccessPage.jsx')).default
const CheckoutRoute = (await import('../src/pages/PublicCheckoutRoute.jsx')).default
const { CommerceContext } = await import('../src/context/commerceStore.js')
const { AccountContext } = await import('../src/context/accountStore.js')
const LegacyCheckout = (await import('../src/pages/CommerceCheckoutPage.jsx')).default
const AdminPage = (await import('../src/pages/AdminPage.jsx')).default
const { setClerkAuth } = await import('./mocks/clerkReact.js')
const DeliverySelector = (await import('../src/components/DeliverySelector.jsx')).default
const { DeliveryProgress } = await import('../src/components/CartItems.jsx')
const Footer = (await import('../src/components/Footer.jsx')).default

test('consultation copy makes no checkout/free-shipping promise; checkout wording remains available', async (t) => {
  const oldAct = globalThis.IS_REACT_ACT_ENVIRONMENT
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  t.after(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = oldAct })
  for (const mode of ['consultation', 'checkout']) {
    let renderer
    await act(async () => { renderer = create(React.createElement(MemoryRouter, null,
      React.createElement(PublicCommerceContext.Provider, { value: { mode } },
        React.createElement(CommerceContext.Provider, { value: { deliveryDraft: {}, setDeliveryDraft() {} } },
          React.createElement(DeliverySelector), React.createElement(DeliveryProgress, { subtotal: 1200000 }), React.createElement(Footer))))) })
    try {
      const content = JSON.stringify(renderer.toJSON())
      if (mode === 'consultation') {
        assert.match(content, /Thời gian mong muốn|Ngày dự kiến/u)
        assert.doesNotMatch(content, /bước thanh toán|miễn phí giao hàng|đơn đặt trước/u)
      } else {
        assert.match(content, /bước thanh toán/u)
        assert.match(content, /miễn phí giao hàng/u)
        assert.match(content, /đơn đặt trước/u)
      }
    } finally { await act(async () => renderer.unmount()) }
  }
})

test('Admin consultation mode hides fulfilment and requests; checkout restores existing section', async (t) => {
  const oldFetch = globalThis.fetch
  const oldAct = globalThis.IS_REACT_ACT_ENVIRONMENT
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const requests = []
  const getToken = async () => 'test-admin-session'
  setClerkAuth({ isLoaded: true, isSignedIn: true, getToken })
  globalThis.fetch = async (url) => {
    requests.push(url)
    return Response.json({ data: url === '/api/v1/admin/me'
      ? { authorized: true, user: { id: 'admin', role: 'admin', status: 'active' } }
      : { products: [], items: [], orders: [] } })
  }
  t.after(() => {
    globalThis.fetch = oldFetch
    globalThis.IS_REACT_ACT_ENVIRONMENT = oldAct
    setClerkAuth({ isLoaded: false, isSignedIn: undefined, userId: null })
  })
  function tree(mode) {
    return React.createElement(MemoryRouter, null,
      React.createElement(AccountContext.Provider, { value: { user: null } },
        React.createElement(PublicCommerceContext.Provider, { value: { mode, isLoading: false } }, React.createElement(AdminPage))))
  }
  let renderer
  await act(async () => { renderer = create(tree('consultation')) })
  try {
    assert.match(JSON.stringify(renderer.toJSON()), /Yêu cầu tư vấn/u)
    assert.equal(renderer.root.findAll((node) => node.props.id === 'orders-mgmt-title').length, 0)
    assert.equal(requests.includes('/api/v1/admin/orders'), false)
    await act(async () => renderer.update(tree('checkout')))
    assert.match(JSON.stringify(renderer.toJSON()), /Quản lý đơn hàng \(Fulfilment\)/u)
    assert.equal(renderer.root.findAll((node) => node.props.id === 'orders-mgmt-title').length, 1)
    assert.equal(requests.includes('/api/v1/admin/orders'), true)
    await act(async () => renderer.update(tree('consultation')))
    assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /Fulfilment/u)
    assert.match(JSON.stringify(renderer.toJSON()), /Yêu cầu tư vấn/u)
  } finally { await act(async () => renderer.unmount()) }
})

test('direct legacy success in consultation never mounts auth/account/payment implementation or requests details', async (t) => {
  const oldFetch = globalThis.fetch
  const oldAct = globalThis.IS_REACT_ACT_ENVIRONMENT
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  let requests = 0
  globalThis.fetch = async () => { requests++; throw new Error('Must not fetch legacy payment') }
  t.after(() => { globalThis.fetch = oldFetch; globalThis.IS_REACT_ACT_ENVIRONMENT = oldAct })
  let renderer
  await act(async () => { renderer = create(React.createElement(MemoryRouter, { initialEntries: ['/checkout/success/HF-EXISTING'] }, React.createElement(Success))) })
  try {
    const text = JSON.stringify(renderer.toJSON())
    assert.match(text, /Thanh toán trực tuyến hiện không được sử dụng/u)
    assert.equal(renderer.root.findAllByType('h1').length, 1)
    assert.equal(renderer.root.findByType('a').props.href, '/checkout')
    assert.equal(renderer.root.findAllByType('img').length, 0)
    assert.doesNotMatch(text, /MoMo|Chuyển khoản|HANAPIPI|Chờ thanh toán/u)
    assert.equal(requests, 0)
  } finally { await act(async () => renderer.unmount()) }
})

test('consultation routing renders contact summary, not dormant purchase controls', async (t) => {
  const oldAct = globalThis.IS_REACT_ACT_ENVIRONMENT
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  t.after(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = oldAct })
  let renderer
  await act(async () => { renderer = create(React.createElement(MemoryRouter, null,
    React.createElement(CommerceContext.Provider, { value: { cartItems: [{ key: 'p', productId: 'p', name: 'Hoa', quantity: 1, unitPrice: 590000, sizeId: 'standard', giftAddOns: [] }] } }, React.createElement(CheckoutRoute)))) })
  try {
    const text = JSON.stringify(renderer.toJSON())
    assert.match(text, /Gửi yêu cầu tư vấn/u)
    assert.doesNotMatch(text, /Ví MoMo|Đặt hoa|Tổng thanh toán/u)
    const restored = fs.readFileSync('src/pages/CommerceCheckoutPage.jsx', 'utf8')
    assert.match(restored, /createOrder\(/u)
    assert.match(restored, /getCheckoutAttempt\(/u)
    assert.ok(restored.indexOf('if (!result.ok)') < restored.indexOf('clearCart()'))
  } finally { await act(async () => renderer.unmount()) }
})

test('frontend uses read-only server mode and stays consultation on failed/invalid responses', async (t) => {
  const oldFetch = globalThis.fetch
  const oldAct = globalThis.IS_REACT_ACT_ENVIRONMENT
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  t.after(() => { globalThis.fetch = oldFetch; globalThis.IS_REACT_ACT_ENVIRONMENT = oldAct })
  function Consumer() { return React.createElement(PublicCommerceContext.Consumer, null, ({ mode }) => React.createElement('span', null, mode)) }
  for (const value of ['checkout', 'unknown', 'failure']) {
    globalThis.fetch = async (url) => {
      assert.equal(url, '/api/v1/public-commerce')
      if (value === 'failure') throw new Error('Offline')
      return Response.json({ data: { mode: value } })
    }
    let renderer
    await act(async () => { renderer = create(React.createElement(PublicCommerceProvider, null, React.createElement(Consumer))) })
    assert.equal(renderer.root.findByType('span').props.children, value === 'checkout' ? 'checkout' : 'consultation')
    await act(async () => renderer.unmount())
  }
})

test('preserved checkout mode form still renders real MoMo order submission and summary', async (t) => {
  const oldAct = globalThis.IS_REACT_ACT_ENVIRONMENT
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  t.after(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = oldAct })
  let renderer
  await act(async () => { renderer = create(React.createElement(MemoryRouter, null,
    React.createElement(AccountContext.Provider, { value: { user: null, savedAddresses: [], addAddress() {}, addOrder() {} } },
      React.createElement(CommerceContext.Provider, { value: { cartItems: [{ key: 'p', productId: 'p', name: 'Hoa', quantity: 1, unitPrice: 590000, sizeId: 'standard', giftAddOns: [] }], deliveryDraft: { date: '', slot: '' }, setDeliveryDraft() {}, clearCart() {} } }, React.createElement(LegacyCheckout))))) })
  try {
    const text = JSON.stringify(renderer.toJSON())
    assert.match(text, /Ví MoMo|Thông tin giao hoa và thanh toán/u)
    assert.match(text, /Tổng thanh toán/u)
    assert.equal(renderer.root.findAllByType('form').length, 1)
    assert.equal(renderer.root.findAllByType('button').filter((button) => button.props.type === 'submit').length, 1)
  } finally { await act(async () => renderer.unmount()) }
})
