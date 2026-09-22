import {
  FULFILMENT_KEY_VERSION,
  encryptFulfilmentValue,
} from '../fulfilmentCrypto.js'

const MAX_ITEMS = 20
const MAX_QUANTITY = 20
const PAYMENT_METHODS = new Set(['bank_transfer_mock', 'cod_mock'])
const PHONE_PATTERN = /^(0\d{9}|\+84\d{9})$/u

function orderError(status, code, message, fieldErrors) {
  const error = new Error(message)
  error.code = code
  error.status = status
  if (fieldErrors) error.fieldErrors = fieldErrors
  return error
}

function cleanString(value, { field, max, required = true } = {}) {
  if (typeof value !== 'string') {
    if (!required && value == null) return ''
    throw orderError(400, 'INVALID_ORDER', 'Thông tin đặt hoa chưa đầy đủ.', { [field]: 'Thông tin không hợp lệ.' })
  }
  const result = value.trim()
  if ((required && !result) || result.length > max) {
    throw orderError(400, 'INVALID_ORDER', 'Thông tin đặt hoa chưa đầy đủ.', { [field]: 'Thông tin không hợp lệ.' })
  }
  return result
}

function normalizePhone(value, field) {
  const phone = cleanString(value, { field, max: 24 }).replaceAll(/\s/gu, '')
  if (!PHONE_PATTERN.test(phone)) {
    throw orderError(400, 'INVALID_ORDER', 'Số điện thoại chưa hợp lệ.', { [field]: 'Vui lòng nhập số điện thoại Việt Nam hợp lệ.' })
  }
  return phone
}

function normalizeEmail(value) {
  const email = cleanString(value, { field: 'buyer.email', max: 254, required: false })
  if (email && !/^\S+@\S+\.\S+$/u.test(email)) {
    throw orderError(400, 'INVALID_ORDER', 'Địa chỉ email chưa hợp lệ.', { 'buyer.email': 'Vui lòng kiểm tra lại email.' })
  }
  return email
}

function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function normalizePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw orderError(400, 'INVALID_ORDER', 'Dữ liệu đơn hoa không hợp lệ.')
  }
  if (!Array.isArray(payload.items) || payload.items.length < 1 || payload.items.length > MAX_ITEMS) {
    throw orderError(400, 'INVALID_ORDER_ITEMS', 'Giỏ hoa cần có từ 1 đến 20 sản phẩm.')
  }

  const items = payload.items.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw orderError(400, 'INVALID_ORDER_ITEM', `Sản phẩm thứ ${index + 1} không hợp lệ.`)
    }
    const productId = cleanString(item.productId, { field: `items.${index}.productId`, max: 100 })
    const sizeId = cleanString(item.sizeId, { field: `items.${index}.sizeId`, max: 100 })
    const wrappingId = cleanString(item.wrappingId, {
      field: `items.${index}.wrappingId`,
      max: 100,
      required: false,
    }) || null
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY) {
      throw orderError(400, 'INVALID_QUANTITY', 'Số lượng mỗi sản phẩm phải từ 1 đến 20.', {
        [`items.${index}.quantity`]: 'Số lượng không hợp lệ.',
      })
    }
    if (!Array.isArray(item.giftAddOnIds) || item.giftAddOnIds.length > 8) {
      throw orderError(400, 'INVALID_GIFT_ADD_ON', 'Danh sách quà tặng không hợp lệ.')
    }
    const giftAddOnIds = [...new Set(item.giftAddOnIds.map((id) => cleanString(id, {
      field: `items.${index}.giftAddOnIds`,
      max: 100,
    })))]
    if (giftAddOnIds.length !== item.giftAddOnIds.length) {
      throw orderError(400, 'INVALID_GIFT_ADD_ON', 'Danh sách quà tặng có lựa chọn trùng lặp.')
    }
    return { giftAddOnIds, productId, quantity: item.quantity, sizeId, wrappingId }
  })

  const buyer = {
    email: normalizeEmail(payload.buyer?.email),
    name: cleanString(payload.buyer?.name, { field: 'buyer.name', max: 120 }),
    phone: normalizePhone(payload.buyer?.phone, 'buyer.phone'),
  }
  const recipient = {
    name: cleanString(payload.recipient?.name, { field: 'recipient.name', max: 120 }),
    phone: normalizePhone(payload.recipient?.phone, 'recipient.phone'),
  }
  const address = {
    city: cleanString(payload.address?.city, { field: 'address.city', max: 120 }),
    detail: cleanString(payload.address?.detail, { field: 'address.detail', max: 240 }),
    district: cleanString(payload.address?.district, { field: 'address.district', max: 120 }),
    ward: cleanString(payload.address?.ward, { field: 'address.ward', max: 120 }),
  }
  const date = cleanString(payload.delivery?.date, { field: 'delivery.date', max: 10 })
  if (!isCalendarDate(date)) {
    throw orderError(400, 'INVALID_DELIVERY', 'Ngày giao hoa không hợp lệ.', { 'delivery.date': 'Ngày giao không hợp lệ.' })
  }
  const delivery = {
    date,
    slot: cleanString(payload.delivery?.slot, { field: 'delivery.slot', max: 80 }),
  }
  const gifting = {
    anonymous: Boolean(payload.gifting?.anonymous),
    message: cleanString(payload.gifting?.message, { field: 'gifting.message', max: 200, required: false }),
    senderName: cleanString(payload.gifting?.senderName, { field: 'gifting.senderName', max: 60, required: false }),
  }
  if (gifting.anonymous) gifting.senderName = ''

  const paymentMethod = payload.paymentMethod
  if (!PAYMENT_METHODS.has(paymentMethod)) {
    throw orderError(400, 'INVALID_PAYMENT_METHOD', 'Phương thức thanh toán không hợp lệ.')
  }

  return { address, buyer, delivery, gifting, items, paymentMethod, recipient }
}

