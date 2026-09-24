import {
  FULFILMENT_KEY_VERSION,
  decryptFulfilmentValue,
  encryptFulfilmentValue,
} from '../fulfilmentCrypto.js'

const PHONE_PATTERN = /^(0\d{9}|\+84\d{9})$/u

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

  let city = undefined
  if (payload.city !== undefined || payload.address?.city !== undefined || !isPartial) {
    const val = payload.city ?? payload.address?.city
    if (typeof val !== 'string' || !val.trim() || val.trim().length > 120) {
      fieldErrors.city = 'Vui lòng chọn tỉnh hoặc thành phố.'
    } else {
      city = val.trim()
    }
  }

  let district = undefined
  if (payload.district !== undefined || payload.address?.district !== undefined || !isPartial) {
    const val = payload.district ?? payload.address?.district
    if (typeof val !== 'string' || !val.trim() || val.trim().length > 120) {
      fieldErrors.district = 'Vui lòng chọn quận hoặc huyện.'
    } else {
      district = val.trim()
    }
  }

  let ward = undefined
  if (payload.ward !== undefined || payload.address?.ward !== undefined || !isPartial) {
    const val = payload.ward ?? payload.address?.ward
    if (typeof val !== 'string' || !val.trim() || val.trim().length > 120) {
      fieldErrors.ward = 'Vui lòng chọn phường hoặc xã.'
    } else {
      ward = val.trim()
    }
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
    throw addressError(400, 'INVALID_PAYLOAD', 'Dữ liệu địa chỉ chưa hợp lệ.', fieldErrors)
  }

  return {
    city,
    deliveryNote,
    detail,
    district,
    isDefault,
    label,
    recipientName,
    recipientPhone,
    ward,
  }
}

function formatAddressDto(row, decryptedRecipient, decryptedAddress) {
  return {
    address: {
      city: decryptedAddress.city,
      deliveryNote: decryptedAddress.deliveryNote || '',
      detail: decryptedAddress.detail,
      district: decryptedAddress.district,
      ward: decryptedAddress.ward,
    },
    city: decryptedAddress.city,
    createdAtUtc: row.created_at_utc,
    deliveryNote: decryptedAddress.deliveryNote || '',
    detail: decryptedAddress.detail,
    district: decryptedAddress.district,
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
      ward: normalized.ward,
    }, fulfilmentKey)

    if (makeDefault && existingCount > 0) {
      await db.batch([
        db.prepare(`
          UPDATE user_addresses
          SET is_default = 0, updated_at_utc = ?
          WHERE user_id = ? AND deleted_at_utc IS NULL
        `).bind(now, user.id),
        db.prepare(`
          INSERT INTO user_addresses (
            id, user_id, label, recipient_ciphertext, address_ciphertext,
            key_version, is_default, created_at_utc, updated_at_utc, deleted_at_utc
          ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)
        `).bind(
          addressId,
          user.id,
          normalized.label,
          recipientCiphertext,
          addressCiphertext,
          FULFILMENT_KEY_VERSION,
          now,
          now,
        ),
      ])
    } else {
      await db.prepare(`
        INSERT INTO user_addresses (
          id, user_id, label, recipient_ciphertext, address_ciphertext,
          key_version, is_default, created_at_utc, updated_at_utc, deleted_at_utc
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `).bind(
        addressId,
        user.id,
        normalized.label,
        recipientCiphertext,
        addressCiphertext,
        FULFILMENT_KEY_VERSION,
        makeDefault ? 1 : 0,
        now,
        now,
      ).run()
    }

    return {
      address: {
        city: normalized.city,
        deliveryNote: normalized.deliveryNote || '',
        detail: normalized.detail,
        district: normalized.district,
        ward: normalized.ward,
      },
      city: normalized.city,
      createdAtUtc: now,
      deliveryNote: normalized.deliveryNote || '',
      detail: normalized.detail,
      district: normalized.district,
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
    const updatedDistrict = normalized.district ?? currentAddress.district
    const updatedWard = normalized.ward ?? currentAddress.ward
    const updatedDetail = normalized.detail ?? currentAddress.detail
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
      district: updatedDistrict,
      ward: updatedWard,
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
        district: updatedDistrict,
        ward: updatedWard,
      },
      city: updatedCity,
      createdAtUtc: row.created_at_utc,
      deliveryNote: updatedDeliveryNote,
      detail: updatedDetail,
      district: updatedDistrict,
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
      ward: updatedWard,
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

