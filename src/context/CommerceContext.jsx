import { useEffect, useMemo, useState } from 'react'
import { CommerceContext } from './commerceStore'
import { getProductById } from '../data/products'
import { isDeliveryDateAvailable } from '../utils/delivery'
import { buildCartItemKey, normalizeGiftAddOns, normalizeStoredCartItems } from '../utils/cart'
import { isPurchasableProduct } from '../utils/productCommerce'
import { normalizeStoredWishlistIds } from '../utils/wishlist'

const cartStorageKey = 'hanapipi-flower:cart'
const wishlistStorageKey = 'hanapipi-flower:wishlist'

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key))
    return value ?? fallback
  } catch {
    return fallback
  }
}

function readCartStorage() {
  const stored = readStorage(cartStorageKey, [])
  const normalizeStoredItems = (items) => normalizeStoredCartItems(
    items,
    (productId) => isPurchasableProduct(getProductById(productId)),
  )

  if (Array.isArray(stored)) return { delivery: { date: null, slot: null }, items: normalizeStoredItems(stored) }
  const storedDelivery = stored?.delivery ?? { date: null, slot: null }
  const delivery = isDeliveryDateAvailable(storedDelivery.date)
    ? storedDelivery
    : { date: null, slot: null }

  return {
    delivery,
    items: Array.isArray(stored?.items) ? normalizeStoredItems(stored.items) : [],
  }
}

export function CommerceProvider({ children }) {
  const [cartState] = useState(readCartStorage)
  const [cartItems, setCartItems] = useState(cartState.items)
  const [deliveryDraft, setDeliveryDraft] = useState(cartState.delivery)
  const [wishlistIds, setWishlistIds] = useState(() => {
    const stored = readStorage(wishlistStorageKey, [])
    return normalizeStoredWishlistIds(stored)
  })
  const [isCartOpen, setIsCartOpen] = useState(false)

  useEffect(() => { window.localStorage.setItem(cartStorageKey, JSON.stringify({ items: cartItems, delivery: deliveryDraft })) }, [cartItems, deliveryDraft])
  useEffect(() => { window.localStorage.setItem(wishlistStorageKey, JSON.stringify(wishlistIds)) }, [wishlistIds])

  const value = useMemo(() => ({
    cartItems,
    wishlistIds,
    isCartOpen,
    deliveryDraft,
    cartCount: cartItems.reduce((total, item) => total + item.quantity, 0),
    toggleWishlist: (productId) => setWishlistIds((ids) => ids.includes(productId) ? ids.filter((id) => id !== productId) : [...ids, productId]),
    addToCart: ({ productId, sizeId, wrappingId, quantity, unitPrice, giftAddOns = [] }) => setCartItems((items) => {
      if (!isPurchasableProduct(getProductById(productId))) return items

      const addOns = normalizeGiftAddOns(giftAddOns)
      const key = buildCartItemKey({ productId, sizeId, wrappingId, giftAddOns: addOns })
      const found = items.find((item) => item.key === key)
      return found
        ? items.map((item) => item.key === key ? { ...item, quantity: item.quantity + quantity } : item)
        : [...items, { key, productId, sizeId, wrappingId, quantity, unitPrice, giftAddOns: addOns }]
    }),
    addCustomBouquet: (bouquet) => setCartItems((items) => [
      ...items,
      { ...bouquet, custom: true, key: `custom:${Date.now()}`, quantity: 1 },
    ]),
    updateQuantity: (key, quantity) => setCartItems((items) => quantity < 1 ? items.filter((item) => item.key !== key) : items.map((item) => item.key === key ? { ...item, quantity } : item)),
    removeGiftAddOn: (key, addOnId) => setCartItems((items) => {
      const selectedItem = items.find((item) => item.key === key)
      if (!selectedItem || selectedItem.custom) return items

      const giftAddOns = normalizeGiftAddOns(selectedItem.giftAddOns).filter((addOn) => addOn.id !== addOnId)
      const nextKey = buildCartItemKey({ ...selectedItem, giftAddOns })
      const matchingItem = items.find((item) => item.key === nextKey && item.key !== key)

      if (matchingItem) {
        return items
          .filter((item) => item.key !== key)
          .map((item) => item.key === nextKey ? { ...item, quantity: item.quantity + selectedItem.quantity } : item)
      }

      return items.map((item) => item.key === key ? { ...item, key: nextKey, giftAddOns } : item)
    }),
    removeFromCart: (key) => setCartItems((items) => items.filter((item) => item.key !== key)),
    setDeliveryDraft: (draft) => setDeliveryDraft(draft),
    clearCart: () => {
      setCartItems([])
      setDeliveryDraft({ date: null, slot: null })
    },
    openCart: () => setIsCartOpen(true),
    closeCart: () => setIsCartOpen(false),
  }), [cartItems, deliveryDraft, isCartOpen, wishlistIds])

  return <CommerceContext.Provider value={value}>{children}</CommerceContext.Provider>
}
