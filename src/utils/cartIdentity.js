import { normalizeStoredCartItems } from './cart.js'
import { isDeliveryDateAvailable } from './delivery.js'

const legacyCartStorageKey = 'hanapipi-flower:cart'
const cartStoragePrefix = 'hanapipi-flower:cart:'
const emptyDelivery = { date: null, slot: null }

export function getCartScope({ isLoaded, isSignedIn, userId }) {
  if (!isLoaded) return null
  if (isSignedIn === false) return 'guest'
  if (isSignedIn === true && typeof userId === 'string' && userId.length > 0) {
    return `user:${encodeURIComponent(userId)}`
  }
  return null
}

export function getCartStorageKey(scope) {
  if (!scope) throw new Error('Cart identity must be resolved before accessing storage.')
  return `${cartStoragePrefix}${scope}`
}

export function readScopedCart(storage, scope) {
  const key = getCartStorageKey(scope)
  let stored = null

  try {
    // The unowned legacy cart may contain a previous account's items. Never
    // assign it to a guest or a newly authenticated identity by assumption.
    storage.removeItem(legacyCartStorageKey)
    stored = JSON.parse(storage.getItem(key))
  } catch {
    // Storage may be unavailable or contain malformed legacy data.
  }

  const items = normalizeStoredCartItems(Array.isArray(stored) ? stored : stored?.items)
  const storedDelivery = stored?.delivery ?? emptyDelivery
  const delivery = isDeliveryDateAvailable(storedDelivery.date)
    ? storedDelivery
    : emptyDelivery

  return { delivery, items }
}

export function writeScopedCart(storage, scope, cart) {
  storage.setItem(getCartStorageKey(scope), JSON.stringify(cart))
}
