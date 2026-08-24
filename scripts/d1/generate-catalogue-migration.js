import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createCatalogueSeed } from '../../db/seed/catalogueSeed.js'

export const CATALOGUE_MIGRATION_FILE = '0002_phase16_catalogue_seed.sql'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDirectory, '..', '..')
const migrationPath = join(projectRoot, 'drizzle', CATALOGUE_MIGRATION_FILE)

function sqlLiteral(value) {
  if (value == null) return 'NULL'
  if (Number.isSafeInteger(value)) return String(value)
  if (typeof value === 'string') {
    if (value.includes('\0')) throw new Error('Catalogue migration cannot contain NUL characters.')
    return `'${value.replace(/'/gu, "''")}'`
  }
  throw new TypeError(`Unsupported catalogue migration value: ${typeof value}`)
}

function renderUpsert({ columns, conflictColumns, rows, table, updateColumns }) {
  if (rows.length === 0) throw new Error(`Cannot generate an empty ${table} seed.`)
  const valueRows = rows
    .map((row) => `  (${columns.map((column) => sqlLiteral(row[column])).join(', ')})`)
    .join(',\n')
  const updates = updateColumns
    .map((column) => `  ${column} = excluded.${column}`)
    .join(',\n')

  return `INSERT INTO ${table} (\n  ${columns.join(', ')}\n) VALUES\n${valueRows}\nON CONFLICT(${conflictColumns.join(', ')}) DO UPDATE SET\n${updates};`
}

function toProductRow(row) {
  return {
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
  }
}

function toVariantRow(row) {
  return {
    active: row.active,
    catalogue_version_id: row.catalogueVersionId,
    code: row.code,
    id: row.id,
    label: row.label,
    note: row.note,
    option_type: row.optionType,
    price_delta_vnd: row.priceDeltaVnd,
    price_vnd: row.priceVnd,
    product_id: row.productId,
    sort_order: row.sortOrder,
  }
}

function toRelationRow(row) {
  return {
    product_id: row.productId,
    related_product_id: row.relatedProductId,
    sort_order: row.sortOrder,
  }
}

function toBouquetRow(row) {
  return {
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
  }
}

function toGiftAddOnRow(row) {
  return {
    active: row.active,
    catalogue_version_id: row.catalogueVersionId,
    id: row.id,
    name: row.name,
    price_vnd: row.priceVnd,
    short_description: row.shortDescription,
    sort_order: row.sortOrder,
  }
}

export async function createCatalogueMigrationSql() {
  const seed = await createCatalogueSeed()
  const migrationChecksum = createHash('sha256')
    .update(`${CATALOGUE_MIGRATION_FILE}:${seed.checksum}`)
    .digest('hex')

  const catalogueVersion = renderUpsert({
    columns: [
      'version', 'checksum', 'product_count', 'purchasable_count',
      'gift_add_on_count', 'active', 'seeded_at_utc',
    ],
    conflictColumns: ['version'],
    rows: [{
      active: 1,
      checksum: seed.checksum,
      gift_add_on_count: seed.giftAddOnRows.length,
      product_count: seed.productRows.length,
      purchasable_count: seed.productRows.filter(({ purchaseType }) => purchaseType === 'standard').length,
      seeded_at_utc: seed.seededAtUtc,
      version: seed.version,
    }],
    table: 'catalogue_versions',
    updateColumns: [
      'checksum', 'product_count', 'purchasable_count', 'gift_add_on_count',
      'active', 'seeded_at_utc',
    ],
  })

  const productColumns = [
    'id', 'slug', 'name', 'short_description', 'description', 'collection',
    'purchase_type', 'price_vnd', 'currency', 'status', 'badges_json', 'colors_json',
    'moods_json', 'occasions_json', 'composition_json', 'media_json', 'care_note',
    'delivery_note', 'is_best_seller', 'active', 'sort_order', 'catalogue_version_id',
    'created_at_utc', 'updated_at_utc',
  ]
  const productsSql = renderUpsert({
    columns: productColumns,
    conflictColumns: ['id'],
    rows: seed.productRows.map(toProductRow),
    table: 'products',
    updateColumns: productColumns.filter((column) => column !== 'id'),
  })

  const variantColumns = [
    'id', 'product_id', 'option_type', 'code', 'label', 'note', 'price_vnd',
    'price_delta_vnd', 'active', 'sort_order', 'catalogue_version_id',
  ]
  const variantsSql = renderUpsert({
    columns: variantColumns,
    conflictColumns: ['id'],
    rows: seed.variantRows.map(toVariantRow),
    table: 'product_variants',
    updateColumns: variantColumns.filter((column) => column !== 'id'),
  })

  const relationsSql = renderUpsert({
    columns: ['product_id', 'related_product_id', 'sort_order'],
    conflictColumns: ['product_id', 'related_product_id'],
    rows: seed.relationRows.map(toRelationRow),
    table: 'product_relations',
    updateColumns: ['sort_order'],
  })

  const bouquetColumns = [
    'id', 'option_type', 'option_code', 'label', 'description', 'note', 'colors_json',
    'base_price_vnd', 'price_delta_vnd', 'active', 'sort_order', 'catalogue_version_id',
  ]
  const bouquetSql = renderUpsert({
    columns: bouquetColumns,
    conflictColumns: ['id'],
    rows: seed.bouquetOptionRows.map(toBouquetRow),
    table: 'bouquet_options',
    updateColumns: bouquetColumns.filter((column) => column !== 'id'),
  })

  const giftAddOnColumns = [
    'id', 'name', 'short_description', 'price_vnd', 'active', 'sort_order',
    'catalogue_version_id',
  ]
  const giftAddOnsSql = renderUpsert({
    columns: giftAddOnColumns,
    conflictColumns: ['id'],
    rows: seed.giftAddOnRows.map(toGiftAddOnRow),
    table: 'gift_add_ons',
    updateColumns: giftAddOnColumns.filter((column) => column !== 'id'),
  })

  return `-- Generated by scripts/d1/generate-catalogue-migration.js.\n-- Source catalogue checksum: ${seed.checksum}\n-- Do not edit this migration by hand.\n\nUPDATE catalogue_versions SET active = 0 WHERE active = 1;\n\n${catalogueVersion}\n\n${productsSql}\n\n${variantsSql}\n\n${relationsSql}\n\n${bouquetSql}\n\n${giftAddOnsSql}\n\nINSERT INTO schema_versions (version, name, checksum, applied_at_utc)\nVALUES (\n  '0002_phase16_catalogue_seed',\n  'Phase 16 deterministic catalogue seed',\n  '${migrationChecksum}',\n  '${seed.seededAtUtc}'\n)\nON CONFLICT(version) DO NOTHING;\n\nPRAGMA optimize;\n`
}

export async function writeCatalogueMigration() {
  const sql = await createCatalogueMigrationSql()
  await writeFile(migrationPath, sql, 'utf8')
  return migrationPath
}

export async function verifyCatalogueMigration() {
  const expected = await createCatalogueMigrationSql()
  const actual = await readFile(migrationPath, 'utf8')
  if (actual !== expected) {
    throw new Error(`${CATALOGUE_MIGRATION_FILE} is not synchronized with the current catalogue seed.`)
  }
  return migrationPath
}

const isMain = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url

if (isMain) {
  const checkOnly = process.argv.includes('--check')
  const outputPath = checkOnly
    ? await verifyCatalogueMigration()
    : await writeCatalogueMigration()
  process.stdout.write(`${checkOnly ? 'Verified' : 'Generated'} ${outputPath}\n`)
}

