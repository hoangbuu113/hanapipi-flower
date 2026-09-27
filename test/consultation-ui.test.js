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
const CheckoutSummary = (await import('../src/components/CheckoutSummary.jsx')).default
const { STORE_CONTACT } = await import('../src/config/storeContact.js')
const AdminConsultations = (await import('../src/components/admin/AdminConsultations.jsx')).default
const { copyText } = await import('../src/utils/clipboard.js')
const CopyReferenceButton = (await import('../src/components/CopyReferenceButton.jsx')).default

const item = { key: 'a', productId: 'nang-diu', slug: 'nang-diu', name: 'Nắng Dịu', sizeId: 'standard', wrappingId: 'ivory-paper', quantity: 2, unitPrice: 590000, size: { label: 'Tiêu chuẩn' }, wrapping: { label: 'Giấy ivory' }, giftAddOns: [], image: { src: '/api/v1/media/flowers.jfif', alt: 'Nắng Dịu' } }
const text = (renderer) => JSON.stringify(renderer.toJSON())
const button = (renderer, label) => renderer.root.findAllByType('button').find((node) => node.props.children === label)
function assertContactsHidden(renderer) {
  assert.doesNotMatch(text(renderer), /Zalo|Gọi tư vấn|Mã QR|Quét mã/u)
  assert.ok(!text(renderer).includes(STORE_CONTACT.phoneDisplay))
  assert.equal(renderer.root.findAllByType('a').filter((node) => node.props.href === STORE_CONTACT.zaloUrl || String(node.props.href).startsWith('tel:')).length, 0)
}
function assertContactsVisible(renderer) {
  assert.ok(STORE_CONTACT.zaloQrImage)
  const qr = renderer.root.findByProps({ className: 'selection-contact__qr' })
  assert.equal(qr.props.src, STORE_CONTACT.zaloQrImage)
  assert.equal(Number(qr.props.width), 180)
  assert.equal(Number(qr.props.height), 180)
  assert.ok(qr.props.alt)
  const links = renderer.root.findAllByType('a')
  const zalo = links.find((node) => node.props.href === STORE_CONTACT.zaloUrl)
  assert.equal(zalo.props.children, 'Nhắn qua Zalo')
  assert.equal(zalo.props.target, '_blank')
  assert.equal(zalo.props.rel, 'noopener noreferrer')
  assert.equal(links.find((node) => node.props.href === STORE_CONTACT.phoneTel).props.children, 'Gọi tư vấn')
  assert.ok(text(renderer).includes(STORE_CONTACT.phoneDisplay))
  assert.match(text(renderer), /Khi nhắn Zalo, bạn chỉ cần gửi mã trên/u)
}

test('Guest summary success clears Cart/count but keeps submitted snapshot, reference and contacts', async (t) => {
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
  function Harness() {
    const [items, setItems] = React.useState(cartItems)
    return React.createElement(CommerceContext.Provider, { value: {
      cartItems: items, cartError: null, isCartLoading: false, retryCart() {}, clearCart() { mutations++; setItems([]) },
    } }, React.createElement('output', { 'data-testid': 'count' }, items.reduce((count, entry) => count + entry.quantity, 0)), React.createElement(CheckoutPage))
  }
  await act(async () => { renderer = create(React.createElement(MemoryRouter, null, React.createElement(Harness))) })
  try {
    assert.equal(calls, 0)
    assertContactsHidden(renderer)
    const submit = button(renderer, 'Gửi yêu cầu tư vấn')
    await act(async () => { submit.props.onClick(); submit.props.onClick() })
    assert.equal(calls, 1)
    assert.equal(button(renderer, 'Đang gửi yêu cầu...').props.disabled, true)
    assertContactsHidden(renderer)
    await act(async () => { release(Response.json({ data: { consultation: { referenceCode: 'HP-TEST123456', referenceTotal: 1180000, status: 'new', createdAt: new Date().toISOString() } } }, { status: 201 })) })
    assert.match(text(renderer), /Hut Flower đã nhận thông tin lựa chọn của bạn/u)
    assert.match(text(renderer), /HP-TEST123456/u)
    assertContactsVisible(renderer)
    assert.match(text(renderer), /Nhắn qua Zalo/u); assert.match(text(renderer), /Gọi tư vấn/u)
    assert.doesNotMatch(text(renderer), /Mã QR Zalo chưa được cập nhật/u)
    assert.doesNotMatch(text(renderer), /Tổng thanh toán|Đặt hoa|Ví MoMo/u)
    assert.equal(mutations, 1); assert.deepEqual(cartItems, before)
    assert.equal(renderer.root.findByType('output').props.children, 0)
    assert.match(text(renderer), /Nắng Dịu/u)
    assert.equal(renderer.root.findByType(CheckoutPage).findByType(CheckoutSummary).props.cartItems[0].quantity, 2)
    assert.equal(button(renderer, 'Gửi yêu cầu tư vấn'), undefined)
  } finally { await act(async () => renderer.unmount()) }
})

