import { getSupportLink } from '../data/supportKnowledge.js'
import { createLocalConciergeResponse } from '../utils/conciergeFallback.js'
import { redactConciergeText } from '../utils/conciergePrivacy.js'
import { validateConciergeResponse } from '../utils/conciergeSchema.js'

const DEFAULT_TIMEOUT_MS = 14000
const FALLBACK_NOTICE =
  'Kết nối tư vấn đang bận một chút, mình vẫn có thể hỗ trợ bạn bằng thông tin của Hut Flower.'
const RATE_LIMIT_NOTICE =
  'Hut Flower đang nhận nhiều lời nhắn. Bạn vui lòng đợi một phút rồi thử lại nhé.'

function compactHistory(history) {
  return history
    .filter(({ content, role }) => ['assistant', 'user'].includes(role) && content)
    .slice(-8)
    .map(({ content, role }) => ({
      content: redactConciergeText(content).slice(0, 700),
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

export function createConciergeRequest({ history, message, pageContext }) {
  return {
    history: compactHistory(history),
    locale: 'vi-VN',
    message: redactConciergeText(message).slice(0, 500),
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

  const requestBody = createConciergeRequest({ history, message, pageContext })
  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(apiUrl, {
      body: JSON.stringify(requestBody),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal: controller.signal,
    })
    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null)
      const errorCode = errorPayload?.code ?? errorPayload?.error?.code
      if (response.status === 429 && errorCode === 'RATE_LIMITED') {
        return {
          ...localResponse,
          notice: RATE_LIMIT_NOTICE,
          usedFallback: true,
        }
      }
      throw new Error('Concierge request was not successful')
    }

    const validated = validateConciergeResponse(await response.json(), catalogue)
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
