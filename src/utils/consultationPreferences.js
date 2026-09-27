import { DELIVERY_CUTOFF_HOUR } from './delivery.js'

export function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

// Match the Cart's seven-day window and same-day cutoff in the shop's timezone.
// Replays use their already-persisted preferences, even after this window passes.
export function isCurrentConsultationDate(value, now = new Date()) {
  if (!isCalendarDate(value)) return false
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(({ type, value: part }) => [type, part]))
  const today = `${parts.year}-${parts.month}-${parts.day}`
  const days = (Date.parse(`${value}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000
  return days >= 0 && days <= 6 && (days !== 0 || Number(parts.hour) < DELIVERY_CUTOFF_HOUR)
}

export function formatConsultationDate(value) {
  return isCalendarDate(value) ? value.split('-').reverse().join('/') : 'Chưa chọn'
}
