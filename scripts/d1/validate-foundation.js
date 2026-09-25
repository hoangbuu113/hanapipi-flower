import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { DatabaseSync, backup } from 'node:sqlite'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { createCatalogueSeed } from '../../db/seed/catalogueSeed.js'
import {
  catalogueRepositoryLimits,
  createCatalogueRepository,
} from '../../src/server/repositories/catalogueRepository.js'
import { createUserRepository } from '../../src/server/repositories/userRepository.js'
import { LocalD1Database } from './local-d1.js'
import { verifyCatalogueMigration } from './generate-catalogue-migration.js'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDirectory, '..', '..')
const migrationDirectory = join(projectRoot, 'drizzle')

const EXPECTED_TABLES = new Set([
  'audit_events',
  'bouquet_options',
  'cart_item_add_ons',
  'cart_items',
  'carts',
  'catalogue_versions',
  'delivery_drafts',
  'gift_add_ons',
  'idempotency_keys',
  'order_item_add_ons',
  'order_items',
  'orders',
  'product_relations',
  'product_variants',
  'products',
  'schema_versions',
  'user_addresses',
  'users',
  'wishlist_items',
  'wishlists',
])

const QUERY_PLANS = [
  {
    index: 'uq_products_slug',
    label: 'product by slug',
    parameters: ['nang-diu'],
    sql: 'SELECT id FROM products WHERE slug = ?',
  },
  {
    index: 'idx_products_active_purchase_price',
    label: 'purchasable catalogue by price',
    parameters: [1000000],
    sql: `
      SELECT id FROM products
      WHERE active = 1 AND purchase_type = 'standard' AND price_vnd <= ?
      ORDER BY price_vnd, sort_order
      LIMIT 24
    `,
  },
  {
    index: 'uq_users_provider_subject',
    label: 'managed identity mapping',
    parameters: ['clerk', 'provider-subject'],
    sql: 'SELECT id FROM users WHERE auth_provider = ? AND provider_subject = ?',
  },
  {
    index: 'idx_carts_user_state_updated',
    label: 'active cart ownership',
    parameters: ['user-id'],
    sql: "SELECT id FROM carts WHERE user_id = ? AND state = 'active'",
  },
  {
    index: 'idx_orders_user_created_at',
    label: 'customer order history',
    parameters: ['user-id'],
    sql: 'SELECT id FROM orders WHERE user_id = ? ORDER BY created_at_utc DESC LIMIT 20',
  },
  {
    index: 'idx_orders_status_created_at',
    label: 'admin status queue',
    parameters: ['received'],
    sql: 'SELECT id FROM orders WHERE status = ? ORDER BY created_at_utc DESC LIMIT 20',
  },
  {
    index: 'uq_idempotency_user_action_key',
    label: 'idempotency lookup',
    parameters: ['user-id', 'create-order', '0'.repeat(64)],
    sql: 'SELECT id FROM idempotency_keys WHERE user_id = ? AND action = ? AND key_hash = ?',
  },
  {
    index: 'idx_audit_events_entity_action_created',
    label: 'entity audit history',
    parameters: ['order', 'order-id', 'status-change'],
    sql: `
      SELECT id FROM audit_events
      WHERE entity_type = ? AND entity_id = ? AND action = ?
      ORDER BY created_at_utc DESC LIMIT 50
    `,
  },
  {
    index: 'idx_user_addresses_user_created',
    label: 'customer saved addresses',
    parameters: ['user-id'],
    sql: 'SELECT id FROM user_addresses WHERE user_id = ? AND deleted_at_utc IS NULL ORDER BY created_at_utc DESC',
  },
]

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function scalar(database, sql, parameters = []) {
  const row = database.prepare(sql).get(...parameters)
  return row ? Object.values(row)[0] : null
}

