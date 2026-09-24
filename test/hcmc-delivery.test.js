import assert from 'node:assert/strict'
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
  for (const unit of hcmcDeliveryUnits) assert.equal(getHcmcDeliveryUnit(unit.code)?.code, unit.code)
  for (const name of ['Phường Dĩ An', 'Phường Vũng Tàu']) {
    const unit = hcmcAdministrativeUnits.find((entry) => entry.name === name)
    assert.ok(unit)
    assert.equal(getHcmcDeliveryUnit(unit.code), null)
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

  assert.match(selector, /hcmcDeliveryUnits/)
  assert.match(account, /getHcmcDeliveryUnit\(form\.unitCode\)/)
  assert.equal(checkout.match(/<AdministrativeUnitSelector\b/gu)?.length, 1)
})
