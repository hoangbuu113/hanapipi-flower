import { normalizeGiftAddOns } from './cart'

export function getCartItemPresentation(item) {
  if (!item) return { details: '', giftAddOns: [], name: '' }
  if (item.custom) {
    return {
      details: `${item.style} · ${item.palette} · ${item.size} · ${item.flowers.join(', ')} · ${item.wrapping}`,
      giftAddOns: [],
      name: item.name,
    }
  }
  const size = (item.size && typeof item.size === 'object' && item.size.label)
    ? item.size
    : (item.sizeOptions?.find((option) => option.id === item.sizeId) ?? null)
  const wrapping = (item.wrapping && typeof item.wrapping === 'object' && item.wrapping.label)
    ? item.wrapping
    : (item.wrappingOptions?.find((option) => option.id === item.wrappingId) ?? null)

  const sizeLabel = typeof item.size === 'string' ? item.size : size?.label
  const wrappingLabel = typeof item.wrapping === 'string' ? item.wrapping : wrapping?.label

  return {
    details: [sizeLabel, wrappingLabel].filter(Boolean).join(' · '),
    giftAddOns: normalizeGiftAddOns(item.giftAddOns),
    name: item.name || 'Bó hoa Hanapipi',
  }
}

export function getOrderGifting(order) {
  const gifting = order?.gifting && typeof order.gifting === 'object' ? order.gifting : {}
  const anonymous = Boolean(gifting.anonymous)

  return {
    anonymous,
    includesHandwrittenCard: Boolean(gifting.includesHandwrittenCard),
    message: typeof gifting.message === 'string'
      ? gifting.message
      : (typeof order?.message === 'string' ? order.message : ''),
    senderName: anonymous || typeof gifting.senderName !== 'string' ? '' : gifting.senderName,
  }
}

export function getOrderGiftAddOns(order) {
  const uniqueAddOns = new Map()
  const items = Array.isArray(order?.items) ? order.items : []

  items.forEach((item) => {
    normalizeGiftAddOns(item.giftAddOns).forEach((addOn) => uniqueAddOns.set(addOn.id, addOn))
  })

  return [...uniqueAddOns.values()]
}

export function createOrderCode() {
  const now = new Date()
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const suffix = String(Math.floor(1000 + Math.random() * 9000))
  return `HF-${date}-${suffix}`
}

export function formatDeliveryDate(value) {
  if (!value) return 'Chưa chọn ngày'
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${value}T12:00:00`))
}

const DELIVERY_SLOT_LABELS = {
  afternoon: 'Buổi chiều',
  evening: 'Buổi tối',
  morning: 'Buổi sáng',
}

export function formatDeliverySlot(slot) {
  if (!slot) return 'Chưa chọn khung giờ'
  return DELIVERY_SLOT_LABELS[slot] ?? slot
}

export function formatOrderStatus(status) {
  switch (status) {
    case 'received':
      return 'Đã tiếp nhận'
    case 'confirmed':
      return 'Đã xác nhận'
    case 'processing':
    case 'preparing':
      return 'Đang chuẩn bị'
    case 'delivering':
    case 'out_for_delivery':
      return 'Đang giao'
    case 'completed':
      return 'Hoàn tất'
    case 'cancelled':
      return 'Đã hủy'
    default:
      return status || 'Đã ghi nhận'
  }
}

export function formatPaymentStatus(status) {
  switch (status) {
    case 'mock_pending':
    case 'pending':
      return 'Chờ thanh toán'
    case 'paid':
      return 'Đã thanh toán'
    case 'failed':
      return 'Thanh toán thất bại'
    case 'cancelled':
    case 'mock_cancelled':
      return 'Đã hủy'
    default:
      return status || 'Chờ xử lý'
  }
}

export function formatPaymentMethod(method) {
  switch (method) {
    case 'bank_transfer':
    case 'bank_transfer_mock':
      return 'Chuyển khoản ngân hàng'
    case 'cod':
    case 'cod_mock':
      return 'Thanh toán khi nhận hoa'
    default:
      return method || 'Chuyển khoản ngân hàng'
  }
}

export function formatOrderAuditEvent(event) {
  if (event?.action === 'order_payment_confirmed') {
    return `Xác nhận thanh toán: ${formatPaymentStatus('pending')} → ${formatPaymentStatus('paid')}`
  }
  if (event?.action === 'order_status_updated') {
    return `Đơn hàng: ${formatOrderStatus(event.statusBefore)} → ${formatOrderStatus(event.statusAfter)}`
  }
  return 'Cập nhật đơn hàng.'
}
