import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  HCMC_ADMIN_DATA_VERSION,
  HCMC_CITY,
  getHcmcAdministrativeUnit,
  hcmcAdministrativeUnits,
} from '../src/data/hcmcAdministrativeUnits.js'
import {
  HCMC_DELIVERY_SCOPE_SOURCE_URL,
  hcmcDeliveryUnits,
  searchHcmcDeliveryUnits,
} from '../src/data/hcmcDeliveryUnits.js'
import { getHcmcDeliveryUnit, validateHcmcDeliveryAddress } from '../src/utils/hcmcDelivery.js'
import { normalizeSearch } from '../src/utils/normalizeSearch.js'

test('official HCMC two-tier dataset has 168 unique coded units', () => {
  assert.equal(HCMC_ADMIN_DATA_VERSION, '2025-07-01')
  assert.equal(hcmcAdministrativeUnits.length, 168)
  assert.equal(new Set(hcmcAdministrativeUnits.map(({ code }) => code)).size, 168)
  assert.deepEqual(
    hcmcAdministrativeUnits.reduce((counts, unit) => ({ ...counts, [unit.type]: counts[unit.type] + 1 }), { ward: 0, commune: 0, 'special-zone': 0 }),
    { ward: 113, commune: 54, 'special-zone': 1 },
  )
  assert.equal(getHcmcAdministrativeUnit('26740')?.name, 'Phường Sài Gòn')
  assert.equal(getHcmcAdministrativeUnit('27664')?.name, 'Xã Cần Giờ')
  assert.equal(getHcmcAdministrativeUnit('26732')?.name, 'Đặc khu Côn Đảo')
  assert.equal(getHcmcAdministrativeUnit('99999'), null)
})

test('delivery scope contains only the 102 units in former HCMC territory', () => {
  assert.equal(hcmcDeliveryUnits.length, 102)
  assert.equal(new Set(hcmcDeliveryUnits.map(({ code }) => code)).size, 102)
  assert.ok(HCMC_DELIVERY_SCOPE_SOURCE_URL.startsWith('https://xaydungchinhsach.chinhphu.vn/'))
  for (const unit of hcmcDeliveryUnits) assert.equal(getHcmcAdministrativeUnit(unit.code)?.name, unit.name)

  // Cross-checked against clauses 1-78 and 113-135 of Resolution 1685,
  // plus unchanged Xã Thạnh An. The digest guards the complete name set,
  // not just its count or a handful of representative wards.
  const officialNameSet = hcmcDeliveryUnits.map(({ name }) => name.normalize('NFC')).sort()
  assert.equal(
    createHash('sha256').update(JSON.stringify(officialNameSet)).digest('hex'),
    '23e7547606e3ac86b147d4542b3165be5121b303c707eba1e9ab3c080bf00126',
  )
  assert.equal(new Set(officialNameSet).size, 102)
  assert.equal(new Set(hcmcAdministrativeUnits.map(({ name }) => name.normalize('NFC'))).size, 168)
  assert.ok(hcmcAdministrativeUnits.every(({ code }) => /^\d{5}$/u.test(code)))
  assert.ok(hcmcDeliveryUnits.every(({ name }) => !/^Phường \d/u.test(name)))
  for (const unit of hcmcDeliveryUnits) {
    assert.ok(searchHcmcDeliveryUnits(unit.name).some(({ code }) => code === unit.code), `${unit.name} must be selectable`)
    assert.equal(validateHcmcDeliveryAddress({ city: HCMC_CITY, detail: '18 Nguyễn Huệ', unitCode: unit.code }).rejectionCode, null)
  }

  const names = new Set(hcmcDeliveryUnits.map(({ name }) => name))
  for (const name of [
    'Phường Hạnh Thông', 'Phường An Nhơn', 'Phường Gò Vấp', 'Phường An Hội Đông',
    'Phường Thông Tây Hội', 'Phường An Hội Tây',
    'Phường Đức Nhuận', 'Phường Cầu Kiệu', 'Phường Phú Nhuận',
  ]) assert.ok(names.has(name), `${name} must be serviceable`)

  const representatives = [
    'Phường Thủ Đức', 'Phường Bình Thạnh', 'Phường Tân Bình', 'Phường Tân Phú', 'Phường Bình Tân',
    'Phường Sài Gòn', 'Phường Bàn Cờ', 'Phường Xóm Chiếu', 'Phường Chợ Quán', 'Phường Chợ Lớn',
    'Phường Tân Thuận', 'Phường Chánh Hưng', 'Phường Hòa Hưng', 'Phường Minh Phụng', 'Phường Thới An',
    'Xã Bình Chánh', 'Xã Hóc Môn', 'Xã Củ Chi', 'Xã Nhà Bè', 'Xã Cần Giờ', 'Xã Thạnh An',
  ]
  for (const name of representatives) assert.ok(names.has(name), `${name} must be in former-HCMC scope`)
  for (const name of [
    ...representatives,
    'Phường Hạnh Thông', 'Phường Gò Vấp', 'Phường Đức Nhuận', 'Phường Phú Nhuận',
  ]) {
    const unit = hcmcAdministrativeUnits.find((entry) => entry.name === name)
    assert.ok(unit)
    assert.deepEqual(validateHcmcDeliveryAddress({
      city: HCMC_CITY,
      detail: '18 Nguyễn Huệ',
      unitCode: unit.code,
    }).errors, {}, `${name} must pass server-side address validation`)
  }
})