test('success summary renders server snapshot prices/names instead of a stale client cart', async (t) => {
  const oldFetch = globalThis.fetch
  const oldAct = globalThis.IS_REACT_ACT_ENVIRONMENT
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  t.after(() => { globalThis.fetch = oldFetch; globalThis.IS_REACT_ACT_ENVIRONMENT = oldAct })
  const snapshot = { name: 'Nắng Dịu đã xác nhận', image: item.image.src, quantity: 2, unitReferencePrice: 650000, lineReferenceTotal: 1300000,
    selections: { size: { label: 'Tiêu chuẩn' }, wrapping: { label: 'Giấy ivory' }, gifts: [{ id: 'gift', label: 'Thiệp', price: 10000 }], message: '' } }
  globalThis.fetch = async () => Response.json({ data: { consultation: { referenceCode: 'HP-SNAPSHOT12', referenceTotal: 1300000, items: [snapshot] } } })
  let renderer
  await act(async () => { renderer = create(React.createElement(MemoryRouter, null, React.createElement(CommerceContext.Provider,
    { value: { cartItems: [item], clearCart() {} } }, React.createElement(CheckoutPage)))) })
  try {
    await act(async () => { await button(renderer, 'Gửi yêu cầu tư vấn').props.onClick() })
    assert.match(text(renderer), /Nắng Dịu đã xác nhận/u)
    assert.match(text(renderer), /650\.000/u)
    assert.match(text(renderer), /1\.300\.000/u)
    assert.doesNotMatch(text(renderer), /590\.000|1\.180\.000/u)
    assertContactsVisible(renderer)
  } finally { await act(async () => renderer.unmount()) }
})

test('preferences flow from scoped Cart to payload and successful snapshot after Cart clears', async (t) => {
  const oldFetch = globalThis.fetch
  const oldAct = globalThis.IS_REACT_ACT_ENVIRONMENT
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  t.after(() => { globalThis.fetch = oldFetch; globalThis.IS_REACT_ACT_ENVIRONMENT = oldAct })
  const preferences = { date: '2026-09-29', slot: '09:00 – 12:00' }
  let calls = 0
  globalThis.fetch = async (_, init) => {
    assert.equal(JSON.parse(init.body).desiredDate, preferences.date)
    assert.equal(JSON.parse(init.body).desiredTimeSlot, preferences.slot)
    calls++
    if (calls === 1) return Response.json({}, { status: 429 })
    return Response.json({ data: { consultation: { referenceCode: 'HP-PREFERENCE', referenceTotal: 1180000,
      desiredDate: preferences.date, desiredTimeSlot: preferences.slot } } })
  }
  function Harness() {
    const [cart, setCart] = React.useState([item])
    const [delivery, setDelivery] = React.useState(preferences)
    return React.createElement(CommerceContext.Provider, { value: { cartItems: cart, deliveryDraft: delivery,
      clearCart() { setCart([]); setDelivery({ date: null, slot: null }) } } }, React.createElement(CheckoutPage))
  }
  let renderer
  await act(async () => { renderer = create(React.createElement(MemoryRouter, null, React.createElement(Harness))) })
  try {
    assert.match(text(renderer), /29\/09\/2026|09:00 – 12:00/u)
    assertContactsHidden(renderer)
    await act(async () => { await button(renderer, 'Gửi yêu cầu tư vấn').props.onClick() })
    assertContactsHidden(renderer)
    assert.match(text(renderer), /29\/09\/2026/u)
    await act(async () => { await button(renderer, 'Gửi yêu cầu tư vấn').props.onClick() })
    assert.match(text(renderer), /HP-PREFERENCE/u)
    assert.match(text(renderer), /29\/09\/2026/u)
    assert.match(text(renderer), /09:00 – 12:00/u)
    assertContactsVisible(renderer)
    assert.equal(renderer.root.findAllByType(CopyReferenceButton).length, 1)
    assert.equal(renderer.root.findByProps({ className: 'selection-contact__qr' }).props.src, STORE_CONTACT.zaloQrImage)
  } finally { await act(async () => renderer.unmount()) }
})

