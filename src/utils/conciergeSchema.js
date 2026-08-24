const MAX_TEXT_LENGTH = 280

function cleanText(value, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function validateClarifyingQuestion(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const question = cleanText(value.question, 180)
  const options = Array.isArray(value.options)
    ? value.options.map((option) => cleanText(option, 70)).filter(Boolean).slice(0, 4)
    : []
  if (!question || options.length < 2) return null
  return { options, question }
}

export function validateConciergeResponse(value, catalogue) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  if (!['recommendations', 'clarification'].includes(value.status)) return null

  const validProducts = new Map(catalogue.map((product) => [product.id, product]))
  const seenProductIds = new Set()
  const recommendations = Array.isArray(value.recommendations)
    ? value.recommendations.flatMap((recommendation) => {
      if (!recommendation || typeof recommendation !== 'object') return []
      const product = validProducts.get(recommendation.productId)
      if (!product || seenProductIds.has(product.id)) return []
      const reason = cleanText(recommendation.reason, 220)
      if (!reason) return []
      seenProductIds.add(product.id)
      return [{
        fitTags: Array.isArray(recommendation.fitTags)
          ? recommendation.fitTags.map((tag) => cleanText(tag, 60)).filter(Boolean).slice(0, 3)
          : [],
        product,
        productId: product.id,
        reason,
      }]
    }).slice(0, 3)
    : []

  const clarifyingQuestion = validateClarifyingQuestion(value.clarifyingQuestion)
  if (value.status === 'clarification' && !clarifyingQuestion) return null
  if (value.status === 'recommendations' && recommendations.length === 0) return null

  return {
    clarifyingQuestion: value.status === 'clarification' ? clarifyingQuestion : null,
    intro: cleanText(value.intro),
    note: cleanText(value.note),
    recommendations: value.status === 'recommendations' ? recommendations : [],
    status: value.status,
  }
}