async function applyMigrations(database) {
  const migrationFiles = (await readdir(migrationDirectory))
    .filter((fileName) => /^\d+_.+\.sql$/u.test(fileName))
    .sort()
  assert(migrationFiles.length > 0, 'No versioned D1 migrations were found.')

  for (const fileName of migrationFiles) {
    const hasSchemaTable = scalar(database, "SELECT COUNT(*) FROM sqlite_schema WHERE type = 'table' AND name = 'schema_versions'")
    if (hasSchemaTable > 0) {
      const version = fileName.replace(/\.sql$/u, '')
      const applied = scalar(database, 'SELECT COUNT(*) FROM schema_versions WHERE version = ?', [version])
      if (applied > 0) continue
    }
    database.exec(await readFile(join(migrationDirectory, fileName), 'utf8'))
  }
  return migrationFiles
}

function readSnapshot(database) {
  return {
    bouquetOptions: scalar(database, 'SELECT COUNT(*) FROM bouquet_options'),
    catalogueChecksum: scalar(database, 'SELECT checksum FROM catalogue_versions WHERE active = 1'),
    giftAddOns: scalar(database, 'SELECT COUNT(*) FROM gift_add_ons'),
    productRelations: scalar(database, 'SELECT COUNT(*) FROM product_relations'),
    productVariants: scalar(database, 'SELECT COUNT(*) FROM product_variants'),
    products: scalar(database, 'SELECT COUNT(*) FROM products'),
    purchasableProducts: scalar(database, "SELECT COUNT(*) FROM products WHERE active = 1 AND purchase_type = 'standard' AND price_vnd IS NOT NULL"),
  }
}

function assertSchema(database) {
  const tableNames = new Set(database.prepare(`
    SELECT name
    FROM sqlite_schema
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
  `).all().map(({ name }) => name))
  assert(tableNames.size === EXPECTED_TABLES.size, `Expected ${EXPECTED_TABLES.size} tables, received ${tableNames.size}.`)
  EXPECTED_TABLES.forEach((tableName) => assert(tableNames.has(tableName), `Missing table ${tableName}.`))

  const forbiddenColumnPattern = /(^|_)(password|password_hash|session_token|refresh_token|authorization|groq|turnstile|card_number|cvv|expiry_date|bank_password|payment_token)($|_)/iu
  const columns = database.prepare(`
    SELECT schemas.name AS table_name, columns.name AS column_name
    FROM sqlite_schema AS schemas
    JOIN pragma_table_info(schemas.name) AS columns
    WHERE schemas.type = 'table' AND schemas.name NOT LIKE 'sqlite_%'
  `).all()
  const forbiddenColumns = columns.filter(({ column_name: columnName }) => forbiddenColumnPattern.test(columnName))
  assert(forbiddenColumns.length === 0, `Forbidden columns found: ${JSON.stringify(forbiddenColumns)}`)

  const orderSql = scalar(database, "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'orders'")
  assert(orderSql.includes("payment_method IN ('momo', 'bank_transfer')"), 'Payment method constraint is missing.')
  assert(orderSql.includes('buyer_contact_ciphertext') && orderSql.includes('fulfilment_key_version'), 'Fulfilment ciphertext/key-version fields are missing.')
  assert(orderSql.includes('guest_access_token_hash') && orderSql.includes('CHECK ((user_id IS NULL) != (guest_access_token_hash IS NULL))'), 'Guest ownership constraint is missing.')
  const userIdColumn = database.prepare("SELECT \"notnull\" FROM pragma_table_info('orders') WHERE name = 'user_id'").get()
  assert(userIdColumn?.notnull === 0, 'Guest orders must allow NULL user_id.')
}

