import {
  compactProductKnowledge,
  getSupportLink,
} from '../data/supportKnowledge.js'
import { createLocalConciergeResponse } from '../utils/conciergeFallback.js'
import { validateConciergeResponse } from '../utils/conciergeSchema.js'
import { isPurchasableProduct } from '../utils/productCommerce.js'

const DEFAULT_TIMEOUT_MS = 14000
const FALLBACK_NOTICE =
  'Kết nối tư vấn đang bận một chút, mình vẫn có thể hỗ trợ bạn bằng thông tin của Hanapipi Flower.'

function redactPrivateText(value) {
  return value
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/giu, '[email đã ẩn]')
    .replace(/\bHF-\d{8}-\d{4}\b/giu, '[mã đơn đã ẩn]')
    .replace(/(?:\+?84|0)(?:[\s.-]?\d){8,10}\b/gu, '[số điện thoại đã ẩn]')
    .replace(/(?:địa chỉ|dia chi|address)\s*[:-]?\s*[^.!?\n]{3,120}/giu, '[địa chỉ đã ẩn]')
}

function compactHistory(history) {
  return history
    .filter(({ content, role }) => ['assistant', 'user'].includes(role) && content)
    .slice(-8)
    .map(({ content, role }) => ({
      content: redactPrivateText(content).slice(0, 700),
      role,
    }))
}

function resolveLinks(linkIds, catalogue) {
  const productMap = new Map(catalogue.map((product) => [product.id, product]))
  return linkIds.flatMap((linkId) => {
    if (linkId.startsWith('product:')) {
      const product = productMap.get(linkId.slice('product:'.length))
      return product
        ? [{ id: linkId, label: `Xem ${product.name}`, to: `/product/${product.slug}` }]
        : []
    }
    const link = getSupportLink(linkId)
    return link ? [link] : []
  })
}

export function createConciergeRequest({ candidates, history, message, pageContext }) {
  return {
    candidates: candidates
      .filter(({ product }) => isPurchasableProduct(product))
      .slice(0, 8)
      .map(({ product }) => compactProductKnowledge(product)),
    history: compactHistory(history),
    locale: 'vi-VN',
    message: redactPrivateText(message).slice(0, 500),
    pageContext: {
      productId: pageContext.productId ?? null,
      route: pageContext.route.slice(0, 160),
    },
  }
}

function getConfiguredApiUrl() {
  const configuredUrl = import.meta.env?.VITE_CONCIERGE_API_URL?.trim()
  return configuredUrl?.startsWith('/') ? configuredUrl : '/api/concierge'
}

export async function getConciergeReply({
  apiUrl = getConfiguredApiUrl(),
  candidates,
  catalogue,
  currentProduct,
  fetchImpl = globalThis.fetch,
  grounding,
  history,
  message,
  pageContext,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const fallback = createLocalConciergeResponse({ currentProduct, grounding, message })
  const localResponse = {
    ...fallback,
    links: resolveLinks(fallback.links, catalogue),
  }
  if (!apiUrl) return localResponse

  const requestBody = createConciergeRequest({ candidates, history, message, pageContext })
  const candidateIds = requestBody.candidates.map(({ id }) => id)
  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(apiUrl, {
      body: JSON.stringify(requestBody),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error('Concierge request was not successful')

    const validated = validateConciergeResponse(await response.json(), catalogue, candidateIds)
    if (!validated) throw new Error('Concierge response did not match the contract')

    return {
      ...validated,
      links: resolveLinks(validated.linkIds, catalogue),
    }
  } catch {
    return {
      ...localResponse,
      notice: FALLBACK_NOTICE,
      usedFallback: true,
    }
  } finally {
    globalThis.clearTimeout(timeoutId)
  }
}
