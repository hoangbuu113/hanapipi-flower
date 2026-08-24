import { formatCurrency } from './formatCurrency'

export const PRICELESS_PURCHASE_TYPE = 'priceless'

export function isPurchasableProduct(product) {
  return Boolean(product)
    && product.purchaseType !== PRICELESS_PURCHASE_TYPE
    && Number.isFinite(product.price)
}

export function getProductPriceLabel(product) {
  return isPurchasableProduct(product) ? formatCurrency(product.price) : 'Vô giá'
}

export function matchesProductPriceFilter(product, priceRange) {
  if (priceRange === 'all') return true
  if (!isPurchasableProduct(product)) return false
  if (priceRange === 'under-600') return product.price < 600000
  if (priceRange === '600-700') return product.price >= 600000 && product.price <= 700000
  if (priceRange === 'over-700') return product.price > 700000
  return true
}

export function compareProductPrices(first, second, direction = 'ascending') {
  const firstIsPurchasable = isPurchasableProduct(first)
  const secondIsPurchasable = isPurchasableProduct(second)
  if (firstIsPurchasable !== secondIsPurchasable) return firstIsPurchasable ? -1 : 1
  if (!firstIsPurchasable) return 0
  return direction === 'descending' ? second.price - first.price : first.price - second.price
}
