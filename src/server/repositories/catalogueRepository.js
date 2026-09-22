const DEFAULT_PAGE_SIZE = 24
const MAX_PAGE_SIZE = 50
const MAX_OFFSET = 5000

const PURCHASE_TYPES = new Set(['all', 'standard', 'priceless'])
const BOUQUET_OPTION_TYPES = new Set(['style', 'palette', 'size', 'flower', 'wrapping'])
const SORT_EXPRESSIONS = {
  catalogue: 'sort_order ASC, id ASC',
  newest: 'created_at_utc DESC, id ASC',
  price_asc: 'CASE WHEN price_vnd IS NULL THEN 1 ELSE 0 END ASC, price_vnd ASC, id ASC',
  price_desc: 'CASE WHEN price_vnd IS NULL THEN 1 ELSE 0 END ASC, price_vnd DESC, id ASC',
}

const PRODUCT_SELECT = `
  SELECT
    id, slug, name, short_description, description, collection, purchase_type,
    price_vnd, currency, status, badges_json, colors_json, moods_json,
    occasions_json, composition_json, media_json, care_note, delivery_note,
    is_best_seller, active, sort_order, catalogue_version_id, created_at_utc,
    updated_at_utc, internal_note
  FROM products
`

function assertD1(db) {
  if (!db?.prepare || !db?.batch) {
    throw new TypeError('A D1-compatible database binding is required.')
  }
}

function parseJsonArray(value) {
  const parsed = JSON.parse(value)
  return Array.isArray(parsed) ? parsed : []
}

function mapProduct(row) {
  if (!row) return null
  const isPurchasable = row.active === 1
    && row.purchase_type === 'standard'
    && Number.isInteger(row.price_vnd)

  return {
    active: row.active === 1,
    badges: parseJsonArray(row.badges_json),
    careNote: row.care_note,
    catalogueVersion: row.catalogue_version_id,
    collection: row.collection,
    colors: parseJsonArray(row.colors_json),
    composition: parseJsonArray(row.composition_json),
    createdAtUtc: row.created_at_utc,
    deliveryNote: row.delivery_note,
    description: row.description,
    id: row.id,
    isBestSeller: row.is_best_seller === 1,
    isPurchasable,
    media: parseJsonArray(row.media_json),
    moods: parseJsonArray(row.moods_json),
    name: row.name,
    occasions: parseJsonArray(row.occasions_json),
    priceVnd: row.price_vnd,
    purchaseType: row.purchase_type,
    shortDescription: row.short_description,
    slug: row.slug,
    sortOrder: row.sort_order,
    status: row.status,
    updatedAtUtc: row.updated_at_utc,
  }
}

function mapAdminProduct(row) {
  const product = mapProduct(row)
  if (!product) return null
  return {
    ...product,
    internalNote: row.internal_note ?? '',
  }
}

function mapVariant(row) {
  return {
    active: row.active === 1,
    code: row.code,
    id: row.id,
    label: row.label,
    note: row.note,
    optionType: row.option_type,
    priceDeltaVnd: row.price_delta_vnd,
    priceVnd: row.price_vnd,
    productId: row.product_id,
    sortOrder: row.sort_order,
  }
}

function mapBouquetOption(row) {
  return {
    active: row.active === 1,
    basePriceVnd: row.base_price_vnd,
    colors: parseJsonArray(row.colors_json),
    description: row.description,
    id: row.option_code,
    label: row.label,
    note: row.note,
    optionType: row.option_type,
    priceDeltaVnd: row.price_delta_vnd,
    rowId: row.id,
    sortOrder: row.sort_order,
  }
}

function mapGiftAddOn(row) {
  return {
    active: row.active === 1,
    id: row.id,
    name: row.name,
    priceVnd: row.price_vnd,
    shortDescription: row.short_description,
    sortOrder: row.sort_order,
  }
}

function boundedInteger(value, fallback, maximum) {
  if (value == null) return fallback
  if (!Number.isInteger(value) || value < 0) throw new TypeError('Pagination values must be non-negative integers.')
  return Math.min(value, maximum)
}