test('search is accent-insensitive and the former-HCMC allowlist rejects the other merged territories', () => {
  assert.equal(normalizeSearch('Phường Sài Gòn').includes(normalizeSearch('sai gon')), true)
  for (const query of ['Gò Vấp', 'Go Vap', 'go vap', 'gò', 'vap', 'phuong go vap']) {
    assert.ok(searchHcmcDeliveryUnits(query).some(({ name }) => name === 'Phường Gò Vấp'), `${query} must find Phường Gò Vấp`)
  }
  assert.equal(searchHcmcDeliveryUnits('').length, 102)
  for (const unit of hcmcDeliveryUnits) assert.equal(getHcmcDeliveryUnit(unit.code)?.code, unit.code)
  for (const name of ['Phường Dĩ An', 'Phường Vũng Tàu', 'Đặc khu Côn Đảo']) {
    const unit = hcmcAdministrativeUnits.find((entry) => entry.name === name)
    assert.ok(unit)
    assert.equal(getHcmcDeliveryUnit(unit.code), null)
    assert.equal(validateHcmcDeliveryAddress({ city: HCMC_CITY, detail: '18 Nguyễn Huệ', unitCode: unit.code }).rejectionCode, 'NOT_SERVICEABLE')
  }
})

test('shared validation rejects other cities, forged codes/names and missing detail', () => {
  const valid = { city: HCMC_CITY, detail: '18 Nguyễn Huệ', unitCode: '26740' }
  assert.deepEqual(validateHcmcDeliveryAddress(valid).errors, {})
  assert.ok(validateHcmcDeliveryAddress({ ...valid, city: 'Hà Nội' }).errors.city)
  assert.ok(validateHcmcDeliveryAddress({ ...valid, unitCode: '99999' }).errors.unitCode)
  assert.equal(validateHcmcDeliveryAddress({ ...valid, unitCode: '99999' }).rejectionCode, 'INVALID_ADMIN_UNIT')
  const outsideScopeCode = hcmcAdministrativeUnits.find((unit) => unit.name === 'Phường Dĩ An').code
  assert.equal(validateHcmcDeliveryAddress({ ...valid, unitCode: outsideScopeCode }).rejectionCode, 'NOT_SERVICEABLE')
  assert.ok(validateHcmcDeliveryAddress({ ...valid, ward: 'Phường Bến Nghé' }).errors.ward)
  assert.ok(validateHcmcDeliveryAddress({ ...valid, detail: '  ' }).errors.detail)
})

test('Account and both checkout modes use the same serviceable selector', () => {
  const selector = fs.readFileSync(path.resolve('src/components/AdministrativeUnitSelector.jsx'), 'utf8')
  const account = fs.readFileSync(path.resolve('src/pages/AccountPage.jsx'), 'utf8')
  const checkout = fs.readFileSync(path.resolve('src/pages/CheckoutPage.jsx'), 'utf8')

  assert.match(selector, /searchHcmcDeliveryUnits\(query\)/u)
  assert.doesNotMatch(selector, /\.slice\(0,\s*40\)/u)
  assert.match(account, /getHcmcDeliveryUnit\(form\.unitCode\)/)
  assert.equal(checkout.match(/<AdministrativeUnitSelector\b/gu)?.length, 1)
})

test('mounted selector exposes all units and immediately finds Gò Vấp without accents', async () => {
  const { register } = await import('node:module')
  register('./cart-component-loader.js', import.meta.url)
  const React = await import('react')
  const { act, create } = await import('react-test-renderer')
  const AdministrativeUnitSelector = (await import('../src/components/AdministrativeUnitSelector.jsx')).default
  const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  let selectedCode = null
  let renderer

  try {
    await act(async () => {
      renderer = create(React.createElement(AdministrativeUnitSelector, {
        error: null,
        onChange: (code) => { selectedCode = code },
        value: '',
      }))
    })
    await act(async () => { renderer.root.findByProps({ role: 'combobox' }).props.onFocus() })
    assert.equal(renderer.root.findAllByProps({ role: 'option' }).length, 102)

    for (const query of ['Gò Vấp', 'Go Vap', 'go vap', 'gò', 'vap']) {
      await act(async () => {
        renderer.root.findByProps({ role: 'combobox' }).props.onChange({ target: { value: query } })
      })
      assert.ok(renderer.root.findAllByProps({ role: 'option' }).some(({ props }) => props.children === 'Phường Gò Vấp'))
    }

    const goVap = renderer.root.findAllByProps({ role: 'option' }).find(({ props }) => props.children === 'Phường Gò Vấp')
    await act(async () => { goVap.props.onClick() })
    assert.equal(selectedCode, '26884')
  } finally {
    if (renderer) await act(async () => { renderer.unmount() })
    globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment
  }
})
