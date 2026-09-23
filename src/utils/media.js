/**
 * Normalise a media source to a renderable URL.
 *
 * Seeded D1 media paths like `src/assets/hanapipi-photos/<file>` are
 * converted to the R2-backed public endpoint `/api/v1/media/<file>`.
 *
 * Already-valid URLs (`/api/…`, `/assets/…`, `http(s)://…`, `data:…`) are
 * returned as-is.
 *
 * @param {string|null|undefined} src — raw media source from D1 / API
 * @returns {string} renderable URL or empty string
 */
export function resolveMediaSrc(src) {
  if (!src || typeof src !== 'string') return ''

  if (
    src.startsWith('/api/') ||
    src.startsWith('/assets/') ||
    src.startsWith('http://') ||
    src.startsWith('https://') ||
    src.startsWith('data:')
  ) {
    return src
  }

  // Extract filename from seeded path e.g. "src/assets/hanapipi-photos/uuid.jfif"
  const lastSlash = src.lastIndexOf('/')
  const filename = lastSlash >= 0 ? src.slice(lastSlash + 1) : src
  return filename ? `/api/v1/media/${filename}` : ''
}
