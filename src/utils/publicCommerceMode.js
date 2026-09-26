// Unknown/missing values never enable public commerce.
export function resolvePublicCommerceMode(value) {
  return value === 'checkout' ? 'checkout' : 'consultation'
}
