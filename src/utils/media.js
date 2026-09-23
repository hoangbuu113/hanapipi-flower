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

/**
 * Normalise catalogue media without replacing the authoritative D1 source
 * with a client-only product fallback. Both Admin and storefront consumers
 * use this shape so legacy seeded paths and managed R2 paths resolve equally.
 */
export function resolveCatalogueMedia(media, { productName = 'Hanapipi Flower' } = {}) {
  if (!Array.isArray(media)) return []

  return media
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      alt: item.alt ?? productName,
      caption: item.caption ?? null,
      fit: item.fit ?? 'cover',
      position: item.position ?? 'center',
      poster: resolveMediaSrc(item.poster),
      src: resolveMediaSrc(item.src),
      type: item.type ?? 'image',
    }))
    .filter((item) => item.src)
}

export function getPrimaryMediaSrc(product) {
  return resolveMediaSrc(product?.media?.[0]?.src ?? product?.images?.[0]?.src)
}
