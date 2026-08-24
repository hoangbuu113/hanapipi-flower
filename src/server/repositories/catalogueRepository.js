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
  }
}

export const catalogueRepositoryLimits = {
  defaultPageSize: DEFAULT_PAGE_SIZE,
  maxOffset: MAX_OFFSET,
  maxPageSize: MAX_PAGE_SIZE,
}