test('copy HP uses exact code, provides accessible feedback, and fallback restores focus without alerts', async (t) => {
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const oldAct = globalThis.IS_REACT_ACT_ENVIRONMENT
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const copied = []
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async (code) => copied.push(code) } } })
  t.after(() => { if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator); else delete globalThis.navigator; globalThis.IS_REACT_ACT_ENVIRONMENT = oldAct })
  let renderer
  await act(async () => { renderer = create(React.createElement(CopyReferenceButton, { referenceCode: 'HP-COPY123456' })) })
  try {
    const control = button(renderer, 'Sao chép mã')
    assert.equal(control.props['aria-label'], 'Sao chép mã HP-COPY123456')
    await act(async () => { await control.props.onClick() })
    assert.deepEqual(copied, ['HP-COPY123456'])
    assert.match(text(renderer), /Đã sao chép/u)
  } finally { await act(async () => renderer.unmount()) }
  let removed = false; let restored = false; let selected = false; let value
  const field = { style: {}, setAttribute() {}, select() { selected = true; value = this.value }, remove() { removed = true } }
  const document = { body: { appendChild() {} }, activeElement: { focus() { restored = true } }, createElement: () => field,
    execCommand(command) { assert.equal(command, 'copy'); return true } }
  assert.equal(await copyText('HP-FALLBACK12', { navigator: {}, document }), true)
  assert.equal(value, 'HP-FALLBACK12'); assert.equal(selected && removed && restored, true)
  assert.equal(await copyText('HP-FAIL', { navigator: {}, document: {} }), false)
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
    assertContactsHidden(renderer)
  } finally { await act(async () => renderer.unmount()) }
})

test('validation/403/429/5xx/network/ambiguous failures never clear Cart; successful replay does', async (t) => {
  const originalFetch = globalThis.fetch
  const originalAct = globalThis.IS_REACT_ACT_ENVIRONMENT
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  t.after(() => { globalThis.fetch = originalFetch; globalThis.IS_REACT_ACT_ENVIRONMENT = originalAct })
  for (const status of [400, 403, 429, 500, 'network', 'ambiguous', 200]) {
    let clears = 0
    globalThis.fetch = async () => {
      if (status === 'network') throw new Error('Offline')
      return Response.json(status === 200 ? { data: { consultation: { referenceCode: 'HP-SAME123456', referenceTotal: 1180000 } } } : {}, { status: typeof status === 'number' ? status : 200 })
    }
    let renderer
    await act(async () => { renderer = create(React.createElement(MemoryRouter, null, React.createElement(CommerceContext.Provider, { value: {
      cartItems: [item], clearCart() { clears++ },
    } }, React.createElement(CheckoutPage)))) })
    try {
      await act(async () => { await button(renderer, 'Gửi yêu cầu tư vấn').props.onClick() })
      assert.equal(clears, status === 200 ? 1 : 0, `status ${status}`)
      assert.match(text(renderer), /Nắng Dịu/u)
      if (status === 200) { assert.match(text(renderer), /HP-SAME123456/u); assertContactsVisible(renderer) }
      else { assert.equal(renderer.root.findAllByProps({ role: 'alert' }).length, 1); assertContactsHidden(renderer) }
    } finally { await act(async () => renderer.unmount()) }
  }
})

