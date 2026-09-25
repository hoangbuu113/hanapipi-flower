const storagePrefix = 'hanapipi-flower:guest-order:'

export function saveGuestOrderAccess(orderCode, token) {
  if (!orderCode || !token) return false
  try {
    window.sessionStorage.setItem(`${storagePrefix}${orderCode}`, token)
    return true
  } catch {
    return false
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
