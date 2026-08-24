import { products } from '../data/products'
import { normalizeGiftAddOns } from './cart'

export function getCartItemPresentation(item) {
  if (item.custom) {
    return {
      details: `${item.style} · ${item.palette} · ${item.size} · ${item.flowers.join(', ')} · ${item.wrapping}`,
      giftAddOns: [],
      name: item.name,
    }
  }
  const product = products.find((entry) => entry.id === item.productId)
  const size = product?.sizeOptions.find((option) => option.id === item.sizeId)
  const wrapping = product?.wrappingOptions?.find((option) => option.id === item.wrappingId)
  return {
    details: [size?.label, wrapping?.label].filter(Boolean).join(' · '),
    giftAddOns: normalizeGiftAddOns(item.giftAddOns),
    name: product?.name ?? 'Bó hoa Hanapipi',
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
