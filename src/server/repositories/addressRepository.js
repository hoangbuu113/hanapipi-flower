import {
  FULFILMENT_KEY_VERSION,
  decryptFulfilmentValue,
  encryptFulfilmentValue,
} from '../fulfilmentCrypto.js'
import { HCMC_CITY } from '../../data/hcmcAdministrativeUnits.js'
import { validateHcmcDeliveryAddress } from '../../utils/hcmcDelivery.js'

const PHONE_PATTERN = /^(0\d{9}|\+84\d{9})$/u
const MAX_SAVED_ADDRESSES = 10

function addressError(status, code, message, fieldErrors) {
  const error = new Error(message)
  error.code = code
  error.status = status
  if (fieldErrors) error.fieldErrors = fieldErrors
  return error
}

function normalizeAddressPayload(payload, { isPartial = false } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw addressError(400, 'INVALID_PAYLOAD', 'Dữ liệu địa chỉ không hợp lệ.')
  }
  const fieldErrors = {}

  let label = ''
  if (payload.label !== undefined) {
    if (typeof payload.label !== 'string') {
      fieldErrors.label = 'Tên gợi nhớ không hợp lệ.'
    } else {
      label = payload.label.trim()
      if (label.length > 80) fieldErrors.label = 'Tên gợi nhớ không được quá 80 ký tự.'
    }
  }

  let recipientName = undefined
  if (payload.recipientName !== undefined || payload.recipient?.name !== undefined || !isPartial) {
    const val = payload.recipientName ?? payload.recipient?.name
    if (typeof val !== 'string' || !val.trim() || val.trim().length > 120) {
      fieldErrors.recipientName = 'Vui lòng nhập họ và tên người nhận (tối đa 120 ký tự).'
    } else {
      recipientName = val.trim()
    }
  }

  let recipientPhone = undefined
  if (payload.recipientPhone !== undefined || payload.recipient?.phone !== undefined || !isPartial) {
    const val = (payload.recipientPhone ?? payload.recipient?.phone ?? '')
    const cleanPhone = typeof val === 'string' ? val.replaceAll(/\s/gu, '') : ''
    if (!PHONE_PATTERN.test(cleanPhone)) {
      fieldErrors.recipientPhone = 'Vui lòng nhập số điện thoại Việt Nam hợp lệ.'
    } else {
      recipientPhone = cleanPhone
    }
  }

  const city = payload.city ?? payload.address?.city ?? (isPartial ? undefined : HCMC_CITY)
  const unitCode = payload.unitCode ?? payload.address?.unitCode
  const ward = payload.ward ?? payload.address?.ward
  const location = !isPartial
    ? validateHcmcDeliveryAddress({ city, detail: payload.detail ?? payload.address?.detail, unitCode, ward })
    : null
  if (location) {
    Object.assign(fieldErrors, location.errors)
  } else if (city !== undefined && city !== HCMC_CITY) {
    fieldErrors.city = 'Hut Flower hiện chỉ giao hoa tại TP. Hồ Chí Minh.'
  }

  let detail = undefined
  if (payload.detail !== undefined || payload.address !== undefined || !isPartial) {
    const val = payload.detail ?? (typeof payload.address === 'string' ? payload.address : payload.address?.detail)
    if (typeof val !== 'string' || !val.trim() || val.trim().length > 240) {
      fieldErrors.detail = 'Vui lòng nhập địa chỉ cụ thể (tối đa 240 ký tự).'
    } else {
      detail = val.trim()
    }
  }

  let deliveryNote = ''
  const noteVal = payload.deliveryNote ?? payload.address?.deliveryNote ?? payload.note
  if (noteVal !== undefined && noteVal !== null) {
    if (typeof noteVal !== 'string') {
      fieldErrors.deliveryNote = 'Ghi chú giao hàng không hợp lệ.'
    } else {
      deliveryNote = noteVal.trim()
      if (deliveryNote.length > 240) {
        fieldErrors.deliveryNote = 'Ghi chú giao hàng không được quá 240 ký tự.'
      }
    }
  }

  const isDefault = payload.isDefault !== undefined ? Boolean(payload.isDefault) : undefined

  if (Object.keys(fieldErrors).length > 0) {
    throw addressError(400, location?.rejectionCode || 'INVALID_PAYLOAD', 'Dữ liệu địa chỉ chưa hợp lệ.', fieldErrors)
  }

  return {
    city,
    deliveryNote,
    detail,
    district: '',
    isDefault,
    label,
    recipientName,
    recipientPhone,
    unitCode,
    ward: location?.unit?.name ?? ward,
  }
}