function assertInvariants(database, expectedChecksum) {
  assert(scalar(database, 'SELECT COUNT(*) FROM products') === 24, 'Expected 24 products.')
  assert(
    scalar(database, "SELECT COUNT(*) FROM products WHERE active = 1 AND purchase_type = 'standard' AND price_vnd IS NOT NULL") === 23,
    'Expected 23 purchasable products.',
  )
  assert(scalar(database, "SELECT COUNT(*) FROM products WHERE purchase_type = 'priceless'") === 1, 'Expected one priceless product.')

  const priceless = database.prepare(`
    SELECT id, slug, purchase_type, price_vnd, active
    FROM products
    WHERE id = 'no-watering-flower'
  `).get()
  assert(priceless?.slug === 'no-watering-flower', 'Priceless product slug is incorrect.')
  assert(priceless?.purchase_type === 'priceless' && priceless?.price_vnd === null, 'Priceless product has an invalid price state.')
  assert(
    scalar(database, "SELECT COUNT(*) FROM products WHERE active = 1 AND purchase_type = 'standard' AND id = 'no-watering-flower'") === 0,
    'Priceless product appeared in the purchasable query.',
  )
  assert(scalar(database, 'SELECT COUNT(*) FROM gift_add_ons') === 4, 'Expected four gift add-ons.')
  assert(scalar(database, 'SELECT COUNT(*) FROM product_variants') === 115, 'Expected 115 product variants.')
  assert(scalar(database, 'SELECT COUNT(*) FROM product_relations') === 72, 'Expected 72 product relations.')
  assert(scalar(database, 'SELECT COUNT(*) FROM bouquet_options') === 19, 'Expected 19 bouquet options.')
  assert(scalar(database, 'SELECT COUNT(*) FROM users') === 0, 'Seed must not create users.')
  assert(scalar(database, 'SELECT COUNT(*) FROM carts') === 0, 'Seed must not create carts.')
  assert(scalar(database, 'SELECT COUNT(*) FROM wishlists') === 0, 'Seed must not create wishlists.')
  assert(scalar(database, 'SELECT COUNT(*) FROM orders') === 0, 'Seed must not create orders.')
  assert(scalar(database, 'SELECT COUNT(*) FROM audit_events') === 0, 'Seed must not create audit fixtures.')
  assert(scalar(database, 'SELECT checksum FROM catalogue_versions WHERE active = 1') === expectedChecksum, 'Catalogue checksum does not match the deterministic source.')

  const invalidRelatedCount = scalar(database, `
    SELECT COUNT(*)
    FROM product_relations AS relations
    LEFT JOIN products AS sources ON sources.id = relations.product_id
    LEFT JOIN products AS targets ON targets.id = relations.related_product_id
    WHERE sources.id IS NULL OR targets.id IS NULL OR sources.id = targets.id
  `)
  assert(invalidRelatedCount === 0, 'Related-product references are invalid.')

  const invalidMoneyCount = scalar(database, `
    SELECT SUM(invalid_count) FROM (
      SELECT COUNT(*) AS invalid_count FROM products WHERE price_vnd IS NOT NULL AND (typeof(price_vnd) <> 'integer' OR price_vnd < 0)
      UNION ALL SELECT COUNT(*) FROM product_variants WHERE price_vnd IS NOT NULL AND (typeof(price_vnd) <> 'integer' OR price_vnd < 0)
      UNION ALL SELECT COUNT(*) FROM product_variants WHERE typeof(price_delta_vnd) <> 'integer' OR price_delta_vnd < 0
      UNION ALL SELECT COUNT(*) FROM bouquet_options WHERE base_price_vnd IS NOT NULL AND (typeof(base_price_vnd) <> 'integer' OR base_price_vnd < 0)
      UNION ALL SELECT COUNT(*) FROM bouquet_options WHERE typeof(price_delta_vnd) <> 'integer' OR price_delta_vnd < 0
      UNION ALL SELECT COUNT(*) FROM gift_add_ons WHERE typeof(price_vnd) <> 'integer' OR price_vnd < 0
    )
  `)
  assert(invalidMoneyCount === 0, 'A seeded money value is not a non-negative integer.')

  const mediaReferences = database.prepare(`
    SELECT products.id, media.value ->> '$.src' AS src, media.value ->> '$.poster' AS poster
    FROM products, json_each(products.media_json) AS media
  `).all()
  assert(mediaReferences.length >= 24, 'Every product must have local media references.')
  mediaReferences.forEach(({ id, poster, src }) => {
    assert(typeof src === 'string' && src.startsWith('src/assets/'), `${id} has a non-local media source.`)
    assert(poster == null || poster.startsWith('src/assets/'), `${id} has a non-local poster source.`)
  })

  const blushMedia = database.prepare(`
    SELECT media.value ->> '$.src' AS src
    FROM products, json_each(products.media_json) AS media
    WHERE products.id = 'blush-atelier'
  `).all()
  assert(blushMedia.length === 1, 'Hồng Sương must keep one gallery image.')
  assert(blushMedia[0].src.endsWith('/49ce5412-ca99-45e1-8347-b8b6e8957cf1.jfif'), 'Hồng Sương surviving image reference is incorrect.')

  const foreignKeyViolations = database.prepare('PRAGMA foreign_key_check').all()
  assert(foreignKeyViolations.length === 0, `Foreign-key check failed: ${JSON.stringify(foreignKeyViolations)}`)
}

