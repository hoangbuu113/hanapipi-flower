const storagePrefix = 'hanapipi-flower:guest-order:'

// Read-only compatibility for orders created before HttpOnly recovery.
export function removeLegacyGuestOrderAccess(orderCode) {
  if (!orderCode) return
  try {
    window.sessionStorage.removeItem(`${storagePrefix}${orderCode}`)
  } catch {
    // Browser storage is optional; a valid server cookie remains authoritative.
  }
}

export function readGuestOrderAccess(orderCode) {
  if (!orderCode) return null
  try {
    return window.sessionStorage.getItem(`${storagePrefix}${orderCode}`)
  } catch {
    return null
  }
}
