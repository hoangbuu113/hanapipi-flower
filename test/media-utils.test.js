import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveMediaSrc } from '../src/utils/media.js'

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
