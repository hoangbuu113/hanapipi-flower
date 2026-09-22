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
    updated_at_utc
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

    async getProductById(id) {
      if (typeof id !== 'string' || id.length === 0 || id.length > 100) return null
      return mapProduct(await db.prepare(`${PRODUCT_SELECT} WHERE id = ? LIMIT 1`).bind(id).first())
    },

    async getProductBySlug(slug) {
      if (typeof slug !== 'string' || slug.length === 0 || slug.length > 100) return null
      return mapProduct(await db.prepare(`${PRODUCT_SELECT} WHERE slug = ? LIMIT 1`).bind(slug).first())
    },

    async listProducts(options = {}) {
      const {
        activeOnly = true,
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

      return {
        items: results.map(mapProduct),
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

      if (updates.length === 0) {
        return product
      }

      const now = new Date().toISOString()
      updates.push('updated_at_utc = ?')
      bindings.push(now)
      bindings.push(product.id)

      const sql = `UPDATE products SET ${updates.join(', ')} WHERE id = ?`
      await db.prepare(sql).bind(...bindings).run()

      return this.getProductById(product.id)
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
      if (product.active === (nextActive === 1)) return product

      await db.prepare(`
        UPDATE products
        SET active = ?, updated_at_utc = ?
        WHERE id = ?
      `).bind(nextActive, new Date().toISOString(), product.id).run()

      return this.getProductById(product.id)
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
          sort_order, catalogue_version_id, created_at_utc, updated_at_utc
        ) VALUES (
          ?, ?, ?, ?, ?, ?, 'standard',
          ?, 'VND', ?, ?, ?, ?, ?,
          ?, ?, ?, ?, 0, ?,
          ?, ?, ?, ?
        )
      `).bind(
        id, slug, name, shortDescription, description, collection,
        price, status, JSON.stringify(badges), JSON.stringify(colors), JSON.stringify(moods), JSON.stringify(occasions),
        JSON.stringify(composition), JSON.stringify(media), careNote, deliveryNote, active,
        sortOrder, activeVersion.version, now, now
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

      return this.getProductById(id)
    },
  }
}

export const catalogueRepositoryLimits = {
  defaultPageSize: DEFAULT_PAGE_SIZE,
  maxOffset: MAX_OFFSET,
  maxPageSize: MAX_PAGE_SIZE,
}
