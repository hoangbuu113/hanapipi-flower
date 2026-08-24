function getLocalDateValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export const DELIVERY_CUTOFF_HOUR = 14

export function isDeliveryDateAvailable(value, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false

  const today = getLocalDateValue(now)
  return value > today || (value === today && now.getHours() < DELIVERY_CUTOFF_HOUR)
}
