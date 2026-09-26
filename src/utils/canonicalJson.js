// Deterministic JSON: object-key ordering and Vietnamese Unicode are stable.
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(typeof value === 'string' ? value.normalize('NFC') : value)
}

export function canonicalOrderItems(items) {
  return items.map((item) => ({ ...item, giftAddOnIds: [...item.giftAddOnIds].sort() }))
    .sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b), 'en'))
}
