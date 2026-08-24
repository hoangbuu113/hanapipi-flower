import { buildRecommendationCopy } from '../utils/conciergeGrounding.js'
import { validateConciergeResponse } from '../utils/conciergeSchema.js'
import { isPurchasableProduct } from '../utils/productCommerce.js'

const DEFAULT_TIMEOUT_MS = 14000

function compactCandidate({ product }) {
  return {
    colors: product.colorPalette,
    composition: product.flowerComposition,
    description: product.shortDescription,
    id: product.id,
    moods: product.moods,
    name: product.name,
    occasions: product.occasions,
    price: product.price,
  }
}

export function createConciergeRequest(message, rankedCandidates) {
  return {
    candidates: rankedCandidates.filter(({ product }) => isPurchasableProduct(product)).slice(0, 8).map(compactCandidate),
    locale: 'vi-VN',
    message,
  }
}

export function createDeterministicResponse(rankedCandidates, criteria, options = {}) {
  const purchasableCandidates = rankedCandidates.filter(({ product }) => isPurchasableProduct(product))

  return {
    clarifyingQuestion: null,
    intro: 'Ba lựa chọn gần nhất với điều bạn vừa chia sẻ.',
    note: '',
    recommendations: purchasableCandidates.slice(0, 3).map((candidate) => ({
      ...buildRecommendationCopy(candidate, criteria),
      product: candidate.product,
      productId: candidate.product.id,
    })),
    source: 'deterministic',
    status: 'recommendations',
    usedFallback: Boolean(options.usedFallback),
  }
}

function getConfiguredApiUrl() {
  const configuredUrl = import.meta.env?.VITE_CONCIERGE_API_URL?.trim()
  return configuredUrl?.startsWith('/') ? configuredUrl : '/api/concierge'
}

export async function getConciergeAdvice({
  apiUrl = getConfiguredApiUrl(),
  catalogue,
  criteria,
  fetchImpl = globalThis.fetch,
  message,
  rankedCandidates,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const fallback = createDeterministicResponse(rankedCandidates, criteria)
  if (!apiUrl) return fallback

  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(apiUrl, {
      body: JSON.stringify(createConciergeRequest(message, rankedCandidates)),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error('Concierge request was not successful')
    const validated = validateConciergeResponse(
      await response.json(),
      catalogue.filter(isPurchasableProduct),
    )
    if (!validated) throw new Error('Concierge response did not match the contract')
    return { ...validated, source: 'ai', usedFallback: false }
  } catch {
    return {
      ...fallback,
      notice: 'Chúng tôi đang dùng bộ lọc Hanapipi Flower để tiếp tục gợi ý cho bạn.',
      usedFallback: true,
    }
  } finally {
    globalThis.clearTimeout(timeoutId)
  }
}
