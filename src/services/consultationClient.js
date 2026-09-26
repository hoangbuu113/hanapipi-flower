import { canonicalJson } from '../utils/canonicalJson.js'

export function buildConsultationPayload(items) {
  return { items: items.map((item) => ({
    quantity: item.quantity, giftAddOnIds: (item.giftAddOns ?? []).map((gift) => gift.id).sort(), message: item.message ?? '',
    ...(item.custom ? { kind: 'custom', selections: { style: item.style, palette: item.palette, size: item.size, wrapping: item.wrapping, flowers: [...(item.flowers ?? [])].sort() } }
      : { kind: 'product', productId: item.productId, sizeId: item.sizeId, wrappingId: item.wrappingId ?? '' }),
  })).sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b), 'en')) }
}

// Session storage keeps only a digest and random attempt key, never the selection/note.
export async function getConsultationAttempt(payload, storage) {
  if (!storage) { try { storage = globalThis.sessionStorage } catch { /* Storage is optional. */ } }
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(payload))))]
    .map((n) => n.toString(16).padStart(2, '0')).join('')
  let previous
  try { previous = JSON.parse(storage?.getItem('hanapipi-flower:consultation-attempt')) } catch { /* Storage is optional. */ }
  if (previous?.hash === hash && /^[a-zA-Z0-9_-]{16,100}$/u.test(previous.key ?? '')) return previous.key
  const key = crypto.randomUUID()
  try { storage?.setItem('hanapipi-flower:consultation-attempt', JSON.stringify({ hash, key })) } catch { /* Caller also retains key in memory. */ }
  return key
}

export async function createConsultation(payload, { idempotencyKey, fetchImpl = globalThis.fetch } = {}) {
  try {
    const response = await fetchImpl('/api/v1/consultations', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(payload) })
    const body = await response.json().catch(() => null)
    if (!response.ok) return { ok: false, error: response.status === 429
      ? 'Bạn đang gửi yêu cầu quá nhanh. Vui lòng thử lại sau một phút.'
      : 'Chưa thể gửi yêu cầu. Giỏ hoa vẫn được giữ lại. Vui lòng thử lại.' }
    const consultation = body?.data?.consultation
    if (!/^HP-[A-Z0-9]{6,16}$/u.test(consultation?.referenceCode ?? '') || !Number.isSafeInteger(consultation?.referenceTotal)) throw new Error('INVALID_RESPONSE')
    return { ok: true, consultation }
  } catch {
    return { ok: false, error: 'Chưa xác nhận được yêu cầu. Giỏ hoa vẫn được giữ lại. Vui lòng thử lại với cùng lựa chọn.' }
  }
}

export async function requestAdminConsultations(path = '', { getToken, signal, status, fetchImpl = globalThis.fetch } = {}) {
  try {
    const token = await getToken()
    if (!token) return { ok: false, error: 'Phiên đăng nhập chưa sẵn sàng.' }
    const response = await fetchImpl(`/api/v1/admin/consultations${path}`, {
      method: status ? 'POST' : 'GET', signal,
      headers: { Authorization: `Bearer ${token}`, ...(status ? { 'Content-Type': 'application/json' } : {}) },
      ...(status ? { body: JSON.stringify({ status }) } : {}),
    })
    const body = await response.json().catch(() => null)
    if (!response.ok) return { ok: false, error: response.status === 429 ? 'Vui lòng chờ một phút trước khi cập nhật tiếp.' : 'Chưa thể tải hoặc cập nhật yêu cầu tư vấn.' }
    return { ok: true, ...body.data }
  } catch { return { ok: false, error: 'Chưa thể kết nối. Vui lòng thử lại.' } }
}