function formatAddressDto(row, decryptedRecipient, decryptedAddress) {
  return {
    address: {
      city: decryptedAddress.city,
      deliveryNote: decryptedAddress.deliveryNote || '',
      detail: decryptedAddress.detail,
      district: decryptedAddress.district,
      unitCode: decryptedAddress.unitCode || null,
      ward: decryptedAddress.ward,
    },
    city: decryptedAddress.city,
    createdAtUtc: row.created_at_utc,
    deliveryNote: decryptedAddress.deliveryNote || '',
    detail: decryptedAddress.detail,
    district: decryptedAddress.district,
    unitCode: decryptedAddress.unitCode || null,
    id: row.id,
    isDefault: Boolean(row.is_default),
    label: row.label || '',
    recipient: {
      name: decryptedRecipient.name,
      phone: decryptedRecipient.phone,
    },
    recipientName: decryptedRecipient.name,
    recipientPhone: decryptedRecipient.phone,
    updatedAtUtc: row.updated_at_utc,
    ward: decryptedAddress.ward,
  }
}

export function createAddressRepository(db, options = {}) {
  const { fulfilmentKey } = options

  async function listForUser(user) {
    if (!user?.id) throw addressError(401, 'AUTHENTICATION_REQUIRED', 'Yêu cầu xác thực người dùng.')

    const result = await db.prepare(`
      SELECT * FROM user_addresses
      WHERE user_id = ? AND deleted_at_utc IS NULL
      ORDER BY is_default DESC, created_at_utc DESC
    `).bind(user.id).all()

    const rows = result?.results || []
    const addresses = []

    for (const row of rows) {
      const decryptedRecipient = await decryptFulfilmentValue(row.recipient_ciphertext, fulfilmentKey)
      const decryptedAddress = await decryptFulfilmentValue(row.address_ciphertext, fulfilmentKey)
      addresses.push(formatAddressDto(row, decryptedRecipient, decryptedAddress))
    }

    return addresses
  }

  async function getForUser(user, addressId) {
    if (!user?.id) throw addressError(401, 'AUTHENTICATION_REQUIRED', 'Yêu cầu xác thực người dùng.')
    if (!addressId) throw addressError(404, 'ADDRESS_NOT_FOUND', 'Không tìm thấy địa chỉ được yêu cầu.')

    const row = await db.prepare(`
      SELECT * FROM user_addresses
      WHERE id = ? AND user_id = ? AND deleted_at_utc IS NULL
    `).bind(addressId, user.id).first()

    if (!row) {
      throw addressError(404, 'ADDRESS_NOT_FOUND', 'Không tìm thấy địa chỉ được yêu cầu.')
    }

    const decryptedRecipient = await decryptFulfilmentValue(row.recipient_ciphertext, fulfilmentKey)
    const decryptedAddress = await decryptFulfilmentValue(row.address_ciphertext, fulfilmentKey)
    return formatAddressDto(row, decryptedRecipient, decryptedAddress)
  }

  async function createForUser(user, payload) {
    if (!user?.id) throw addressError(401, 'AUTHENTICATION_REQUIRED', 'Yêu cầu xác thực người dùng.')
    const normalized = normalizeAddressPayload(payload, { isPartial: false })

    const countRow = await db.prepare(`
      SELECT COUNT(*) AS count FROM user_addresses
      WHERE user_id = ? AND deleted_at_utc IS NULL
    `).bind(user.id).first()

    const existingCount = Number(countRow?.count || 0)
    if (existingCount >= MAX_SAVED_ADDRESSES) {
      throw addressError(409, 'ADDRESS_LIMIT_REACHED', 'Bạn chỉ có thể lưu tối đa 10 địa chỉ.')
    }
    const isFirstAddress = existingCount === 0
    const makeDefault = isFirstAddress || Boolean(normalized.isDefault)

    const now = new Date().toISOString()
    const addressId = `addr_${globalThis.crypto.randomUUID().replaceAll('-', '')}`

    const recipientCiphertext = await encryptFulfilmentValue({
      name: normalized.recipientName,
      phone: normalized.recipientPhone,
    }, fulfilmentKey)

    const addressCiphertext = await encryptFulfilmentValue({
      city: normalized.city,
      deliveryNote: normalized.deliveryNote || '',
      detail: normalized.detail,
      district: normalized.district,
      unitCode: normalized.unitCode,
      ward: normalized.ward,
    }, fulfilmentKey)

    // The count check and insert share one SQL statement, so concurrent creates
    // cannot both claim the last slot. D1 batch also keeps default changes atomic.
    const results = await db.batch([
      db.prepare(`
        INSERT INTO user_addresses (
          id, user_id, label, recipient_ciphertext, address_ciphertext,
          key_version, is_default, created_at_utc, updated_at_utc, deleted_at_utc
        ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL
        WHERE (SELECT COUNT(*) FROM user_addresses
          WHERE user_id = ? AND deleted_at_utc IS NULL) < ?
      `).bind(
        addressId,
        user.id,
        normalized.label,
        recipientCiphertext,
        addressCiphertext,
        FULFILMENT_KEY_VERSION,
        0,
        now,
        now,
        user.id,
        MAX_SAVED_ADDRESSES,
      ),
      db.prepare(`
        UPDATE user_addresses SET is_default = 0, updated_at_utc = ?
        WHERE user_id = ? AND id <> ? AND deleted_at_utc IS NULL
          AND ? = 1 AND EXISTS (SELECT 1 FROM user_addresses WHERE id = ?)
      `).bind(now, user.id, addressId, makeDefault ? 1 : 0, addressId),
      db.prepare(`
        UPDATE user_addresses SET is_default = 1 WHERE id = ? AND user_id = ? AND ? = 1
      `).bind(addressId, user.id, makeDefault ? 1 : 0),
    ])
    if (!results[0]?.meta?.changes) {
      throw addressError(409, 'ADDRESS_LIMIT_REACHED', 'Bạn chỉ có thể lưu tối đa 10 địa chỉ.')
    }

    return {
      address: {
        city: normalized.city,
        deliveryNote: normalized.deliveryNote || '',
        detail: normalized.detail,
        district: normalized.district,
        unitCode: normalized.unitCode,
        ward: normalized.ward,
      },
      city: normalized.city,
      createdAtUtc: now,
      deliveryNote: normalized.deliveryNote || '',
      detail: normalized.detail,
      district: normalized.district,
      unitCode: normalized.unitCode,
      id: addressId,
      isDefault: makeDefault,
      label: normalized.label,
      recipient: {
        name: normalized.recipientName,
        phone: normalized.recipientPhone,
      },
      recipientName: normalized.recipientName,
      recipientPhone: normalized.recipientPhone,
      updatedAtUtc: now,
      ward: normalized.ward,
    }
  }

  async function updateForUser(user, addressId, payload) {
    if (!user?.id) throw addressError(401, 'AUTHENTICATION_REQUIRED', 'Yêu cầu xác thực người dùng.')
    if (!addressId) throw addressError(404, 'ADDRESS_NOT_FOUND', 'Không tìm thấy địa chỉ được yêu cầu.')

    const row = await db.prepare(`
      SELECT * FROM user_addresses
      WHERE id = ? AND user_id = ? AND deleted_at_utc IS NULL
    `).bind(addressId, user.id).first()

    if (!row) {
      throw addressError(404, 'ADDRESS_NOT_FOUND', 'Không tìm thấy địa chỉ được yêu cầu.')
    }

    const currentRecipient = await decryptFulfilmentValue(row.recipient_ciphertext, fulfilmentKey)
    const currentAddress = await decryptFulfilmentValue(row.address_ciphertext, fulfilmentKey)

    const normalized = normalizeAddressPayload(payload, { isPartial: true })

    const updatedLabel = payload.label !== undefined ? normalized.label : row.label
    const updatedRecipientName = normalized.recipientName ?? currentRecipient.name
    const updatedRecipientPhone = normalized.recipientPhone ?? currentRecipient.phone
    const updatedCity = normalized.city ?? currentAddress.city
    const updatedUnitCode = normalized.unitCode ?? currentAddress.unitCode
    const updatedWard = normalized.ward ?? (normalized.unitCode ? undefined : currentAddress.ward)
    const updatedDetail = normalized.detail ?? currentAddress.detail
    const location = validateHcmcDeliveryAddress({ city: updatedCity, detail: updatedDetail, unitCode: updatedUnitCode, ward: updatedWard })
    if (Object.keys(location.errors).length) {
      throw addressError(400, location.rejectionCode || 'INVALID_PAYLOAD', 'Vui lòng chọn đơn vị hành chính hiện hành trước khi lưu.', location.errors)
    }
    const updatedDeliveryNote = payload.deliveryNote !== undefined || payload.note !== undefined
      ? normalized.deliveryNote
      : (currentAddress.deliveryNote || '')

    const setAsDefault = normalized.isDefault === true
    const now = new Date().toISOString()

    const recipientCiphertext = await encryptFulfilmentValue({
      name: updatedRecipientName,
      phone: updatedRecipientPhone,
    }, fulfilmentKey)

    const addressCiphertext = await encryptFulfilmentValue({
      city: updatedCity,
      deliveryNote: updatedDeliveryNote,
      detail: updatedDetail,
      district: '',
      unitCode: updatedUnitCode,
      ward: location.unit.name,
    }, fulfilmentKey)

    if (setAsDefault) {
      await db.batch([
        db.prepare(`
          UPDATE user_addresses
          SET is_default = 0, updated_at_utc = ?
          WHERE user_id = ? AND deleted_at_utc IS NULL
        `).bind(now, user.id),
        db.prepare(`
          UPDATE user_addresses
          SET label = ?, recipient_ciphertext = ?, address_ciphertext = ?, is_default = 1, updated_at_utc = ?
          WHERE id = ? AND user_id = ?
        `).bind(
          updatedLabel,
          recipientCiphertext,
          addressCiphertext,
          now,
          addressId,
          user.id,
        ),
      ])
    } else {
      await db.prepare(`
        UPDATE user_addresses
        SET label = ?, recipient_ciphertext = ?, address_ciphertext = ?, updated_at_utc = ?
        WHERE id = ? AND user_id = ?
      `).bind(
        updatedLabel,
        recipientCiphertext,
        addressCiphertext,
        now,
        addressId,
        user.id,
      ).run()
    }

    return {
      address: {
        city: updatedCity,
        deliveryNote: updatedDeliveryNote,
        detail: updatedDetail,
        district: '',
        unitCode: updatedUnitCode,
        ward: location.unit.name,
      },
      city: updatedCity,
      createdAtUtc: row.created_at_utc,
      deliveryNote: updatedDeliveryNote,
      detail: updatedDetail,
      district: '',
      unitCode: updatedUnitCode,
      id: addressId,
      isDefault: setAsDefault ? true : Boolean(row.is_default),
      label: updatedLabel,
      recipient: {
        name: updatedRecipientName,
        phone: updatedRecipientPhone,
      },
      recipientName: updatedRecipientName,
      recipientPhone: updatedRecipientPhone,
      updatedAtUtc: now,
      ward: location.unit.name,
    }
  }

  async function deleteForUser(user, addressId) {
    if (!user?.id) throw addressError(401, 'AUTHENTICATION_REQUIRED', 'Yêu cầu xác thực người dùng.')
    if (!addressId) throw addressError(404, 'ADDRESS_NOT_FOUND', 'Không tìm thấy địa chỉ được yêu cầu.')

    const row = await db.prepare(`
      SELECT * FROM user_addresses
      WHERE id = ? AND user_id = ? AND deleted_at_utc IS NULL
    `).bind(addressId, user.id).first()

    if (!row) {
      throw addressError(404, 'ADDRESS_NOT_FOUND', 'Không tìm thấy địa chỉ được yêu cầu.')
    }

    const wasDefault = row.is_default === 1
    const now = new Date().toISOString()

    if (wasDefault) {
      const nextDefaultRow = await db.prepare(`
        SELECT id FROM user_addresses
        WHERE user_id = ? AND id != ? AND deleted_at_utc IS NULL
        ORDER BY created_at_utc DESC
        LIMIT 1
      `).bind(user.id, addressId).first()

      if (nextDefaultRow?.id) {
        await db.batch([
          db.prepare(`
            UPDATE user_addresses
            SET deleted_at_utc = ?, is_default = 0, updated_at_utc = ?
            WHERE id = ? AND user_id = ?
          `).bind(now, now, addressId, user.id),
          db.prepare(`
            UPDATE user_addresses
            SET is_default = 1, updated_at_utc = ?
            WHERE id = ? AND user_id = ?
          `).bind(now, nextDefaultRow.id, user.id),
        ])
      } else {
        await db.prepare(`
          UPDATE user_addresses
          SET deleted_at_utc = ?, is_default = 0, updated_at_utc = ?
          WHERE id = ? AND user_id = ?
        `).bind(now, now, addressId, user.id).run()
      }
    } else {
      await db.prepare(`
        UPDATE user_addresses
        SET deleted_at_utc = ?, updated_at_utc = ?
        WHERE id = ? AND user_id = ?
      `).bind(now, now, addressId, user.id).run()
    }

    return { id: addressId, success: true }
  }

  async function setDefaultForUser(user, addressId) {
    if (!user?.id) throw addressError(401, 'AUTHENTICATION_REQUIRED', 'Yêu cầu xác thực người dùng.')
    if (!addressId) throw addressError(404, 'ADDRESS_NOT_FOUND', 'Không tìm thấy địa chỉ được yêu cầu.')

    const row = await db.prepare(`
      SELECT * FROM user_addresses
      WHERE id = ? AND user_id = ? AND deleted_at_utc IS NULL
    `).bind(addressId, user.id).first()

    if (!row) {
      throw addressError(404, 'ADDRESS_NOT_FOUND', 'Không tìm thấy địa chỉ được yêu cầu.')
    }

    const now = new Date().toISOString()
    await db.batch([
      db.prepare(`
        UPDATE user_addresses
        SET is_default = 0, updated_at_utc = ?
        WHERE user_id = ? AND deleted_at_utc IS NULL
      `).bind(now, user.id),
      db.prepare(`
        UPDATE user_addresses
        SET is_default = 1, updated_at_utc = ?
        WHERE id = ? AND user_id = ?
      `).bind(now, addressId, user.id),
    ])

    const decryptedRecipient = await decryptFulfilmentValue(row.recipient_ciphertext, fulfilmentKey)
    const decryptedAddress = await decryptFulfilmentValue(row.address_ciphertext, fulfilmentKey)
    const updatedRow = { ...row, is_default: 1, updated_at_utc: now }
    return formatAddressDto(updatedRow, decryptedRecipient, decryptedAddress)
  }

  return {
    createForUser,
    deleteForUser,
    getForUser,
    listForUser,
    setDefaultForUser,
    updateForUser,
  }
}