function verifyQueryPlans(database) {
  return QUERY_PLANS.map(({ index, label, parameters, sql }) => {
    const details = database.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...parameters)
      .map(({ detail }) => detail)
    assert(details.some((detail) => detail.includes(index)), `${label} does not use ${index}: ${details.join(' | ')}`)
    return { index, label }
  })
}

async function verifyRepository(database) {
  const repository = createCatalogueRepository(new LocalD1Database(database))
  const version = await repository.getCatalogueVersion()
  const byId = await repository.getProductById('nang-diu')
  const bySlug = await repository.getProductBySlug('nang-diu')
  const priceless = await repository.getProductBySlug('no-watering-flower')
  const purchaseState = await repository.getProductPurchaseState('no-watering-flower')
  const firstPage = await repository.listProducts({ limit: 5 })
  const secondPage = await repository.listProducts({ limit: 5, offset: 5 })
  const boundedPage = await repository.listProducts({ limit: 999 })
  const budgetPage = await repository.listProducts({ maxPriceVnd: 2000000, limit: 50 })
  const sortedPage = await repository.listProducts({ activeOnly: false, limit: 50, sort: 'price_asc' })
  const variants = await repository.getProductVariants('nang-diu')
  const bouquetSizes = await repository.getBouquetOptions('size')
  const addOns = await repository.getGiftAddOns()

  assert(version?.product_count === 24 && version?.purchasable_count === 23, 'Repository catalogue version is incorrect.')
  assert(byId?.id === 'nang-diu' && bySlug?.id === byId.id, 'Repository ID/slug lookup mismatch.')
  assert(priceless?.priceVnd === null && !priceless.isPurchasable, 'Repository priceless state is incorrect.')
  assert(purchaseState.exists && !purchaseState.isPurchasable && purchaseState.purchaseType === 'priceless', 'Purchase-state check is incorrect.')
  assert(firstPage.items.length === 5 && secondPage.items.length === 5, 'Repository pagination is not bounded and repeatable.')
  assert(firstPage.items[0].id !== secondPage.items[0].id, 'Repository offset pagination did not advance.')
  assert(boundedPage.limit === catalogueRepositoryLimits.maxPageSize, 'Repository maximum page size was not enforced.')
  assert(budgetPage.items.every(({ priceVnd }) => Number.isInteger(priceVnd)), 'Budget filtering included a priceless product.')
  assert(sortedPage.items.at(-1)?.id === 'no-watering-flower', 'Price sorting must put the priceless product last.')
  assert(variants.length === 5, 'Standard product variants are incomplete.')
  assert(bouquetSizes.length === 3, 'Bouquet size options are incomplete.')
  assert(addOns.length === 4, 'Gift add-on repository result is incomplete.')

  await repository.listProducts({ sort: 'not-a-real-sort' })
    .then(() => assert(false, 'Repository accepted a non-allowlisted sort.'))
    .catch((error) => assert(error instanceof TypeError, 'Invalid sort failed with an unexpected error.'))
}

