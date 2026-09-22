import { buildCartItemKey, normalizeGiftAddOns } from './cart'

export function normalizeStoredGiftAddOns(value) {
  if (!Array.isArray(value)) return []

  return value
    .filter((addOn) => addOn && (typeof addOn === 'string' || (typeof addOn === 'object' && typeof addOn.id === 'string')))
    .map((addOn) => {
      if (typeof addOn === 'string') {
        return { id: addOn.trim() }
      }
      return {
        id: addOn.id.trim(),
        name: typeof addOn.name === 'string' ? addOn.name : undefined,
        price: Number.isFinite(Number(addOn.price)) ? Math.max(0, Number(addOn.price)) : 0,
      }
    })
    .filter((addOn) => addOn.id.length > 0)
}

export function normalizeStoredCartItem(rawItem) {
  if (!rawItem || typeof rawItem !== 'object') return null

  // Preserve custom bouquet lines
  if (rawItem.custom) {
    const quantity = Number.isFinite(Number(rawItem.quantity))
      ? Math.max(1, Math.floor(Number(rawItem.quantity)))
      : 1
    const key = typeof rawItem.key === 'string' && rawItem.key.length > 0
      ? rawItem.key
      : `custom:${Date.now()}`
    return {
      ...rawItem,
      key,
      quantity,
    }
  }

  // Extract stable product identifier (handles legacy nested product objects or flat keys)
  const rawProductId = rawItem.productId
    ?? rawItem.id
    ?? rawItem.slug
    ?? rawItem.product?.id
    ?? rawItem.product?.slug

  if (typeof rawProductId !== 'string' || rawProductId.trim().length === 0) {
    return null
  }
  const productId = rawProductId.trim()

  // Extract size / variant identifier
  const rawSizeId = rawItem.sizeId
    ?? rawItem.size?.id
    ?? rawItem.size?.code
    ?? (typeof rawItem.size === 'string' ? rawItem.size : undefined)
    ?? 'standard'
  const sizeId = typeof rawSizeId === 'string' ? rawSizeId.trim() : 'standard'

  // Extract wrapping identifier
  const rawWrappingId = rawItem.wrappingId
    ?? rawItem.wrapping?.id
    ?? rawItem.wrapping?.code
    ?? (typeof rawItem.wrapping === 'string' ? rawItem.wrapping : undefined)
    ?? null
  const wrappingId = typeof rawWrappingId === 'string' && rawWrappingId.trim().length > 0
    ? rawWrappingId.trim()
    : null

  // Extract gift add-ons
  const giftAddOns = normalizeStoredGiftAddOns(rawItem.giftAddOns)

  // Quantity
  const quantity = Number.isFinite(Number(rawItem.quantity))
    ? Math.max(1, Math.floor(Number(rawItem.quantity)))
    : 1

  // Stable key
  const key = buildCartItemKey({
    giftAddOns: normalizeGiftAddOns(giftAddOns),
    productId,
    sizeId,
    wrappingId,
  })

  return {
    giftAddOns,
    key,
    productId,
    quantity,
    sizeId,
    wrappingId,
  }
}

export function normalizeStoredCartItems(items, legacyFilterFn) {
  if (!Array.isArray(items)) return []

  return items.reduce((normalizedItems, rawItem) => {
    const item = normalizeStoredCartItem(rawItem)
    if (!item) return normalizedItems

    // If an explicit filter was supplied (e.g. from legacy tests), respect it
    if (typeof legacyFilterFn === 'function' && !item.custom && !legacyFilterFn(item.productId)) {
      return normalizedItems
    }

    const matchingIndex = normalizedItems.findIndex((entry) => entry.key === item.key)
    if (matchingIndex < 0) {
      return [...normalizedItems, item]
    }

    return normalizedItems.map((entry, index) => (index === matchingIndex
      ? { ...entry, quantity: entry.quantity + item.quantity }
      : entry))
  }, [])
}
