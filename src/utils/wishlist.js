export function normalizeStoredWishlistIds(stored) {
  if (!Array.isArray(stored)) return []
  const ids = []
  for (const item of stored) {
    if (typeof item === 'string' && item.trim()) {
      const id = item.trim()
      if (!ids.includes(id)) ids.push(id)
    } else if (item && typeof item === 'object') {
      const id = typeof item.id === 'string' && item.id.trim()
        ? item.id.trim()
        : typeof item.slug === 'string' && item.slug.trim()
          ? item.slug.trim()
          : null
      if (id && !ids.includes(id)) {
        ids.push(id)
      }
    }
  }
  return ids
}
