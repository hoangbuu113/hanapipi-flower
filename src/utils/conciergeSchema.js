import { supportLinkIds } from '../data/supportKnowledge.js'
import { isPurchasableProduct } from './productCommerce.js'

const RESPONSE_TYPES = ['answer', 'clarification', 'recommendations', 'navigation', 'handoff']

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function cleanUniqueStrings(value, { allowedValues, maxItems, maxLength }) {
  if (!Array.isArray(value) || value.length > maxItems) return null
  const values = value.map((item) => cleanText(item, maxLength))
  if (values.some((item) => !item)) return null
  const uniqueValues = [...new Set(values)]
  if (allowedValues && uniqueValues.some((item) => !allowedValues.has(item))) return null
  return uniqueValues
}

function containsUrl(value) {
  return /(?:https?:\/\/|www\.)/iu.test(value)
}

export function validateConciergeResponse(value, catalogue, candidateIds) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  if (!RESPONSE_TYPES.includes(value.type)) return null

  const message = cleanText(value.message, 700)
  const note = value.note === null ? null : cleanText(value.note, 240)
  const quickReplies = cleanUniqueStrings(value.quickReplies, { maxItems: 4, maxLength: 80 })
  const allowedCandidateIds = new Set(candidateIds)
  const productIds = cleanUniqueStrings(value.productIds, {
    allowedValues: allowedCandidateIds,
    maxItems: 3,
    maxLength: 80,
  })
  const linkIds = cleanUniqueStrings(value.linkIds, {
    allowedValues: new Set(supportLinkIds),
    maxItems: 3,
    maxLength: 80,
  })

  if (!message || note === '' || !quickReplies || !productIds || !linkIds) return null
  if ([message, note, ...quickReplies].filter(Boolean).some(containsUrl)) return null
  if (value.type === 'recommendations' && productIds.length === 0) return null
  if (value.type === 'navigation' && linkIds.length === 0) return null

  const productMap = new Map(
    catalogue.filter(isPurchasableProduct).map((product) => [product.id, product]),
  )
  const products = productIds.map((id) => productMap.get(id)).filter(Boolean)
  if (products.length !== productIds.length) return null

  return {
    linkIds,
    message,
    note,
    productIds,
    products,
    quickReplies,
    source: 'ai',
    type: value.type,
  }
}
