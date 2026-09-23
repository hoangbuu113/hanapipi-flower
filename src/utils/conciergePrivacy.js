const REDACTED_EMAIL = '[email đã ẩn]'
const REDACTED_ORDER_CODE = '[mã đơn đã ẩn]'
const REDACTED_PHONE = '[số điện thoại đã ẩn]'
const REDACTED_ADDRESS = '[địa chỉ đã ẩn]'
const REDACTED_SECRET = '[secret hoặc token đã ẩn]'

export function redactConciergeText(value) {
  if (typeof value !== 'string') return ''

  return value
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/giu, REDACTED_EMAIL)
    .replace(/\bHF-[A-Z0-9-]{6,32}\b/giu, REDACTED_ORDER_CODE)
    .replace(/(?:\+?84|0)(?:[\s.-]?\d){8,10}\b/gu, REDACTED_PHONE)
    .replace(/(?:địa chỉ|dia chi|address)\s*[:-]?\s*[^.!?\n]{3,120}/giu, REDACTED_ADDRESS)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/giu, REDACTED_SECRET)
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/gu, REDACTED_SECRET)
    .replace(/\b(?:gsk_|sk[-_]|gh[pousr]_|xox[baprs]-|AIza)[A-Za-z0-9._-]{12,}\b/gu, REDACTED_SECRET)
    .replace(
      /\b(?:api[ _-]?key|access[ _-]?token|secret|token|password|mật khẩu|mat khau)\s*[:=]\s*(?:"[^"]{8,}"|'[^']{8,}'|[^\s,;]{8,})/giu,
      REDACTED_SECRET,
    )
    .replace(/\b[A-Za-z0-9_-]{40,}\b/gu, REDACTED_SECRET)
}
