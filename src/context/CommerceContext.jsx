import { useEffect, useMemo, useState } from 'react'
import { CommerceContext } from './commerceStore'
import { isDeliveryDateAvailable } from '../utils/delivery'

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
  if (Array.isArray(stored)) return { delivery: { date: null, slot: null }, items: stored }
  const storedDelivery = stored?.delivery ?? { date: null, slot: null }
  const delivery = isDeliveryDateAvailable(storedDelivery.date)
    ? storedDelivery
    : { date: null, slot: null }

  return {
    delivery,
    items: Array.isArray(stored?.items) ? stored.items : [],
  }
}

export function CommerceProvider({ children }) {
  const [cartState] = useState(readCartStorage)
  const [cartItems, setCartItems] = useState(cartState.items)
  const [deliveryDraft, setDeliveryDraft] = useState(cartState.delivery)
  const [wishlistIds, setWishlistIds] = useState(() => {
    const stored = readStorage(wishlistStorageKey, [])
    return Array.isArray(stored) ? stored : []
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
    addToCart: ({ productId, sizeId, wrappingId, quantity, unitPrice }) => setCartItems((items) => {
      const key = `${productId}:${sizeId}:${wrappingId ?? ''}`
      const found = items.find((item) => item.key === key)
      return found
        ? items.map((item) => item.key === key ? { ...item, quantity: item.quantity + quantity } : item)
        : [...items, { key, productId, sizeId, wrappingId, quantity, unitPrice }]
    }),
    addCustomBouquet: (bouquet) => setCartItems((items) => [
      ...items,
      { ...bouquet, custom: true, key: `custom:${Date.now()}`, quantity: 1 },
    ]),
    updateQuantity: (key, quantity) => setCartItems((items) => quantity < 1 ? items.filter((item) => item.key !== key) : items.map((item) => item.key === key ? { ...item, quantity } : item)),
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
