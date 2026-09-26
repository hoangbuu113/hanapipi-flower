import { resolveMediaSrc } from '../../utils/media.js'
import { canonicalJson } from '../../utils/canonicalJson.js'

export function consultationError(status, code, message) {
  return Object.assign(new Error(message), { status, code, consultationError: true })
}
const invalid = () => consultationError(400, 'INVALID_CONSULTATION', 'Thông tin lựa chọn chưa hợp lệ. Vui lòng kiểm tra lại giỏ hoa.')
function text(value, max = 100, optional = false) {
  if (optional && value == null) return ''
  if (typeof value !== 'string' || value.length > max || (!optional && !value.trim())) throw invalid()
  return value.trim().normalize('NFC')
}
function ids(value, max = 8) {
  if (!Array.isArray(value) || value.length > max) throw invalid()
  const result = value.map((id) => text(id)).sort()
  if (new Set(result).size !== result.length) throw invalid()
  return result
}
export function normalizeConsultation(payload) {
  if (!payload || !Array.isArray(payload.items) || !payload.items.length || payload.items.length > 20) throw invalid()
  return { items: payload.items.map((item) => {
    if (!item || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) throw invalid()
    const common = { quantity: item.quantity, giftAddOnIds: ids(item.giftAddOnIds ?? []), message: text(item.message, 200, true) }
    if (item.kind === 'custom') {
      const selection = item.selections
      if (!selection || typeof selection !== 'object') throw invalid()
      return { ...common, kind: 'custom', selections: {
        style: text(selection.style), palette: text(selection.palette), size: text(selection.size),
        wrapping: text(selection.wrapping), flowers: ids(selection.flowers, 2),
      } }
    }
    if (item.kind != null && item.kind !== 'product') throw invalid()
    return { ...common, kind: 'product', productId: text(item.productId), sizeId: text(item.sizeId), wrappingId: text(item.wrappingId, 100, true) }
  }).sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b), 'en')) }
}
async function digest(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map((n) => n.toString(16).padStart(2, '0')).join('')
}
function mapRequest(row) {
  return row && { id: row.id, referenceCode: row.reference_code, status: row.status, referenceTotal: row.reference_total,
    notificationStatus: row.notification_status, createdAt: row.created_at_utc, updatedAt: row.updated_at_utc }
}
export function publicConsultation(request) {
  return { referenceCode: request.referenceCode, createdAt: request.createdAt, referenceTotal: request.referenceTotal, status: 'new' }
}
function safeImage(product) {
  const src = resolveMediaSrc(product?.media?.find((item) => !item.type || item.type === 'image')?.src)
  // Only local public media: never cause Telegram to fetch caller-controlled external URLs.
  return /^\/(?:api\/v1\/media\/|assets\/)[^?#]+$/u.test(src) && !src.includes('..') ? src : ''
}
function price(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw consultationError(409, 'SELECTION_UNAVAILABLE', 'Một lựa chọn hiện không còn khả dụng.')
  return value
}
function available(value) {
  if (!value || !value.active) throw consultationError(409, 'SELECTION_UNAVAILABLE', 'Một lựa chọn hiện không còn khả dụng. Vui lòng cập nhật giỏ hoa.')
  return value
}

export function createConsultationRepository(db, { catalogue }) {
  async function findReplay(keyHash, requestHash) {
    const row = await db.prepare('SELECT * FROM consultation_requests WHERE idempotency_key_hash = ?').bind(keyHash).first()
    if (!row) return null
    if (row.request_hash !== requestHash) throw consultationError(409, 'IDEMPOTENCY_CONFLICT', 'Lựa chọn đã thay đổi. Vui lòng gửi một yêu cầu mới.')
    return { created: false, request: mapRequest(row) }
  }
  return {
    async create(payload, key) {
      if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/u.test(key)) throw consultationError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Vui lòng thử gửi lại yêu cầu.')
      const input = normalizeConsultation(payload)
      const [keyHash, requestHash] = await Promise.all([digest(key), digest(canonicalJson(input))])
      const replay = await findReplay(keyHash, requestHash)
      if (replay) return replay
      const giftsById = new Map((await catalogue.getGiftAddOns({ activeOnly: false })).map((gift) => [gift.id, gift]))
      let options
      const items = []
      for (const selection of input.items) {
        const gifts = selection.giftAddOnIds.map((id) => {
          const gift = available(giftsById.get(id))
          return { id: gift.id, label: gift.name, price: price(gift.priceVnd) }
        })
        let item
        if (selection.kind === 'custom') {
          options ??= await catalogue.getBouquetOptions(null, { activeOnly: false })
          const resolve = (type, id) => available(options.find((option) => option.optionType === type && (option.id === id || option.label === id)))
          const selected = Object.fromEntries(['style', 'palette', 'size', 'wrapping'].map((type) => [type, resolve(type, selection.selections[type])]))
          if (!selection.selections.flowers.length) throw invalid()
          selected.flowers = selection.selections.flowers.map((id) => resolve('flower', id))
          const base = price(selected.size.basePriceVnd) + price(selected.style.priceDeltaVnd ?? 0)
            + price(selected.palette.priceDeltaVnd ?? 0) + price(selected.wrapping.priceDeltaVnd ?? 0)
            + selected.flowers.reduce((sum, flower) => sum + price(flower.priceDeltaVnd ?? 0), 0)
          item = { productId: null, name: 'Bó hoa theo ý bạn', image: '', unitReferencePrice: base,
            selections: { ...Object.fromEntries(['style', 'palette', 'size', 'wrapping'].map((type) => [type, { id: selected[type].id, label: selected[type].label }])),
              flowers: selected.flowers.map((flower) => ({ id: flower.id, label: flower.label, price: flower.priceDeltaVnd ?? 0 })) } }
        } else {
          const product = await catalogue.getProductById(selection.productId)
          available(product)
          if (!product.isPurchasable || product.purchaseType !== 'standard' || product.id === 'no-watering-flower' || product.slug === 'no-watering-flower') available(null)
          const variants = await catalogue.getProductVariants(product.id, { activeOnly: false })
          const variant = (type, id) => available(variants.find((v) => v.optionType === type && (v.id === id || v.code === id)))
          const size = variant('size', selection.sizeId)
          const wrapping = selection.wrappingId ? variant('wrapping', selection.wrappingId) : null
          item = { productId: product.id, name: product.name, image: safeImage(product), unitReferencePrice: price(size.priceVnd),
            selections: { size: { id: size.id, label: size.label, price: size.priceVnd }, wrapping: wrapping && { id: wrapping.id, label: wrapping.label } } }
        }
        item.selections.gifts = gifts
        item.selections.message = selection.message
        item.quantity = selection.quantity
        item.unitReferencePrice = price(item.unitReferencePrice + gifts.reduce((sum, gift) => sum + gift.price, 0))
        item.lineReferenceTotal = price(item.unitReferencePrice * item.quantity)
        items.push(item)
      }
      const referenceTotal = price(items.reduce((sum, item) => sum + item.lineReferenceTotal, 0))
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const id = `cr_${crypto.randomUUID()}`
        const referenceCode = `HP-${crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`
        const now = new Date().toISOString()
        const statements = [db.prepare(`INSERT INTO consultation_requests
          (id, reference_code, idempotency_key_hash, request_hash, reference_total, created_at_utc, updated_at_utc)
          VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(id, referenceCode, keyHash, requestHash, referenceTotal, now, now)]
        items.forEach((item, index) => statements.push(db.prepare(`INSERT INTO consultation_request_items
          (id, consultation_request_id, product_id, product_name_snapshot, image_url_snapshot, quantity,
           unit_reference_price, line_reference_total, selections_json, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(`cri_${crypto.randomUUID()}`, id, item.productId, item.name, item.image,
          item.quantity, item.unitReferencePrice, item.lineReferenceTotal, JSON.stringify(item.selections), index)))
        try {
          await db.batch(statements) // D1 batch is transactional; unique key arbitrates concurrent creators.
          return { created: true, request: { id, referenceCode, referenceTotal, status: 'new', notificationStatus: 'pending', createdAt: now, updatedAt: now, items } }
        } catch (error) {
          const concurrent = await findReplay(keyHash, requestHash)
          if (concurrent) return concurrent
          if (await db.prepare('SELECT id FROM consultation_requests WHERE reference_code = ?').bind(referenceCode).first()) continue
          throw error
        }
      }
      throw consultationError(503, 'CONSULTATION_UNAVAILABLE', 'Chưa thể nhận yêu cầu lúc này. Vui lòng thử lại.')
    },
    async setNotification(id, status) {
      if (!['sent', 'partial', 'failed'].includes(status)) throw invalid()
      await db.prepare("UPDATE consultation_requests SET notification_status = ?, updated_at_utc = ? WHERE id = ? AND notification_status = 'pending'")
        .bind(status, new Date().toISOString(), id).run()
    },
    async list() {
      const rows = await db.prepare('SELECT * FROM consultation_requests ORDER BY created_at_utc DESC, id DESC LIMIT 100').all()
      return (rows.results ?? []).map(mapRequest)
    },
    async detail(id) {
      const request = mapRequest(await db.prepare('SELECT * FROM consultation_requests WHERE id = ?').bind(id).first())
      if (!request) throw consultationError(404, 'CONSULTATION_NOT_FOUND', 'Không tìm thấy yêu cầu tư vấn.')
      const items = await db.prepare('SELECT * FROM consultation_request_items WHERE consultation_request_id = ? ORDER BY sort_order').bind(id).all()
      return { ...request, items: (items.results ?? []).map((item) => ({ productId: item.product_id, name: item.product_name_snapshot, image: item.image_url_snapshot,
        quantity: item.quantity, unitReferencePrice: item.unit_reference_price, lineReferenceTotal: item.line_reference_total, selections: JSON.parse(item.selections_json) })) }
    },
    async updateStatus(id, status) {
      const next = { new: 'contacted', contacted: 'closed' }
      const current = await this.detail(id)
      if (next[current.status] !== status) throw consultationError(409, 'INVALID_CONSULTATION_TRANSITION', 'Trạng thái yêu cầu không còn phù hợp. Vui lòng tải lại.')
      const changed = await db.prepare('UPDATE consultation_requests SET status = ?, updated_at_utc = ? WHERE id = ? AND status = ?')
        .bind(status, new Date().toISOString(), id, current.status).run()
      if (changed.meta?.changes !== 1) throw consultationError(409, 'INVALID_CONSULTATION_TRANSITION', 'Yêu cầu đã được cập nhật. Vui lòng tải lại.')
      return this.detail(id)
    },
  }
}
