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

export function normalizeStoredCartItems(items, isPurchasableProductId) {
  if (!Array.isArray(items)) return []

  return items.reduce((normalizedItems, item) => {
    if (!item) return normalizedItems
    if (item.custom) return [...normalizedItems, item]
    if (!isPurchasableProductId(item.productId)) return normalizedItems

    const giftAddOns = normalizeGiftAddOns(item.giftAddOns)
    const key = buildCartItemKey({ ...item, giftAddOns })
    const quantity = Number.isFinite(Number(item.quantity)) ? Math.max(1, Number(item.quantity)) : 1
    const matchingIndex = normalizedItems.findIndex((entry) => entry.key === key)
    if (matchingIndex < 0) return [...normalizedItems, { ...item, key, quantity, giftAddOns }]

    return normalizedItems.map((entry, index) => index === matchingIndex
      ? { ...entry, quantity: entry.quantity + quantity }
      : entry)
  }, [])
}

export function giftAddOnsSubtotal(item) {
  return normalizeGiftAddOns(item?.giftAddOns).reduce((total, addOn) => total + addOn.price, 0)
}

export function cartItemUnitTotal(item) {
  const basePrice = Number.isFinite(Number(item?.unitPrice)) ? Number(item.unitPrice) : 0
  return basePrice + giftAddOnsSubtotal(item)
}

export function cartItemLineTotal(item) {
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
