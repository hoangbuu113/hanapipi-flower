import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { normalizeAdminProduct } from '../src/services/adminClient.js'
import { normalizeCatalogueProduct } from '../src/services/catalogueClient.js'
import {
  getPrimaryMediaSrc,
  resolveCatalogueMedia,
  resolveMediaSrc,
} from '../src/utils/media.js'

test('resolveMediaSrc — seeded D1 path → R2 URL', () => {
  assert.equal(
    resolveMediaSrc('src/assets/hanapipi-photos/9d055925-4c58-4c97-8bb4-88714cc1468a.jfif'),
    '/api/v1/media/9d055925-4c58-4c97-8bb4-88714cc1468a.jfif',
  )
})

test('resolveMediaSrc — admin-uploaded /api/v1/media/ URL passes through', () => {
  assert.equal(
    resolveMediaSrc('/api/v1/media/prod_media_abc123.jpg'),
    '/api/v1/media/prod_media_abc123.jpg',
  )
})

test('resolveMediaSrc — Vite /assets/ URL passes through', () => {
  assert.equal(
    resolveMediaSrc('/assets/img-abc123.jfif'),
    '/assets/img-abc123.jfif',
  )
})

test('resolveMediaSrc — absolute https URL passes through', () => {
  assert.equal(
    resolveMediaSrc('https://example.com/photo.jpg'),
    'https://example.com/photo.jpg',
  )
})

test('resolveMediaSrc — absolute http URL passes through', () => {
  assert.equal(
    resolveMediaSrc('http://example.com/photo.jpg'),
    'http://example.com/photo.jpg',
  )
})

test('resolveMediaSrc — data: URI passes through', () => {
  assert.equal(
    resolveMediaSrc('data:image/png;base64,abc'),
    'data:image/png;base64,abc',
  )
})

test('resolveMediaSrc — null → empty string', () => {
  assert.equal(resolveMediaSrc(null), '')
})

test('resolveMediaSrc — undefined → empty string', () => {
  assert.equal(resolveMediaSrc(undefined), '')
})

test('resolveMediaSrc — empty string → empty string', () => {
  assert.equal(resolveMediaSrc(''), '')
})

test('resolveMediaSrc — bare filename → R2 URL', () => {
  assert.equal(
    resolveMediaSrc('photo.jpg'),
    '/api/v1/media/photo.jpg',
  )
})

test('resolveMediaSrc — seeded video path → R2 URL', () => {
  assert.equal(
    resolveMediaSrc('src/assets/hanapipi-photos/bouquet-video.mp4'),
    '/api/v1/media/bouquet-video.mp4',
  )
})

test('resolveMediaSrc — non-string (number) → empty string', () => {
  assert.equal(resolveMediaSrc(42), '')
})

test('Admin and storefront share the same legacy seeded media URL', () => {
  const rawProduct = {
    id: 'legacy-product',
    media: [{ src: 'src/assets/hanapipi-photos/legacy-photo.jfif', type: 'image' }],
    name: 'Legacy Product',
    priceVnd: 590000,
    purchaseType: 'standard',
    slug: 'legacy-product',
  }

  const adminProduct = normalizeAdminProduct(rawProduct)
  const storefrontProduct = normalizeCatalogueProduct(rawProduct, [], [])

  assert.equal(getPrimaryMediaSrc(adminProduct), '/api/v1/media/legacy-photo.jfif')
  assert.equal(getPrimaryMediaSrc(storefrontProduct), '/api/v1/media/legacy-photo.jfif')
})

test('Admin and storefront share canonical uploaded R2 media unchanged', () => {
  const rawProduct = {
    id: 'uploaded-product',
    media: [{ src: '/api/v1/media/prod_media_uploaded.jpg', type: 'image' }],
    name: 'Uploaded Product',
    priceVnd: 690000,
    purchaseType: 'standard',
    slug: 'uploaded-product',
  }

  const adminProduct = normalizeAdminProduct(rawProduct)
  const storefrontProduct = normalizeCatalogueProduct(rawProduct, [], [])

  assert.equal(getPrimaryMediaSrc(adminProduct), '/api/v1/media/prod_media_uploaded.jpg')
  assert.equal(getPrimaryMediaSrc(storefrontProduct), '/api/v1/media/prod_media_uploaded.jpg')
})

test('Missing or invalid first media receives a safe empty fallback', () => {
  assert.deepEqual(resolveCatalogueMedia([{ src: null }, null]), [])

  const rawProduct = {
    id: 'missing-media',
    media: [{ src: null }],
    name: 'Missing Media',
    priceVnd: 590000,
    purchaseType: 'standard',
    slug: 'missing-media',
  }
  const adminProduct = normalizeAdminProduct(rawProduct)
  const storefrontProduct = normalizeCatalogueProduct(rawProduct, [], [])

  assert.equal(getPrimaryMediaSrc(adminProduct), '')
  assert.equal(getPrimaryMediaSrc(storefrontProduct), '')
})

test('All 24 seeded products resolve the same first media in Admin and storefront', () => {
  const database = new DatabaseSync(':memory:')
  database.exec(fs.readFileSync(path.resolve('drizzle/0001_phase16_foundation.sql'), 'utf8'))
  database.exec(fs.readFileSync(path.resolve('drizzle/0002_phase16_catalogue_seed.sql'), 'utf8'))

  const rows = database.prepare(`
    SELECT id, slug, name, price_vnd, purchase_type, media_json
    FROM products
    ORDER BY sort_order, id
  `).all()

  assert.equal(rows.length, 24)
  for (const row of rows) {
    const rawProduct = {
      id: row.id,
      media: JSON.parse(row.media_json),
      name: row.name,
      priceVnd: row.price_vnd,
      purchaseType: row.purchase_type,
      slug: row.slug,
    }
    const adminSrc = getPrimaryMediaSrc(normalizeAdminProduct(rawProduct))
    const storefrontSrc = getPrimaryMediaSrc(normalizeCatalogueProduct(rawProduct, [], []))

    assert.ok(adminSrc, `${row.slug} must have resolvable Admin media`)
    assert.equal(storefrontSrc, adminSrc, `${row.slug} must resolve identically in both surfaces`)
  }
})
