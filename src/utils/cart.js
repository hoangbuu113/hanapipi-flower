export function normalizeGiftAddOns(value) {
  if (!Array.isArray(value)) return []

  return value
    .filter((addOn) => addOn && typeof addOn.id === 'string' && typeof addOn.name === 'string')
    .map((addOn) => ({
      id: addOn.id,
      name: addOn.name,
      price: Number.isFinite(Number(addOn.price)) ? Math.max(0, Number(addOn.price)) : 0,
    }))
}

export { normalizeStoredCartItem, normalizeStoredCartItems, normalizeStoredGiftAddOns } from './cartStorage'

export function giftAddOnsSubtotal(item) {
  return normalizeGiftAddOns(item?.giftAddOns).reduce((total, addOn) => total + addOn.price, 0)
}

export function cartItemUnitTotal(item) {
  if (item?.isAvailable === false) return 0
  const basePrice = Number.isFinite(Number(item?.unitPrice)) ? Number(item.unitPrice) : 0
  return basePrice + giftAddOnsSubtotal(item)
}

export function cartItemLineTotal(item) {
  if (item?.isAvailable === false) return 0
  const quantity = Number.isFinite(Number(item?.quantity)) ? Math.max(0, Number(item.quantity)) : 0
  return cartItemUnitTotal(item) * quantity
}

export function buildCartItemKey({ productId, sizeId, wrappingId, giftAddOns }) {
  const addOnKey = normalizeGiftAddOns(giftAddOns)
    .map((addOn) => addOn.id)
    .sort()
    .join(',')

  return `${productId}:${sizeId}:${wrappingId ?? ''}:${addOnKey}`
}

export function cartSubtotal(items) {
  return items.reduce((total, item) => total + cartItemLineTotal(item), 0)
}

export function cartHasGiftAddOn(items, addOnId) {
  return items.some((item) => normalizeGiftAddOns(item.giftAddOns).some((addOn) => addOn.id === addOnId))
}
