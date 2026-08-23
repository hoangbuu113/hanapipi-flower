import { products } from '../data/products'

export function getCartItemPresentation(item) {
  if (item.custom) {
    return {
      details: `${item.style} · ${item.palette} · ${item.size} · ${item.flowers.join(', ')} · ${item.wrapping}`,
      name: item.name,
    }
  }
  const product = products.find((entry) => entry.id === item.productId)
  const size = product?.sizeOptions.find((option) => option.id === item.sizeId)
  const wrapping = product?.wrappingOptions?.find((option) => option.id === item.wrappingId)
  return {
    details: [size?.label, wrapping?.label].filter(Boolean).join(' · '),
    name: product?.name ?? 'Bó hoa Hanapipi',
  }
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
