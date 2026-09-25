import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { CommerceContext } from './commerceStore'
import { buildCartItemKey, normalizeGiftAddOns, normalizeStoredGiftAddOns } from '../utils/cart'
import { getCartScope, readScopedCart, writeScopedCart } from '../utils/cartIdentity'
import { normalizeStoredWishlistIds } from '../utils/wishlist'
import { resolveCartItems } from '../services/cartResolver'

const wishlistStorageKey = 'hanapipi-flower:wishlist'

const emptyCart = {
  error: null,
  hasUnavailableItems: false,
  isFallback: false,
  items: [],
  ok: true,
  subtotal: 0,
}

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key))
    return value ?? fallback
  } catch {
    return fallback
  }
}

export function CommerceProvider({ children }) {
  const { isLoaded, isSignedIn, userId } = useAuth()
  const cartScope = getCartScope({ isLoaded, isSignedIn, userId })

  // Never mount a guest cart while Clerk is still resolving the session.
  // The key remounts all in-memory cart state on every identity transition.
  if (!cartScope) return null

  return <ScopedCommerceProvider key={cartScope} cartScope={cartScope}>{children}</ScopedCommerceProvider>
}

function ScopedCommerceProvider({ cartScope, children }) {
  const [cartState] = useState(() => readScopedCart(window.localStorage, cartScope))
  const [storedCartItems, setStoredCartItems] = useState(cartState.items)
  const [deliveryDraft, setDeliveryDraft] = useState(cartState.delivery)
  const [wishlistIds, setWishlistIds] = useState(() => {
    const stored = readStorage(wishlistStorageKey, [])
    return normalizeStoredWishlistIds(stored)
  })
  const [isCartOpen, setIsCartOpen] = useState(false)

  const hasItems = storedCartItems.length > 0
  const [isFetching, setIsFetching] = useState(hasItems)
  const [rawCartError, setRawCartError] = useState(null)
  const [reloadIndex, setReloadIndex] = useState(0)
  const [resolvedCart, setResolvedCart] = useState(emptyCart)

  useEffect(() => {
    writeScopedCart(window.localStorage, cartScope, { delivery: deliveryDraft, items: storedCartItems })
  }, [cartScope, storedCartItems, deliveryDraft])

  useEffect(() => {
    window.localStorage.setItem(wishlistStorageKey, JSON.stringify(wishlistIds))
  }, [wishlistIds])

  useEffect(() => {
    if (!hasItems) return

    const controller = new AbortController()
    let isSubscribed = true

    resolveCartItems(storedCartItems, { signal: controller.signal })
      .then((result) => {
        if (!isSubscribed) return
        if (result.ok) {
          setResolvedCart(result)
          setRawCartError(null)
        } else {
          setRawCartError(result.error)
        }
      })
      .catch((err) => {
        if (!isSubscribed || err?.name === 'AbortError') return
        setRawCartError({ code: 'CLIENT_ERROR', message: 'Đã có lỗi xảy ra khi tải giỏ hàng.' })
      })
      .finally(() => {
        if (isSubscribed) {
          setIsFetching(false)
        }
      })

    return () => {
      isSubscribed = false
      controller.abort()
    }
  }, [hasItems, storedCartItems, reloadIndex])

  const isCartLoading = hasItems && isFetching
  const currentResolvedCart = hasItems ? resolvedCart : emptyCart
  const cartError = hasItems ? rawCartError : null
  const effectiveCartItems = useMemo(() => {
    if (!hasItems) return []
    return currentResolvedCart.items.length > 0 ? currentResolvedCart.items : storedCartItems
  }, [hasItems, currentResolvedCart.items, storedCartItems])

  const value = useMemo(() => ({
    cartCount: storedCartItems.reduce((total, item) => total + item.quantity, 0),
    cartError,
    cartItems: effectiveCartItems,
    cartSubtotal: currentResolvedCart.subtotal,
    deliveryDraft,
    hasUnavailableItems: currentResolvedCart.hasUnavailableItems,
    isCartLoading,
    isCartOpen,
    rawCartItems: storedCartItems,
    retryCart: () => {
      setIsFetching(true)
      setRawCartError(null)
      setReloadIndex((current) => current + 1)
    },
    wishlistIds,
    toggleWishlist: (productId) => setWishlistIds((ids) => (ids.includes(productId) ? ids.filter((id) => id !== productId) : [...ids, productId])),
    addToCart: ({ productId, sizeId, wrappingId, quantity, unitPrice, giftAddOns = [] }) => {
      setIsFetching(true)
      setStoredCartItems((items) => {
        const addOns = normalizeStoredGiftAddOns(giftAddOns)
        const key = buildCartItemKey({ giftAddOns: normalizeGiftAddOns(addOns), productId, sizeId, wrappingId })
        const found = items.find((item) => item.key === key)
        return found
          ? items.map((item) => (item.key === key ? { ...item, quantity: item.quantity + quantity } : item))
          : [...items, { giftAddOns: addOns, key, productId, quantity, sizeId, unitPrice, wrappingId }]
      })
    },
    addCustomBouquet: (bouquet) => {
      setIsFetching(true)
      setStoredCartItems((items) => [
        ...items,
        { ...bouquet, custom: true, key: `custom:${Date.now()}`, quantity: 1 },
      ])
    },
    updateQuantity: (key, quantity) => {
      setIsFetching(true)
      setStoredCartItems((items) => (quantity < 1
        ? items.filter((item) => item.key !== key)
        : items.map((item) => (item.key === key ? { ...item, quantity } : item))))
    },
    removeGiftAddOn: (key, addOnId) => {
      setIsFetching(true)
      setStoredCartItems((items) => {
        const selectedItem = items.find((item) => item.key === key)
        if (!selectedItem || selectedItem.custom) return items

        const giftAddOns = (selectedItem.giftAddOns || []).filter((addOn) => addOn.id !== addOnId)
        const nextKey = buildCartItemKey({ ...selectedItem, giftAddOns: normalizeGiftAddOns(giftAddOns) })
        const matchingItem = items.find((item) => item.key === nextKey && item.key !== key)

        if (matchingItem) {
          return items
            .filter((item) => item.key !== key)
            .map((item) => (item.key === nextKey ? { ...item, quantity: item.quantity + selectedItem.quantity } : item))
        }

        return items.map((item) => (item.key === key ? { ...item, giftAddOns, key: nextKey } : item))
      })
    },
    removeFromCart: (key) => {
      setStoredCartItems((items) => items.filter((item) => item.key !== key))
    },
    setDeliveryDraft: (draft) => setDeliveryDraft(draft),
    clearCart: () => {
      writeScopedCart(window.localStorage, cartScope, { delivery: { date: null, slot: null }, items: [] })
      setStoredCartItems([])
      setDeliveryDraft({ date: null, slot: null })
    },
    openCart: () => setIsCartOpen(true),
    closeCart: () => setIsCartOpen(false),
  }), [cartError, cartScope, currentResolvedCart.hasUnavailableItems, currentResolvedCart.subtotal, deliveryDraft, effectiveCartItems, isCartLoading, isCartOpen, storedCartItems, wishlistIds])

  return <CommerceContext.Provider value={value}>{children}</CommerceContext.Provider>
}