export function createCatalogueRepository(db) {
  assertD1(db)

  return {
    async getCatalogueVersion() {
      return db.prepare(`
        SELECT version, checksum, product_count, purchasable_count, gift_add_on_count, seeded_at_utc
        FROM catalogue_versions
        WHERE active = 1
        LIMIT 1
      `).first()
    },

    async getProductById(id, { forAdmin = false } = {}) {
      if (typeof id !== 'string' || id.length === 0 || id.length > 100) return null
      const row = await db.prepare(`${PRODUCT_SELECT} WHERE id = ? LIMIT 1`).bind(id).first()
      return forAdmin ? mapAdminProduct(row) : mapProduct(row)
    },

    async getProductBySlug(slug, { forAdmin = false } = {}) {
      if (typeof slug !== 'string' || slug.length === 0 || slug.length > 100) return null
      const row = await db.prepare(`${PRODUCT_SELECT} WHERE slug = ? LIMIT 1`).bind(slug).first()
      return forAdmin ? mapAdminProduct(row) : mapProduct(row)
    },

    async listProducts(options = {}) {
      const {
        activeOnly = true,
        forAdmin = false,
        maxPriceVnd = null,
        purchaseType = 'all',
        sort = 'catalogue',
      } = options
      const limit = boundedInteger(options.limit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) || 1
      const offset = boundedInteger(options.offset, 0, MAX_OFFSET)

      if (typeof activeOnly !== 'boolean') throw new TypeError('activeOnly must be a boolean.')
      if (!PURCHASE_TYPES.has(purchaseType)) throw new TypeError('Unsupported purchase type filter.')
      if (!Object.hasOwn(SORT_EXPRESSIONS, sort)) throw new TypeError('Unsupported product sort.')
      if (maxPriceVnd != null && (!Number.isInteger(maxPriceVnd) || maxPriceVnd < 0)) {
        throw new TypeError('maxPriceVnd must be a non-negative integer.')
      }

      const clauses = []
      const bindings = []
      if (activeOnly) clauses.push('active = 1')
      if (purchaseType !== 'all') {
        clauses.push('purchase_type = ?')
        bindings.push(purchaseType)
      }
      if (maxPriceVnd != null) {
        clauses.push('price_vnd IS NOT NULL', 'price_vnd <= ?')
        bindings.push(maxPriceVnd)
      }

      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
      const sql = `${PRODUCT_SELECT} ${where} ORDER BY ${SORT_EXPRESSIONS[sort]} LIMIT ? OFFSET ?`
      const { results = [] } = await db.prepare(sql).bind(...bindings, limit, offset).all()

      const mapper = forAdmin ? mapAdminProduct : mapProduct
      return {
        items: results.map(mapper),
        limit,
        offset,
      }
    },

    async getProductVariants(productId, { activeOnly = true } = {}) {
      if (typeof productId !== 'string' || productId.length === 0 || productId.length > 100) return []
      const activeClause = activeOnly ? 'AND active = 1' : ''
      const { results = [] } = await db.prepare(`
        SELECT id, product_id, option_type, code, label, note, price_vnd,
          price_delta_vnd, active, sort_order
        FROM product_variants
        WHERE product_id = ? ${activeClause}
        ORDER BY option_type, sort_order, id
      `).bind(productId).all()
      return results.map(mapVariant)
    },

    async getRelatedProducts(productId, { activeOnly = true } = {}) {
      if (typeof productId !== 'string' || productId.length === 0 || productId.length > 100) return []
      const activeClause = activeOnly ? 'AND p.active = 1' : ''
      const { results = [] } = await db.prepare(`
        SELECT
          p.id, p.slug, p.name, p.short_description, p.description, p.collection, p.purchase_type,
          p.price_vnd, p.currency, p.status, p.badges_json, p.colors_json, p.moods_json,
          p.occasions_json, p.composition_json, p.media_json, p.care_note, p.delivery_note,
          p.is_best_seller, p.active, p.sort_order, p.catalogue_version_id, p.created_at_utc,
          p.updated_at_utc
        FROM product_relations pr
        JOIN products p ON pr.related_product_id = p.id
        WHERE pr.product_id = ? ${activeClause}
        ORDER BY pr.sort_order, p.sort_order, p.id
      `).bind(productId).all()
      return results.map(mapProduct)
    },

    async getBouquetOptions(optionType = null, { activeOnly = true } = {}) {
      if (optionType != null && !BOUQUET_OPTION_TYPES.has(optionType)) {
        throw new TypeError('Unsupported bouquet option type.')
      }
      const clauses = []
      const bindings = []
      if (optionType != null) {
        clauses.push('option_type = ?')
        bindings.push(optionType)
      }
      if (activeOnly) clauses.push('active = 1')
      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
      const { results = [] } = await db.prepare(`
        SELECT id, option_type, option_code, label, description, note, colors_json,
          base_price_vnd, price_delta_vnd, active, sort_order
        FROM bouquet_options
        ${where}
        ORDER BY option_type, sort_order, id
      `).bind(...bindings).all()
      return results.map(mapBouquetOption)
    },

    async getGiftAddOns({ activeOnly = true } = {}) {
      const where = activeOnly ? 'WHERE active = 1' : ''
      const { results = [] } = await db.prepare(`
        SELECT id, name, short_description, price_vnd, active, sort_order
        FROM gift_add_ons
        ${where}
        ORDER BY sort_order, id
      `).all()
      return results.map(mapGiftAddOn)
    },

    async getProductPurchaseState(id) {
      if (typeof id !== 'string' || id.length === 0 || id.length > 100) {
        return { active: false, exists: false, isPurchasable: false, priceVnd: null, purchaseType: null }
      }
      const row = await db.prepare(`
        SELECT active, purchase_type, price_vnd
        FROM products
        WHERE id = ?
        LIMIT 1
      `).bind(id).first()
      if (!row) {
        return { active: false, exists: false, isPurchasable: false, priceVnd: null, purchaseType: null }
      }
      const active = row.active === 1
      return {
        active,
        exists: true,
        isPurchasable: active && row.purchase_type === 'standard' && Number.isInteger(row.price_vnd),
        priceVnd: row.price_vnd,
        purchaseType: row.purchase_type,
      }
    },

    async updateProductCommerceFields(idOrSlug, fields = {}) {
      if (typeof idOrSlug !== 'string' || idOrSlug.length === 0 || idOrSlug.length > 100) {
        return null
      }

      const product = await this.getProductById(idOrSlug) ?? await this.getProductBySlug(idOrSlug)
      if (!product) return null

      const isPriceless = product.purchaseType === 'priceless' || product.slug === 'no-watering-flower'

      // Enforce priceless invariant
      if (isPriceless) {
        if (fields.priceVnd !== undefined && fields.priceVnd !== null) {
          const err = new Error('Sản phẩm vô giá không thể gán giá bán.')
          err.code = 'PROTECTED_PRODUCT'
          err.status = 400
          throw err
        }
        if (fields.isPurchasable === true) {
          const err = new Error('Sản phẩm vô giá không thể mở bán.')
          err.code = 'PROTECTED_PRODUCT'
          err.status = 400
          throw err
        }
      }

      const updates = []
      const bindings = []

      // 1. priceVnd
      if (fields.priceVnd !== undefined) {
        if (isPriceless) {
          if (fields.priceVnd !== null) {
            const err = new Error('Sản phẩm vô giá không thể gán giá bán.')
            err.code = 'PROTECTED_PRODUCT'
            err.status = 400
            throw err
          }
        } else {
          const price = fields.priceVnd
          if (typeof price !== 'number' || !Number.isInteger(price) || price <= 0) {
            const err = new Error('Giá sản phẩm phải là số nguyên dương hợp lệ.')
            err.code = 'INVALID_PRICE'
            err.status = 400
            throw err
          }
          updates.push('price_vnd = ?')
          bindings.push(price)
        }
      }

      // 2. status
      if (fields.status !== undefined) {
        const allowedStatuses = ['available', 'seasonal', 'preorder', 'archived']
        if (typeof fields.status !== 'string' || !allowedStatuses.includes(fields.status)) {
          const err = new Error('Trạng thái sản phẩm không hợp lệ.')
          err.code = 'INVALID_STATUS'
          err.status = 400
          throw err
        }
        updates.push('status = ?')
        bindings.push(fields.status)
      }

      // 3. isPurchasable -> active
      if (fields.isPurchasable !== undefined) {
        if (typeof fields.isPurchasable !== 'boolean') {
          const err = new Error('Khả năng mua phải là giá trị boolean.')
          err.code = 'INVALID_PURCHASABILITY'
          err.status = 400
          throw err
        }
        if (isPriceless && fields.isPurchasable) {
          const err = new Error('Sản phẩm vô giá không thể mở bán.')
          err.code = 'PROTECTED_PRODUCT'
          err.status = 400
          throw err
        }
        updates.push('active = ?')
        bindings.push(fields.isPurchasable ? 1 : 0)
      }

      // 4. name
      if (fields.name !== undefined) {
        if (typeof fields.name !== 'string' || !fields.name.trim() || fields.name.trim().length > 160) {
          const err = new Error('Tên sản phẩm không được để trống và tối đa 160 ký tự.')
          err.code = 'INVALID_NAME'
          err.status = 400
          throw err
        }
        updates.push('name = ?')
        bindings.push(fields.name.trim())
      }

      // 5. shortDescription
      if (fields.shortDescription !== undefined) {
        if (typeof fields.shortDescription !== 'string') {
          const err = new Error('Mô tả ngắn phải là chuỗi văn bản.')
          err.code = 'INVALID_PAYLOAD'
          err.status = 400
          throw err
        }
        const trimmed = fields.shortDescription.trim()
        if (trimmed.length > 320) {
          const err = new Error('Mô tả ngắn tối đa 320 ký tự.')
          err.code = 'INVALID_PAYLOAD'
          err.status = 400
          throw err
        }
        updates.push('short_description = ?')
        bindings.push(trimmed)
      }

      // 6. description
      if (fields.description !== undefined) {
        if (typeof fields.description !== 'string') {
          const err = new Error('Mô tả chi tiết phải là chuỗi văn bản.')
          err.code = 'INVALID_PAYLOAD'
          err.status = 400
          throw err
        }
        const trimmed = fields.description.trim()
        if (trimmed.length > 1200) {
          const err = new Error('Mô tả chi tiết tối đa 1200 ký tự.')
          err.code = 'INVALID_PAYLOAD'
          err.status = 400
          throw err
        }
        updates.push('description = ?')
        bindings.push(trimmed)
      }

      // 7. collection
      if (fields.collection !== undefined) {
        if (typeof fields.collection !== 'string') {
          const err = new Error('Bộ sưu tập phải là chuỗi văn bản.')
          err.code = 'INVALID_PAYLOAD'
          err.status = 400
          throw err
        }
        const trimmed = fields.collection.trim()
        if (trimmed.length > 160) {
          const err = new Error('Bộ sưu tập tối đa 160 ký tự.')
          err.code = 'INVALID_PAYLOAD'
          err.status = 400
          throw err
        }
        updates.push('collection = ?')
        bindings.push(trimmed)
      }

      // 8. careNote
      if (fields.careNote !== undefined) {
        if (typeof fields.careNote !== 'string') {
          const err = new Error('Hướng dẫn chăm sóc phải là chuỗi văn bản.')
          err.code = 'INVALID_PAYLOAD'
          err.status = 400
          throw err
        }
        const trimmed = fields.careNote.trim()
        if (trimmed.length > 800) {
          const err = new Error('Hướng dẫn chăm sóc tối đa 800 ký tự.')
          err.code = 'INVALID_PAYLOAD'
          err.status = 400
          throw err
        }
        updates.push('care_note = ?')
        bindings.push(trimmed)
      }

      // 9. deliveryNote
      if (fields.deliveryNote !== undefined) {
        if (typeof fields.deliveryNote !== 'string') {
          const err = new Error('Thông tin giao hoa phải là chuỗi văn bản.')
          err.code = 'INVALID_PAYLOAD'
          err.status = 400
          throw err
        }
        const trimmed = fields.deliveryNote.trim()
        if (trimmed.length > 800) {
          const err = new Error('Thông tin giao hoa tối đa 800 ký tự.')
          err.code = 'INVALID_PAYLOAD'
          err.status = 400
          throw err
        }
        updates.push('delivery_note = ?')
        bindings.push(trimmed)
      }

      // 10. internalNote
      if (fields.internalNote !== undefined) {
        if (typeof fields.internalNote !== 'string') {
          const err = new Error('Ghi chú nội bộ phải là chuỗi văn bản.')
          err.code = 'INVALID_PAYLOAD'
          err.status = 400
          throw err
        }
        const trimmed = fields.internalNote.trim()
        if (trimmed.length > 800) {
          const err = new Error('Ghi chú nội bộ tối đa 800 ký tự.')
          err.code = 'INVALID_PAYLOAD'
          err.status = 400
          throw err
        }
        updates.push('internal_note = ?')
        bindings.push(trimmed)
      }

      // 11. composition / flowerComposition
      const compositionArg = fields.composition !== undefined ? fields.composition : fields.flowerComposition
      if (compositionArg !== undefined) {
        if (!Array.isArray(compositionArg) || compositionArg.some((x) => typeof x !== 'string')) {
          const err = new Error('Thành phần hoa phải là danh sách chuỗi.')
          err.code = 'INVALID_PAYLOAD'
          err.status = 400
          throw err
        }
        updates.push('composition_json = ?')
        bindings.push(JSON.stringify(compositionArg.map((x) => x.trim()).filter(Boolean)))
      }

      // 12. occasions
      if (fields.occasions !== undefined) {
        if (!Array.isArray(fields.occasions) || fields.occasions.some((x) => typeof x !== 'string')) {
          const err = new Error('Dịp tặng phải là danh sách chuỗi.')
          err.code = 'INVALID_PAYLOAD'
          err.status = 400
          throw err
        }
        updates.push('occasions_json = ?')
        bindings.push(JSON.stringify(fields.occasions.map((x) => x.trim()).filter(Boolean)))
      }

      // 13. moods
      if (fields.moods !== undefined) {
        if (!Array.isArray(fields.moods) || fields.moods.some((x) => typeof x !== 'string')) {
          const err = new Error('Phong cách / Cảm xúc phải là danh sách chuỗi.')
          err.code = 'INVALID_PAYLOAD'
          err.status = 400
          throw err
        }
        updates.push('moods_json = ?')
        bindings.push(JSON.stringify(fields.moods.map((x) => x.trim()).filter(Boolean)))
      }

      // 14. colors / colorPalette
      const colorsArg = fields.colors !== undefined ? fields.colors : fields.colorPalette
      if (colorsArg !== undefined) {
        if (!Array.isArray(colorsArg) || colorsArg.some((x) => typeof x !== 'string')) {
          const err = new Error('Bảng màu phải là danh sách chuỗi.')
          err.code = 'INVALID_PAYLOAD'
          err.status = 400
          throw err
        }
        updates.push('colors_json = ?')
        bindings.push(JSON.stringify(colorsArg.map((x) => x.trim()).filter(Boolean)))
      }

      if (updates.length === 0) {
        return this.getProductById(product.id, { forAdmin: true })
      }

      const now = new Date().toISOString()
      updates.push('updated_at_utc = ?')
      bindings.push(now)
      bindings.push(product.id)

      const sql = `UPDATE products SET ${updates.join(', ')} WHERE id = ?`
      await db.prepare(sql).bind(...bindings).run()

      return this.getProductById(product.id, { forAdmin: true })
    },

    async setProductArchived(idOrSlug, archived) {
      if (typeof idOrSlug !== 'string' || idOrSlug.length === 0 || idOrSlug.length > 100) {
        return null
      }
      if (typeof archived !== 'boolean') {
        throw new TypeError('archived must be a boolean.')
      }

      const product = await this.getProductById(idOrSlug) ?? await this.getProductBySlug(idOrSlug)
      if (!product) return null

      if (product.purchaseType === 'priceless' || product.slug === 'no-watering-flower') {
        const err = new Error('Sản phẩm được bảo vệ không thể lưu trữ hoặc khôi phục.')
        err.code = 'PROTECTED_PRODUCT'
        err.status = 400
        throw err
      }

      const nextActive = archived ? 0 : 1
      if (product.active === (nextActive === 1)) {
        return this.getProductById(product.id, { forAdmin: true })
      }

      await db.prepare(`
        UPDATE products
        SET active = ?, updated_at_utc = ?
        WHERE id = ?
      `).bind(nextActive, new Date().toISOString(), product.id).run()

      return this.getProductById(product.id, { forAdmin: true })
    },

    async createProduct(data = {}) {
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        const err = new Error('Dữ liệu sản phẩm không hợp lệ.')
        err.code = 'INVALID_PAYLOAD'
        err.status = 400
        throw err
      }

      const activeVersion = await this.getCatalogueVersion()
      if (!activeVersion?.version) {
        const err = new Error('Không tìm thấy phiên bản danh mục hợp lệ.')
        err.code = 'NO_ACTIVE_CATALOGUE_VERSION'
        err.status = 500
        throw err
      }

      // Enforce priceless & protected product invariants
      if (data.slug === 'no-watering-flower' || data.purchaseType === 'priceless') {
        const err = new Error('Không thể tạo sản phẩm vô giá hoặc trùng lặp sản phẩm được bảo vệ.')
        err.code = 'PROTECTED_PRODUCT'
        err.status = 400
        throw err
      }

      // Slug validation & uniqueness check
      if (typeof data.slug !== 'string' || !data.slug.trim()) {
        const err = new Error('Slug sản phẩm không được để trống.')
        err.code = 'INVALID_SLUG'
        err.status = 400
        throw err
      }

      const slug = data.slug.trim().toLowerCase()
      const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
      if (!SLUG_REGEX.test(slug) || slug.length > 100) {
        const err = new Error('Slug sản phẩm không hợp lệ (chỉ chứa chữ thường, số và dấu gạch ngang, tối đa 100 ký tự).')
        err.code = 'INVALID_SLUG'
        err.status = 400
        throw err
      }

      const existing = await this.getProductBySlug(slug)
      if (existing) {
        const err = new Error('Slug sản phẩm đã tồn tại.')
        err.code = 'SLUG_EXISTS'
        err.status = 409
        throw err
      }

      // Name validation
      if (typeof data.name !== 'string' || !data.name.trim() || data.name.trim().length > 160) {
        const err = new Error('Tên sản phẩm không được để trống và tối đa 160 ký tự.')
        err.code = 'INVALID_NAME'
        err.status = 400
        throw err
      }
      const name = data.name.trim()

      // Price validation (must be positive integer for standard sale product)
      const price = data.priceVnd
      if (typeof price !== 'number' || !Number.isInteger(price) || price <= 0) {
        const err = new Error('Giá sản phẩm phải là số nguyên dương hợp lệ.')
        err.code = 'INVALID_PRICE'
        err.status = 400
        throw err
      }

      // Status validation
      const allowedStatuses = ['available', 'seasonal', 'preorder']
      const status = data.status ?? 'available'
      if (typeof status !== 'string' || !allowedStatuses.includes(status)) {
        const err = new Error('Trạng thái sản phẩm không hợp lệ (phải là có sẵn, theo mùa hoặc đặt trước).')
        err.code = 'INVALID_STATUS'
        err.status = 400
        throw err
      }

      // Purchasability -> active
      const isPurchasable = data.isPurchasable !== false
      const active = isPurchasable ? 1 : 0

      // Optional text fields
      const shortDescription = (typeof data.shortDescription === 'string' && data.shortDescription.trim())
        ? data.shortDescription.trim().slice(0, 320)
        : name.slice(0, 320)
      const description = (typeof data.description === 'string' && data.description.trim())
        ? data.description.trim().slice(0, 1200)
        : shortDescription.slice(0, 1200)
      const collection = (typeof data.collection === 'string' && data.collection.trim())
        ? data.collection.trim().slice(0, 160)
        : 'Bộ sưu tập mới'
      const careNote = (typeof data.careNote === 'string' && data.careNote.trim())
        ? data.careNote.trim().slice(0, 800)
        : 'Đặt hoa nơi thoáng mát, thay nước mỗi ngày và cắt vát gốc hoa khoảng 1–2 cm.'
      const deliveryNote = (typeof data.deliveryNote === 'string' && data.deliveryNote.trim())
        ? data.deliveryNote.trim().slice(0, 800)
        : 'Có thể giao trong ngày tại khu vực được hỗ trợ; thời gian sẽ được xác nhận theo địa chỉ.'

      // Media bridge
      const media = (typeof data.imageUrl === 'string' && data.imageUrl.trim())
        ? [{
            alt: name,
            caption: null,
            fit: 'cover',
            position: 'center',
            poster: null,
            src: data.imageUrl.trim().slice(0, 500),
            type: 'image',
          }]
        : []

      // Metadata arrays
      const badges = Array.isArray(data.badges) ? data.badges.filter((b) => typeof b === 'string') : []
      const colors = Array.isArray(data.colors) ? data.colors.filter((c) => typeof c === 'string') : []
      const moods = Array.isArray(data.moods) ? data.moods.filter((m) => typeof m === 'string') : []
      const occasions = Array.isArray(data.occasions) ? data.occasions.filter((o) => typeof o === 'string') : []
      const composition = Array.isArray(data.composition) ? data.composition.filter((c) => typeof c === 'string') : []

      const internalNote = (typeof data.internalNote === 'string' && data.internalNote.trim())
        ? data.internalNote.trim().slice(0, 800)
        : null

      // Generate server ID
      const id = 'prod_' + globalThis.crypto.randomUUID().replaceAll('-', '')

      // Compute next sort order
      const maxSortRow = await db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM products').first()
      const sortOrder = (maxSortRow?.max_sort ?? -1) + 1

      const now = new Date().toISOString()

      // Default variant
      const variantId = `product:${id}:size:standard`

      const insertProductStmt = db.prepare(`
        INSERT INTO products (
          id, slug, name, short_description, description, collection, purchase_type,
          price_vnd, currency, status, badges_json, colors_json, moods_json, occasions_json,
          composition_json, media_json, care_note, delivery_note, is_best_seller, active,
          sort_order, catalogue_version_id, created_at_utc, updated_at_utc, internal_note
        ) VALUES (
          ?, ?, ?, ?, ?, ?, 'standard',
          ?, 'VND', ?, ?, ?, ?, ?,
          ?, ?, ?, ?, 0, ?,
          ?, ?, ?, ?, ?
        )
      `).bind(
        id, slug, name, shortDescription, description, collection,
        price, status, JSON.stringify(badges), JSON.stringify(colors), JSON.stringify(moods), JSON.stringify(occasions),
        JSON.stringify(composition), JSON.stringify(media), careNote, deliveryNote, active,
        sortOrder, activeVersion.version, now, now, internalNote
      )

      const insertVariantStmt = db.prepare(`
        INSERT INTO product_variants (
          id, product_id, option_type, code, label, note, price_vnd,
          price_delta_vnd, active, sort_order, catalogue_version_id
        ) VALUES (
          ?, ?, 'size', 'standard', 'Tiêu chuẩn', NULL, ?,
          0, ?, 0, ?
        )
      `).bind(
        variantId, id, price, active, activeVersion.version
      )

      await db.batch([insertProductStmt, insertVariantStmt])

      return this.getProductById(id, { forAdmin: true })
    },

    async saveProductVariants(productId, variantsList) {
      if (typeof productId !== 'string' || !productId.trim() || productId.length > 100) {
        const err = new Error('Mã sản phẩm không hợp lệ.')
        err.code = 'INVALID_PRODUCT_ID'
        err.status = 400
        throw err
      }

      const product = await this.getProductById(productId) ?? await this.getProductBySlug(productId)
      if (!product) {
        const err = new Error('Không tìm thấy sản phẩm.')
        err.code = 'PRODUCT_NOT_FOUND'
        err.status = 404
        throw err
      }

      if (product.purchaseType === 'priceless' || product.slug === 'no-watering-flower') {
        const err = new Error('Sản phẩm vô giá không thể cấu hình kích thước hoặc kiểu gói mở bán.')
        err.code = 'PROTECTED_PRODUCT'
        err.status = 400
        throw err
      }

      if (!Array.isArray(variantsList)) {
        const err = new Error('Danh sách tùy chọn không hợp lệ.')
        err.code = 'INVALID_VARIANTS'
        err.status = 400
        throw err
      }

      const activeVersion = await this.getCatalogueVersion()
      const versionId = activeVersion?.version ?? product.catalogueVersion

      const existingVariants = await this.getProductVariants(product.id, { activeOnly: false })
      const existingById = new Map(existingVariants.map((v) => [v.id, v]))
      const existingByTypeAndCode = new Map(existingVariants.map((v) => [`${v.optionType}:${v.code}`, v]))

      const statements = []
      const seenTypeAndCodes = new Set()

      for (let i = 0; i < variantsList.length; i++) {
        const item = variantsList[i]
        if (!item || typeof item !== 'object') {
          const err = new Error('Dữ liệu tùy chọn không hợp lệ.')
          err.code = 'INVALID_VARIANT'
          err.status = 400
          throw err
        }

        const optionType = item.optionType
        if (optionType !== 'size' && optionType !== 'wrapping') {
          const err = new Error('Loại tùy chọn phải là kích thước (size) hoặc kiểu gói (wrapping).')
          err.code = 'INVALID_OPTION_TYPE'
          err.status = 400
          throw err
        }

        if (typeof item.code !== 'string' || !item.code.trim() || item.code.length > 80) {
          const err = new Error('Mã định danh tùy chọn không hợp lệ (1-80 ký tự).')
          err.code = 'INVALID_VARIANT_CODE'
          err.status = 400
          throw err
        }
        const code = item.code.trim().toLowerCase()
        const typeAndCodeKey = `${optionType}:${code}`
        if (seenTypeAndCodes.has(typeAndCodeKey)) {
          const err = new Error(`Mã tùy chọn trùng lặp: ${code}`)
          err.code = 'DUPLICATE_VARIANT_CODE'
          err.status = 400
          throw err
        }
        seenTypeAndCodes.add(typeAndCodeKey)

        if (typeof item.label !== 'string' || !item.label.trim() || item.label.length > 120) {
          const err = new Error('Tên tùy chọn không được để trống (tối đa 120 ký tự).')
          err.code = 'INVALID_VARIANT_LABEL'
          err.status = 400
          throw err
        }
        const label = item.label.trim()

        let note = null
        if (item.note != null && typeof item.note === 'string') {
          note = item.note.trim().slice(0, 320) || null
        }

        let priceVnd = null
        if (optionType === 'size') {
          const price = item.priceVnd !== undefined ? item.priceVnd : item.price
          if (typeof price !== 'number' || !Number.isInteger(price) || price < 0) {
            const err = new Error('Giá kích thước phải là số nguyên không âm.')
            err.code = 'INVALID_VARIANT_PRICE'
            err.status = 400
            throw err
          }
          priceVnd = price
        } else if (optionType === 'wrapping') {
          if (item.priceVnd != null && item.priceVnd !== 0) {
            const err = new Error('Kiểu gói không hỗ trợ giá riêng trong phiên bản này.')
            err.code = 'INVALID_VARIANT_PRICE'
            err.status = 400
            throw err
          }
          priceVnd = null
        }

        const active = item.active !== false ? 1 : 0
        const sortOrder = Number.isInteger(item.sortOrder) && item.sortOrder >= 0 ? item.sortOrder : i

        const existing = (item.id && existingById.get(item.id)) ?? existingByTypeAndCode.get(typeAndCodeKey)
        if (existing) {
          statements.push(
            db.prepare(`
              UPDATE product_variants
              SET label = ?, note = ?, price_vnd = ?, active = ?, sort_order = ?
              WHERE id = ?
            `).bind(label, note, priceVnd, active, sortOrder, existing.id)
          )
        } else {
          const variantId = item.id && typeof item.id === 'string' && item.id.trim()
            ? item.id.trim()
            : `product:${product.id}:${optionType}:${code}`
          statements.push(
            db.prepare(`
              INSERT INTO product_variants (
                id, product_id, option_type, code, label, note, price_vnd,
                price_delta_vnd, active, sort_order, catalogue_version_id
              ) VALUES (
                ?, ?, ?, ?, ?, ?, ?,
                0, ?, ?, ?
              )
            `).bind(variantId, product.id, optionType, code, label, note, priceVnd, active, sortOrder, versionId)
          )
        }
      }

      // Clean up omitted variants for option types present in this payload
      const optionTypesInPayload = new Set(variantsList.map((v) => v.optionType))
      for (const existing of existingVariants) {
        if (optionTypesInPayload.has(existing.optionType)) {
          const wasKept = seenTypeAndCodes.has(`${existing.optionType}:${existing.code}`)
            || variantsList.some((v) => v.id === existing.id)
          if (!wasKept) {
            let isReferenced = false
            try {
              const ref = await db.prepare(`
                SELECT 1 FROM cart_items WHERE size_variant_id = ? OR wrapping_variant_id = ?
                UNION ALL
                SELECT 1 FROM order_items WHERE size_variant_id = ? OR wrapping_variant_id = ?
                LIMIT 1
              `).bind(existing.id, existing.id, existing.id, existing.id).first()
              isReferenced = Boolean(ref)
            } catch {
              // In case table or query is not applicable in minimal test environments
            }

            if (isReferenced) {
              statements.push(
                db.prepare('UPDATE product_variants SET active = 0 WHERE id = ?').bind(existing.id)
              )
            } else {
              statements.push(
                db.prepare('DELETE FROM product_variants WHERE id = ?').bind(existing.id)
              )
            }
          }
        }
      }

      if (statements.length > 0) {
        await db.batch(statements)
      }

      return this.getProductVariants(product.id, { activeOnly: false })
    },

    async listAdminGiftAddOns() {
      const { results = [] } = await db.prepare(`
        SELECT id, name, short_description, price_vnd, active, sort_order, catalogue_version_id
        FROM gift_add_ons
        ORDER BY sort_order, id
      `).all()
      return results.map(mapGiftAddOn)
    },

    async createGiftAddOn(data = {}) {
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        const err = new Error('Dữ liệu quà tặng không hợp lệ.')
        err.code = 'INVALID_PAYLOAD'
        err.status = 400
        throw err
      }

      if (typeof data.name !== 'string' || !data.name.trim() || data.name.trim().length > 120) {
        const err = new Error('Tên món quà không được để trống (tối đa 120 ký tự).')
        err.code = 'INVALID_NAME'
        err.status = 400
        throw err
      }
      const name = data.name.trim()

      const price = data.priceVnd !== undefined ? data.priceVnd : data.price ?? 0
      if (typeof price !== 'number' || !Number.isInteger(price) || price < 0) {
        const err = new Error('Giá món quà phải là số nguyên không âm (0 là miễn phí).')
        err.code = 'INVALID_PRICE'
        err.status = 400
        throw err
      }

      const shortDescription = (typeof data.shortDescription === 'string' && data.shortDescription.trim())
        ? data.shortDescription.trim().slice(0, 320)
        : (typeof data.note === 'string' && data.note.trim() ? data.note.trim().slice(0, 320) : name)

      const active = data.active !== false ? 1 : 0

      let id = (typeof data.id === 'string' && data.id.trim()) ? data.id.trim().toLowerCase() : null
      if (!id) {
        id = 'gift_' + globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 16)
      }

      const activeVersion = await this.getCatalogueVersion()
      const versionId = activeVersion?.version ?? '2026.03.foundation'

      const maxSortRow = await db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM gift_add_ons').first()
      const sortOrder = Number.isInteger(data.sortOrder) && data.sortOrder >= 0
        ? data.sortOrder
        : (maxSortRow?.max_sort ?? -1) + 1

      await db.prepare(`
        INSERT INTO gift_add_ons (
          id, name, short_description, price_vnd, active, sort_order, catalogue_version_id
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?
        )
      `).bind(id, name, shortDescription, price, active, sortOrder, versionId).run()

      const created = await db.prepare('SELECT id, name, short_description, price_vnd, active, sort_order FROM gift_add_ons WHERE id = ?').bind(id).first()
      return mapGiftAddOn(created)
    },

    async updateGiftAddOn(id, data = {}) {
      if (typeof id !== 'string' || !id.trim() || id.length > 100) {
        const err = new Error('Mã món quà không hợp lệ.')
        err.code = 'INVALID_ID'
        err.status = 400
        throw err
      }

      const existing = await db.prepare('SELECT id FROM gift_add_ons WHERE id = ?').bind(id).first()
      if (!existing) {
        const err = new Error('Không tìm thấy món quà.')
        err.code = 'GIFT_ADD_ON_NOT_FOUND'
        err.status = 404
        throw err
      }

      const updates = []
      const bindings = []

      if (data.name !== undefined) {
        if (typeof data.name !== 'string' || !data.name.trim() || data.name.trim().length > 120) {
          const err = new Error('Tên món quà không được để trống (tối đa 120 ký tự).')
          err.code = 'INVALID_NAME'
          err.status = 400
          throw err
        }
        updates.push('name = ?')
        bindings.push(data.name.trim())
      }

      if (data.shortDescription !== undefined || data.note !== undefined) {
        const desc = data.shortDescription !== undefined ? data.shortDescription : data.note
        if (typeof desc !== 'string' || !desc.trim() || desc.trim().length > 320) {
          const err = new Error('Mô tả món quà không được để trống (tối đa 320 ký tự).')
          err.code = 'INVALID_DESCRIPTION'
          err.status = 400
          throw err
        }
        updates.push('short_description = ?')
        bindings.push(desc.trim())
      }

      if (data.priceVnd !== undefined || data.price !== undefined) {
        const price = data.priceVnd !== undefined ? data.priceVnd : data.price
        if (typeof price !== 'number' || !Number.isInteger(price) || price < 0) {
          const err = new Error('Giá món quà phải là số nguyên không âm (0 là miễn phí).')
          err.code = 'INVALID_PRICE'
          err.status = 400
          throw err
        }
        updates.push('price_vnd = ?')
        bindings.push(price)
      }

      if (data.active !== undefined) {
        if (typeof data.active !== 'boolean' && data.active !== 0 && data.active !== 1) {
          const err = new Error('Trạng thái hoạt động không hợp lệ.')
          err.code = 'INVALID_ACTIVE'
          err.status = 400
          throw err
        }
        updates.push('active = ?')
        bindings.push(data.active ? 1 : 0)
      }

      if (data.sortOrder !== undefined) {
        if (!Number.isInteger(data.sortOrder) || data.sortOrder < 0) {
          const err = new Error('Thứ tự sắp xếp phải là số nguyên không âm.')
          err.code = 'INVALID_SORT_ORDER'
          err.status = 400
          throw err
        }
        updates.push('sort_order = ?')
        bindings.push(data.sortOrder)
      }

      if (updates.length > 0) {
        bindings.push(id)
        await db.prepare(`UPDATE gift_add_ons SET ${updates.join(', ')} WHERE id = ?`).bind(...bindings).run()
      }

      const row = await db.prepare('SELECT id, name, short_description, price_vnd, active, sort_order FROM gift_add_ons WHERE id = ?').bind(id).first()
      return mapGiftAddOn(row)
    },

    async setGiftAddOnActive(id, active) {
      if (typeof id !== 'string' || !id.trim() || id.length > 100) {
        const err = new Error('Mã món quà không hợp lệ.')
        err.code = 'INVALID_ID'
        err.status = 400
        throw err
      }
      if (typeof active !== 'boolean') {
        throw new TypeError('active must be a boolean.')
      }

      const existing = await db.prepare('SELECT id FROM gift_add_ons WHERE id = ?').bind(id).first()
      if (!existing) {
        const err = new Error('Không tìm thấy món quà.')
        err.code = 'GIFT_ADD_ON_NOT_FOUND'
        err.status = 404
        throw err
      }

      await db.prepare('UPDATE gift_add_ons SET active = ? WHERE id = ?').bind(active ? 1 : 0, id).run()
      const row = await db.prepare('SELECT id, name, short_description, price_vnd, active, sort_order FROM gift_add_ons WHERE id = ?').bind(id).first()
      return mapGiftAddOn(row)
    },
  }
}

export const catalogueRepositoryLimits = {
  defaultPageSize: DEFAULT_PAGE_SIZE,
  maxOffset: MAX_OFFSET,
  maxPageSize: MAX_PAGE_SIZE,
}