async function verifyUserRepository(database) {
  const repository = createUserRepository(new LocalD1Database(database), {
    generateId: () => 'usr_phase17_validation',
    now: () => '2026-09-22T00:00:00.000Z',
  })
  const identity = { provider: 'clerk', subject: 'user_phase17_validation' }
  const first = await repository.getOrCreateByIdentity(identity)
  const second = await repository.getOrCreateByIdentity(identity)

  assert(first.id === 'usr_phase17_validation', 'Managed identity created an unexpected local user ID.')
  assert(second.id === first.id, 'Stable provider subject did not resolve to the same local user.')
  assert(first.role === 'customer' && first.status === 'active', 'Managed identity received unsafe defaults.')
  assert(
    scalar(database, "SELECT COUNT(*) FROM users WHERE auth_provider = 'clerk' AND provider_subject = 'user_phase17_validation'") === 1,
    'Repeated managed identity mapping created duplicate users.',
  )
}

async function main() {
  const tempDirectory = await mkdtemp(join(tmpdir(), 'hanapipi-phase16-'))
  const primaryPath = join(tempDirectory, 'primary.sqlite')
  const backupPath = join(tempDirectory, 'backup.sqlite')
  const restoredPath = join(tempDirectory, 'restored.sqlite')
  const databases = []

  try {
    const primary = new DatabaseSync(primaryPath)
    databases.push(primary)
    primary.exec('PRAGMA foreign_keys = ON')
    const migrations = await applyMigrations(primary)
    await applyMigrations(primary)
    assert(scalar(primary, 'SELECT COUNT(*) FROM schema_versions') === migrations.length, 'Migration replay duplicated the schema ledger.')

    await verifyCatalogueMigration()
    const expectedSeed = await createCatalogueSeed()
    const repeatedSeed = await createCatalogueSeed()
    assert(expectedSeed.checksum === repeatedSeed.checksum, 'Catalogue checksum is not deterministic.')

    assertSchema(primary)
    assertInvariants(primary, expectedSeed.checksum)
    await verifyRepository(primary)
    const queryPlans = verifyQueryPlans(primary)
    const sourceSnapshot = readSnapshot(primary)

    await backup(primary, backupPath)
    const backupDatabase = new DatabaseSync(backupPath, { readOnly: true })
    databases.push(backupDatabase)
    await backup(backupDatabase, restoredPath)
    const restored = new DatabaseSync(restoredPath)
    databases.push(restored)
    restored.exec('PRAGMA foreign_keys = ON')
    assertSchema(restored)
    assertInvariants(restored, expectedSeed.checksum)
    const restoredSnapshot = readSnapshot(restored)
    assert(JSON.stringify(restoredSnapshot) === JSON.stringify(sourceSnapshot), 'Backup/restore snapshot differs from the source database.')
    await verifyUserRepository(primary)

    console.log(JSON.stringify({
      backupRestore: 'identical',
      catalogueChecksum: expectedSeed.checksum,
      giftAddOns: sourceSnapshot.giftAddOns,
      migrations,
      pricelessProducts: 1,
      products: sourceSnapshot.products,
      productRelations: sourceSnapshot.productRelations,
      productVariants: sourceSnapshot.productVariants,
      purchasableProducts: sourceSnapshot.purchasableProducts,
      bouquetOptions: sourceSnapshot.bouquetOptions,
      queryPlans,
      schemaTables: EXPECTED_TABLES.size,
      status: 'passed',
      userMapping: 'verified',
    }, null, 2))
  } finally {
    databases.reverse().forEach((database) => {
      try {
        database.close()
      } catch {
        // A failed setup may leave a database unopened; cleanup still continues.
      }
    })
    await rm(tempDirectory, { force: true, recursive: true })
  }
}

await main()