test('successful consultation uses real scoped clearCart: Guest and User carts, badge and drawer stay isolated', async (t) => {
  const { CommerceProvider } = await import('../src/context/CommerceContext.jsx')
  const { useCommerce } = await import('../src/context/commerceStore.js')
  const { setClerkAuth } = await import('./mocks/clerkReact.js')
  const { readScopedCart, writeScopedCart } = await import('../src/utils/cartIdentity.js')
  const FloatingCart = (await import('../src/components/FloatingCartShortcut.jsx')).default
  const CartDrawer = (await import('../src/components/CartDrawer.jsx')).default
  const original = { fetch: globalThis.fetch, window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT }
  const values = new Map()
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) }
  globalThis.window = { localStorage: storage, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout }
  globalThis.document = { activeElement: null, body: { style: {} } }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  globalThis.fetch = async () => Response.json({ data: { consultation: { referenceCode: 'HP-SCOPED1234', referenceTotal: 1180000 } } })
  t.after(() => {
    Object.assign(globalThis, { fetch: original.fetch, window: original.window, document: original.document, IS_REACT_ACT_ENVIRONMENT: original.act })
    setClerkAuth({ isLoaded: false, isSignedIn: undefined, userId: null })
  })
  let commerce
  function Probe() { const current = useCommerce(); React.useEffect(() => { commerce = current }, [current]); return null }
  const custom = { custom: true, key: 'custom:test', name: 'Hoa thử nghiệm', quantity: 2, price: 590000, flowers: [], size: 'standard' }
  for (const scope of ['guest', 'user:test-a']) {
    writeScopedCart(storage, 'guest', { items: [custom], delivery: {} })
    writeScopedCart(storage, 'user:test-a', { items: [custom], delivery: {} })
    const other = scope === 'guest' ? 'user:test-a' : 'guest'
    const otherBefore = JSON.stringify(readScopedCart(storage, other))
    setClerkAuth({ isLoaded: true, isSignedIn: scope !== 'guest', userId: scope === 'guest' ? null : 'test-a' })
    let renderer
    await act(async () => { renderer = create(React.createElement(MemoryRouter, null, React.createElement(CommerceProvider, null,
      React.createElement(CheckoutPage), React.createElement(FloatingCart), React.createElement(CartDrawer), React.createElement(Probe)))) })
    try {
      assert.equal(commerce.cartCount, 2)
      await act(async () => { await button(renderer, 'Gửi yêu cầu tư vấn').props.onClick() })
      assert.equal(commerce.cartCount, 0)
      assert.deepEqual(commerce.cartItems, [])
      assert.deepEqual(readScopedCart(storage, scope).items, [])
      assert.equal(JSON.stringify(readScopedCart(storage, other)), otherBefore)
      assert.equal(renderer.root.findAll((node) => node.props.className === 'floating-cart-shortcut__badge').length, 0)
      assert.match(text(renderer), /HP-SCOPED1234/u)
      await act(async () => commerce.openCart())
      assert.match(text(renderer), /Giỏ hàng của bạn đang trống/u)
    } finally { await act(async () => renderer.unmount()) }
  }
})

test('small Admin consultation view loads snapshots, localized notification/status and updates without order API calls', async (t) => {
  const originalFetch = globalThis.fetch
  const originalAct = globalThis.IS_REACT_ACT_ENVIRONMENT
  const originalDocument = globalThis.document
  globalThis.document = { activeElement: null, addEventListener() {}, removeEventListener() {} }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  t.after(() => { globalThis.fetch = originalFetch; globalThis.IS_REACT_ACT_ENVIRONMENT = originalAct; globalThis.document = originalDocument })
  const consultation = { id: 'cr_test', referenceCode: 'HP-TEST123456', referenceTotal: 1180000, desiredDate: '2026-09-29', desiredTimeSlot: '09:00 – 12:00', createdAt: '2026-09-26T12:00:00.000Z', status: 'new', notificationStatus: 'partial', items: [{ name: 'Nắng Dịu', image: item.image.src, quantity: 2, unitReferencePrice: 590000, lineReferenceTotal: 1180000, selections: { size: { label: 'Tiêu chuẩn' }, message: 'Một ngày thật dịu dàng', gifts: [] } }] }
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
    assert.match(text(renderer), /29\/09\/2026/u)
    assert.match(text(renderer), /09:00 – 12:00/u)
    assert.ok(text(renderer).includes(new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(consultation.createdAt))))
    assert.equal(renderer.root.findByType(CopyReferenceButton).props.referenceCode, 'HP-TEST123456')
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
