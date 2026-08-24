import { bouquetOptions } from '../../src/data/bouquetOptions.js'
import { giftAddOns } from '../../src/data/giftAddOns.js'
import { bouquetPrices, productPrices } from '../../src/data/prices.js'
import { products } from '../../src/data/products.js'

export const CATALOGUE_VERSION = 'catalogue-2026-08-24-v1'
export const CATALOGUE_SEEDED_AT_UTC = '2026-08-24T00:00:00.000Z'

const PRODUCT_STATUS = new Map([
  ['Có sẵn', 'available'],
  ['Theo mùa', 'seasonal'],
  ['Đặt trước', 'preorder'],
])

const BOUQUET_OPTION_TYPES = [
  ['styles', 'style'],
  ['palettes', 'palette'],
  ['sizes', 'size'],
  ['flowers', 'flower'],
  ['wrappings', 'wrapping'],
]

function assert(condition, message) {
  if (!condition) throw new Error(`Catalogue seed invariant failed: ${message}`)
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function normalizeMediaReference(value, fieldName) {
  assert(typeof value === 'string' && value.startsWith('src/assets/'), `${fieldName} must be a local asset reference`)
  assert(!value.includes('49ce5412-ca99-45e1-8347-b8b6e8957cf1 (1).jfif'), 'deleted Hồng Sương duplicate is referenced')
  return value.replace(/\\/gu, '/')
}

function normalizeMediaItem(item) {
  assert(item && typeof item === 'object', 'product media entry must be an object')
  const type = item.type ?? 'image'
  assert(type === 'image' || type === 'video', 'product media type is unsupported')

  return {
    alt: typeof item.alt === 'string' ? item.alt : '',
    caption: typeof item.caption === 'string' ? item.caption : null,
    fit: item.fit === 'contain' ? 'contain' : 'cover',
    position: typeof item.position === 'string' ? item.position : 'center',
    poster: item.poster ? normalizeMediaReference(item.poster, 'poster') : null,
    src: normalizeMediaReference(item.src, 'src'),
    type,
  }
}

function createProductRows() {
  const priceIds = new Set(Object.keys(productPrices))
  const productIds = new Set(products.map(({ id }) => id))
  const productSlugs = new Set(products.map(({ slug }) => slug))

  assert(products.length === 24, `expected 24 products, received ${products.length}`)
  assert(productIds.size === products.length, 'product IDs must be unique')
  assert(productSlugs.size === products.length, 'product slugs must be unique')
  assert(priceIds.size === 23, `expected 23 centralized product prices, received ${priceIds.size}`)

  const productRows = []
  const variantRows = []
  const relationRows = []

  products.forEach((product, productIndex) => {
    const purchaseType = product.purchaseType ?? 'standard'
    const status = PRODUCT_STATUS.get(product.status)
    const centralizedPrice = productPrices[product.id]
    const mediaSource = product.media?.length
      ? product.media
      : product.images.map((image) => ({ ...image, type: 'image' }))

    assert(/^[a-z0-9-]+$/u.test(product.id), `invalid product ID ${product.id}`)
    assert(/^[a-z0-9-]+$/u.test(product.slug), `invalid product slug ${product.slug}`)
    assert(status, `unsupported product status for ${product.id}`)
    assert(['standard', 'priceless'].includes(purchaseType), `unsupported purchase type for ${product.id}`)
    assert(Array.isArray(mediaSource) && mediaSource.length > 0, `${product.id} has no media`)

    if (purchaseType === 'standard') {
      assert(Number.isInteger(centralizedPrice) && centralizedPrice >= 0, `${product.id} must use an integer centralized price`)
      assert(product.price === centralizedPrice, `${product.id} does not match the centralized price source`)
      assert(priceIds.has(product.id), `${product.id} is missing from productPrices`)
    } else {
      assert(product.id === 'no-watering-flower', 'only no-watering-flower may be priceless')
      assert(product.slug === 'no-watering-flower', 'priceless product slug changed')
      assert(centralizedPrice == null && product.price == null, 'priceless product must not have a numeric price')
      assert(!priceIds.has(product.id), 'priceless product must not appear in productPrices')
      assert(product.sizeOptions.length === 0 && product.wrappingOptions.length === 0, 'priceless product must not have commerce variants')
    }

    const normalizedMedia = mediaSource.map(normalizeMediaItem)
    if (product.id === 'blush-atelier') {
      assert(normalizedMedia.length === 1, 'Hồng Sương must have exactly one surviving gallery image')
      assert(
        normalizedMedia[0].src.endsWith('/49ce5412-ca99-45e1-8347-b8b6e8957cf1.jfif'),
        'Hồng Sương must use the surviving image file',
      )
    }

    productRows.push({
      active: 1,
      badgesJson: JSON.stringify(product.badges ?? []),
      careNote: product.careNote,
      catalogueVersionId: CATALOGUE_VERSION,
      collection: product.collection,
      colorsJson: JSON.stringify(product.colorPalette ?? []),
      compositionJson: JSON.stringify(product.flowerComposition ?? []),
      createdAtUtc: `${product.createdAt}T00:00:00.000Z`,
      deliveryNote: product.deliveryNote,
      description: product.description,
      id: product.id,
      isBestSeller: product.isBestSeller ? 1 : 0,
      mediaJson: JSON.stringify(normalizedMedia),
      moodsJson: JSON.stringify(product.moods ?? []),
      name: product.name,
      occasionsJson: JSON.stringify(product.occasions ?? []),
      priceVnd: purchaseType === 'priceless' ? null : centralizedPrice,
      purchaseType,
      shortDescription: product.shortDescription,
      slug: product.slug,
      sortOrder: productIndex,
      status,
      updatedAtUtc: CATALOGUE_SEEDED_AT_UTC,
    })

    product.sizeOptions.forEach((option, optionIndex) => {
      assert(Number.isInteger(option.price) && option.price >= 0, `${product.id}/${option.id} size price must be a non-negative integer`)
      variantRows.push({
        active: 1,
        catalogueVersionId: CATALOGUE_VERSION,
        code: option.id,
        id: `product:${product.id}:size:${option.id}`,
        label: option.label,
        note: null,
        optionType: 'size',
        priceDeltaVnd: 0,
        priceVnd: option.price,
        productId: product.id,
        sortOrder: optionIndex,
      })
    })

    product.wrappingOptions.forEach((option, optionIndex) => {
      variantRows.push({
        active: 1,
        catalogueVersionId: CATALOGUE_VERSION,
        code: option.id,
        id: `product:${product.id}:wrapping:${option.id}`,
        label: option.label,
        note: option.note ?? null,
        optionType: 'wrapping',
        priceDeltaVnd: 0,
        priceVnd: null,
        productId: product.id,
        sortOrder: optionIndex,
      })
    })

    const relatedIds = product.relatedProductIds ?? []
    assert(new Set(relatedIds).size === relatedIds.length, `${product.id} has duplicate related products`)
    relatedIds.forEach((relatedProductId, relatedIndex) => {
      assert(productIds.has(relatedProductId), `${product.id} references missing related product ${relatedProductId}`)
      assert(relatedProductId !== product.id, `${product.id} cannot relate to itself`)
      relationRows.push({
        productId: product.id,
        relatedProductId,
        sortOrder: relatedIndex,
      })
    })
  })

  assert(productRows.filter(({ purchaseType }) => purchaseType === 'standard').length === 23, 'expected 23 purchasable products')
  assert(productRows.filter(({ purchaseType }) => purchaseType === 'priceless').length === 1, 'expected one priceless product')

  return { productRows, relationRows, variantRows }
}

function createBouquetRows() {
  const rows = []

  BOUQUET_OPTION_TYPES.forEach(([sourceKey, optionType]) => {
    bouquetOptions[sourceKey].forEach((option, sortOrder) => {
      const sourcePrice = option.price ?? 0
      assert(Number.isInteger(sourcePrice) && sourcePrice >= 0, `${optionType}/${option.id} price must be a non-negative integer`)

      if (optionType === 'size') {
        assert(sourcePrice === bouquetPrices.sizes[option.id], `${optionType}/${option.id} must match bouquetPrices`)
      } else if (optionType === 'flower') {
        assert(sourcePrice === bouquetPrices.flowers[option.id], `${optionType}/${option.id} must match bouquetPrices`)
      } else if (optionType === 'wrapping') {
        assert(sourcePrice === bouquetPrices.wrappings[option.id], `${optionType}/${option.id} must match bouquetPrices`)
      }

      rows.push({
        active: 1,
        basePriceVnd: optionType === 'size' ? sourcePrice : null,
        catalogueVersionId: CATALOGUE_VERSION,
        colorsJson: JSON.stringify(option.colors ?? []),
        description: option.description ?? null,
        id: `bouquet:${optionType}:${option.id}`,
        label: option.label,
        note: option.note ?? null,
        optionCode: option.id,
        optionType,
        priceDeltaVnd: ['flower', 'wrapping'].includes(optionType) ? sourcePrice : 0,
        sortOrder,
      })
    })
  })

  assert(new Set(rows.map(({ id }) => id)).size === rows.length, 'bouquet option IDs must be unique')
  return rows
}

function createGiftAddOnRows() {
  assert(giftAddOns.length === 4, `expected 4 gift add-ons, received ${giftAddOns.length}`)

  return giftAddOns.map((addOn, sortOrder) => {
    assert(Number.isInteger(addOn.price) && addOn.price >= 0, `${addOn.id} price must be a non-negative integer`)
    return {
      active: 1,
      catalogueVersionId: CATALOGUE_VERSION,
      id: addOn.id,
      name: addOn.name,
      priceVnd: addOn.price,
      shortDescription: addOn.note,
      sortOrder,
    }
  })
}

export async function createCatalogueSeed() {
  const { productRows, relationRows, variantRows } = createProductRows()
  const bouquetOptionRows = createBouquetRows()
  const giftAddOnRows = createGiftAddOnRows()
  const checksumPayload = {
    bouquetOptionRows,
    giftAddOnRows,
    productRows,
    relationRows,
    variantRows,
    version: CATALOGUE_VERSION,
  }

  return {
    ...checksumPayload,
    checksum: await sha256(stableStringify(checksumPayload)),
    seededAtUtc: CATALOGUE_SEEDED_AT_UTC,
  }
}

function values(row, columns) {
  return columns.map((column) => row[column])
}

function createUpsertStatement(db, table, columns, conflictColumn, updateColumns, row) {
  const placeholders = columns.map(() => '?').join(', ')
  const updates = updateColumns.map((column) => `${column} = excluded.${column}`).join(', ')
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT(${conflictColumn}) DO UPDATE SET ${updates}`
  return db.prepare(sql).bind(...values(row, columns))
}

async function assertNoUnexpectedRows(db, table, expectedIds) {
  const { results = [] } = await db.prepare(`SELECT id FROM ${table} ORDER BY id`).all()
  const expectedIdSet = new Set(expectedIds)
  const unexpectedIds = results.map(({ id }) => id).filter((id) => !expectedIdSet.has(id))
  assert(unexpectedIds.length === 0, `${table} contains unexpected IDs: ${unexpectedIds.join(', ')}`)
}

export async function seedCatalogue(db) {
  assert(db?.prepare && db?.batch, 'a D1-compatible database binding is required')
  const seed = await createCatalogueSeed()

  await assertNoUnexpectedRows(db, 'products', seed.productRows.map(({ id }) => id))
  await assertNoUnexpectedRows(db, 'product_variants', seed.variantRows.map(({ id }) => id))
  await assertNoUnexpectedRows(db, 'bouquet_options', seed.bouquetOptionRows.map(({ id }) => id))
  await assertNoUnexpectedRows(db, 'gift_add_ons', seed.giftAddOnRows.map(({ id }) => id))

  const statements = [
    db.prepare('UPDATE catalogue_versions SET active = 0 WHERE active = 1'),
    db.prepare(`
      INSERT INTO catalogue_versions (
        version, checksum, product_count, purchasable_count, gift_add_on_count, active, seeded_at_utc
      ) VALUES (?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(version) DO UPDATE SET
        checksum = excluded.checksum,
        product_count = excluded.product_count,
        purchasable_count = excluded.purchasable_count,
        gift_add_on_count = excluded.gift_add_on_count,
        active = 1,
        seeded_at_utc = excluded.seeded_at_utc
    `).bind(
      seed.version,
      seed.checksum,
      seed.productRows.length,
      seed.productRows.filter(({ purchaseType }) => purchaseType === 'standard').length,
      seed.giftAddOnRows.length,
      seed.seededAtUtc,
    ),
    db.prepare('DELETE FROM product_relations'),
    db.prepare('DELETE FROM product_variants'),
  ]

  const productColumns = [
    'id', 'slug', 'name', 'short_description', 'description', 'collection', 'purchase_type',
    'price_vnd', 'currency', 'status', 'badges_json', 'colors_json', 'moods_json',
    'occasions_json', 'composition_json', 'media_json', 'care_note', 'delivery_note',
    'is_best_seller', 'active', 'sort_order', 'catalogue_version_id', 'created_at_utc',
    'updated_at_utc',
  ]
  const productUpdateColumns = productColumns.filter((column) => column !== 'id')
  seed.productRows.forEach((row) => {
    statements.push(createUpsertStatement(db, 'products', productColumns, 'id', productUpdateColumns, {
      active: row.active,
      badges_json: row.badgesJson,
      care_note: row.careNote,
      catalogue_version_id: row.catalogueVersionId,
      collection: row.collection,
      colors_json: row.colorsJson,
      composition_json: row.compositionJson,
      created_at_utc: row.createdAtUtc,
      currency: 'VND',
      delivery_note: row.deliveryNote,
      description: row.description,
      id: row.id,
      is_best_seller: row.isBestSeller,
      media_json: row.mediaJson,
      moods_json: row.moodsJson,
      name: row.name,
      occasions_json: row.occasionsJson,
      price_vnd: row.priceVnd,
      purchase_type: row.purchaseType,
      short_description: row.shortDescription,
      slug: row.slug,
      sort_order: row.sortOrder,
      status: row.status,
      updated_at_utc: row.updatedAtUtc,
    }))
  })

  const variantSql = `
    INSERT INTO product_variants (
      id, product_id, option_type, code, label, note, price_vnd, price_delta_vnd,
      active, sort_order, catalogue_version_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  seed.variantRows.forEach((row) => {
    statements.push(db.prepare(variantSql).bind(
      row.id,
      row.productId,
      row.optionType,
      row.code,
      row.label,
      row.note,
      row.priceVnd,
      row.priceDeltaVnd,
      row.active,
      row.sortOrder,
      row.catalogueVersionId,
    ))
  })

  seed.relationRows.forEach((row) => {
    statements.push(db.prepare(`
      INSERT INTO product_relations (product_id, related_product_id, sort_order)
      VALUES (?, ?, ?)
    `).bind(row.productId, row.relatedProductId, row.sortOrder))
  })

  const bouquetColumns = [
    'id', 'option_type', 'option_code', 'label', 'description', 'note', 'colors_json',
    'base_price_vnd', 'price_delta_vnd', 'active', 'sort_order', 'catalogue_version_id',
  ]
  const bouquetUpdateColumns = bouquetColumns.filter((column) => column !== 'id')
  seed.bouquetOptionRows.forEach((row) => {
    statements.push(createUpsertStatement(db, 'bouquet_options', bouquetColumns, 'id', bouquetUpdateColumns, {
      active: row.active,
      base_price_vnd: row.basePriceVnd,
      catalogue_version_id: row.catalogueVersionId,
      colors_json: row.colorsJson,
      description: row.description,
      id: row.id,
      label: row.label,
      note: row.note,
      option_code: row.optionCode,
      option_type: row.optionType,
      price_delta_vnd: row.priceDeltaVnd,
      sort_order: row.sortOrder,
    }))
  })

  const giftColumns = [
    'id', 'name', 'short_description', 'price_vnd', 'active', 'sort_order',
    'catalogue_version_id',
  ]
  const giftUpdateColumns = giftColumns.filter((column) => column !== 'id')
  seed.giftAddOnRows.forEach((row) => {
    statements.push(createUpsertStatement(db, 'gift_add_ons', giftColumns, 'id', giftUpdateColumns, {
      active: row.active,
      catalogue_version_id: row.catalogueVersionId,
      id: row.id,
      name: row.name,
      price_vnd: row.priceVnd,
      short_description: row.shortDescription,
      sort_order: row.sortOrder,
    }))
  })

  await db.batch(statements)
  await db.prepare('PRAGMA optimize').run()
  return seed
}