function createId(prefix) {
  return `${prefix}_${globalThis.crypto.randomUUID().replaceAll('-', '')}`
}

function createOrderCode(now) {
  const date = now.toISOString().slice(0, 10).replaceAll('-', '')
  const suffix = globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()
  return `HF-${date}-${suffix}`
}

function paymentLabel(paymentMethod) {
  return paymentMethod === 'cod_mock' ? 'Thanh toán khi nhận hoa' : 'Chuyển khoản ngân hàng'
}

export function createOrderRepository(db, options = {}) {
  if (!db?.prepare || !db?.batch) throw new TypeError('A D1-compatible database binding is required.')
  const catalogue = options.catalogue
  if (!catalogue) throw new TypeError('Catalogue repository is required.')
  const now = options.now ?? (() => new Date())

  return {
    async createForUser(user, payload) {
      if (!user?.id) throw new TypeError('Authenticated D1 user is required.')
      const orderInput = normalizePayload(payload)
      const allGiftAddOns = await catalogue.getGiftAddOns({ activeOnly: false })
      const giftAddOnById = new Map(allGiftAddOns.map((gift) => [gift.id, gift]))
      const canonicalItems = []

      for (const [index, requestedItem] of orderInput.items.entries()) {
        const product = (await catalogue.getProductById(requestedItem.productId))
          ?? (await catalogue.getProductBySlug(requestedItem.productId))
        if (!product) {
          throw orderError(400, 'PRODUCT_NOT_FOUND', `Không tìm thấy sản phẩm thứ ${index + 1}.`)
        }
        if (!product.active || !product.isPurchasable || product.purchaseType !== 'standard'
          || product.id === 'no-watering-flower' || product.slug === 'no-watering-flower') {
          throw orderError(409, 'PRODUCT_UNAVAILABLE', `${product.name} hiện không thể đặt mua.`)
        }

        const variants = await catalogue.getProductVariants(product.id, { activeOnly: false })
        const size = variants.find((variant) => variant.optionType === 'size'
          && (variant.id === requestedItem.sizeId || variant.code === requestedItem.sizeId))
        if (!size || !size.active || !Number.isInteger(size.priceVnd) || size.priceVnd < 0) {
          throw orderError(409, 'SIZE_UNAVAILABLE', `Kích thước đã chọn cho ${product.name} không còn khả dụng.`)
        }

        let wrapping = null
        if (requestedItem.wrappingId) {
          wrapping = variants.find((variant) => variant.optionType === 'wrapping'
            && (variant.id === requestedItem.wrappingId || variant.code === requestedItem.wrappingId))
          if (!wrapping || !wrapping.active) {
            throw orderError(409, 'WRAPPING_UNAVAILABLE', `Kiểu gói đã chọn cho ${product.name} không còn khả dụng.`)
          }
        }

        const gifts = requestedItem.giftAddOnIds.map((giftId) => {
          const gift = giftAddOnById.get(giftId)
          if (!gift || !gift.active) {
            throw orderError(409, 'GIFT_ADD_ON_UNAVAILABLE', 'Một món quà đã chọn không còn khả dụng.')
          }
          return gift
        })
        const giftsTotalVnd = gifts.reduce((total, gift) => total + gift.priceVnd, 0)
        const unitTotalVnd = size.priceVnd + giftsTotalVnd
        const lineTotalVnd = unitTotalVnd * requestedItem.quantity

        canonicalItems.push({
          composition: product.composition,
          gifts,
          lineTotalVnd,
          product,
          quantity: requestedItem.quantity,
          size,
          unitTotalVnd,
          wrapping,
        })
      }

      const createdAt = now()
      const timestamp = createdAt.toISOString()
      const orderId = createId('ord')
      const orderCode = createOrderCode(createdAt)
      const subtotalVnd = canonicalItems.reduce((total, item) => total + item.lineTotalVnd, 0)
      const fulfilmentKey = options.fulfilmentKey
      const [buyerCiphertext, recipientCiphertext, addressCiphertext, giftingCiphertext] = await Promise.all([
        encryptFulfilmentValue(orderInput.buyer, fulfilmentKey),
        encryptFulfilmentValue(orderInput.recipient, fulfilmentKey),
        encryptFulfilmentValue(orderInput.address, fulfilmentKey),
        encryptFulfilmentValue(orderInput.gifting, fulfilmentKey),
      ])

      const statements = [db.prepare(`
        INSERT INTO orders (
          id, user_id, order_code, status, revision, subtotal_vnd, total_vnd, currency,
          delivery_date, delivery_slot_id, buyer_contact_ciphertext, recipient_ciphertext,
          delivery_address_ciphertext, gift_message_ciphertext, fulfilment_key_version,
          fulfilment_metadata_json, payment_method, payment_status, created_at_utc, updated_at_utc
        ) VALUES (
          ?, ?, ?, 'received', 0, ?, ?, 'VND',
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, 'mock_pending', ?, ?
        )
      `).bind(
        orderId,
        user.id,
        orderCode,
        subtotalVnd,
        subtotalVnd,
        orderInput.delivery.date,
        orderInput.delivery.slot,
        buyerCiphertext,
        recipientCiphertext,
        addressCiphertext,
        giftingCiphertext,
        FULFILMENT_KEY_VERSION,
        JSON.stringify({ anonymousSender: orderInput.gifting.anonymous, version: 1 }),
        orderInput.paymentMethod,
        timestamp,
        timestamp,
      )]

      const responseItems = []
      for (const item of canonicalItems) {
        const orderItemId = createId('ori')
        const sizeSnapshot = {
          code: item.size.code,
          id: item.size.id,
          label: item.size.label,
          priceVnd: item.size.priceVnd,
        }
        const wrappingSnapshot = item.wrapping ? {
          code: item.wrapping.code,
          id: item.wrapping.id,
          label: item.wrapping.label,
        } : null
        statements.push(db.prepare(`
          INSERT INTO order_items (
            id, order_id, product_id, item_type, product_slug_snapshot,
            product_name_snapshot, options_snapshot_json, composition_snapshot_json,
            unit_price_vnd, quantity, line_total_vnd
          ) VALUES (?, ?, ?, 'product', ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          orderItemId,
          orderId,
          item.product.id,
          item.product.slug,
          item.product.name,
          JSON.stringify({ size: sizeSnapshot, wrapping: wrappingSnapshot }),
          JSON.stringify(item.composition),
          item.unitTotalVnd,
          item.quantity,
          item.lineTotalVnd,
        ))

        const responseGifts = item.gifts.map((gift) => {
          statements.push(db.prepare(`
            INSERT INTO order_item_add_ons (
              id, order_item_id, gift_add_on_id, add_on_id_snapshot,
              add_on_name_snapshot, price_vnd
            ) VALUES (?, ?, ?, ?, ?, ?)
          `).bind(createId('oia'), orderItemId, gift.id, gift.id, gift.name, gift.priceVnd))
          return { id: gift.id, name: gift.name, price: gift.priceVnd, priceVnd: gift.priceVnd }
        })

        responseItems.push({
          giftAddOns: responseGifts,
          key: orderItemId,
          lineTotal: item.lineTotalVnd,
          lineTotalVnd: item.lineTotalVnd,
          name: item.product.name,
          productId: item.product.id,
          quantity: item.quantity,
          size: { ...sizeSnapshot, price: sizeSnapshot.priceVnd },
          slug: item.product.slug,
          unitPrice: item.unitTotalVnd,
          unitTotalVnd: item.unitTotalVnd,
          wrapping: wrappingSnapshot,
        })
      }

      await db.batch(statements)

      return {
        address: orderInput.address,
        buyer: orderInput.buyer,
        code: orderCode,
        createdAtUtc: timestamp,
        currency: 'VND',
        delivery: orderInput.delivery,
        gifting: orderInput.gifting,
        id: orderId,
        items: responseItems,
        orderCode,
        payment: paymentLabel(orderInput.paymentMethod),
        paymentMethod: orderInput.paymentMethod,
        paymentStatus: 'mock_pending',
        receiver: orderInput.recipient,
        status: 'received',
        subtotalVnd,
        timestamp,
        total: subtotalVnd,
        totalVnd: subtotalVnd,
      }
    },
  }
}
