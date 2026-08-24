import { normalizeSearch } from './normalizeSearch.js'
import { isPurchasableProduct } from './productCommerce.js'

const OCCASION_RULES = [
  { value: 'Sinh nhật', terms: ['sinh nhat', 'birthday'] },
  { value: 'Kỷ niệm', terms: ['ky niem', 'anniversary'] },
  { value: 'Lời cảm ơn', terms: ['cam on', 'tri an', 'biet on'] },
  { value: 'Khởi đầu mới', terms: ['khoi dau moi', 'cong viec moi', 'tan gia', 'khai truong', 'tot nghiep'] },
  { value: 'Chúc mừng', terms: ['chuc mung', 'thang chuc', 'khai truong', 'tot nghiep'] },
  { value: 'Chia sẻ', terms: ['chia se', 'chia buon', 'an ui'] },
  { value: 'Tặng không cần dịp', terms: ['khong can dip', 'khong nhan dip', 'bat ngo', 'tang vui'] },
  { value: 'Yêu thương', terms: ['yeu thuong', 'to tinh', 'ban gai', 'ban trai', 'nguoi yeu', 'vo', 'chong'] },
]

const MOOD_RULES = [
  { value: 'Dịu dàng', terms: ['diu dang', 'mem mai', 'tinh te'] },
  { value: 'Nhẹ nhàng', terms: ['nhe nhang'] },
  { value: 'Lãng mạn', terms: ['lang man', 'ngot ngao'] },
  { value: 'Ấm áp', terms: ['am ap', 'than tinh'] },
  { value: 'Rạng rỡ', terms: ['rang ro', 'ruc ro', 'tuoi sang'] },
  { value: 'Vui tươi', terms: ['vui tuoi', 'vui ve'] },
  { value: 'Năng lượng', terms: ['nang luong', 'tich cuc'] },
  { value: 'Trong trẻo', terms: ['trong treo', 'thanh thoat'] },
  { value: 'An lành', terms: ['an lanh', 'binh an'] },
  { value: 'Tươi mới', terms: ['tuoi moi'] },
  { value: 'Tự nhiên', terms: ['tu nhien', 'moc mac'] },
  { value: 'Sâu lắng', terms: ['sau lang', 'tram lang', 'y nghia'] },
  { value: 'Thanh mát', terms: ['thanh mat', 'mat diu'] },
  { value: 'Bình yên', terms: ['binh yen', 'an ui'] },
  { value: 'Thanh lịch', terms: ['thanh lich', 'sang trong'] },
  { value: 'Đáng yêu', terms: ['dang yeu', 'de thuong'] },
  { value: 'Tinh nghịch', terms: ['tinh nghich', 'nhay', 'vui nhon'] },
]

const COLOR_RULES = [
  { value: 'Trắng ngà', terms: ['trang nga', 'ivory', 'mau kem', 'kem sua'] },
  { value: 'Trắng', terms: ['mau trang', 'hoa trang', 'trang tinh'] },
  { value: 'Hồng phấn', terms: ['hong phan', 'hong pastel', 'mau hong', 'tong hong', 'trang hong'] },
  { value: 'Vàng ấm', terms: ['vang am', 'mau vang', 'hoa vang', 'huong duong'] },
  { value: 'Đỏ', terms: ['do tham', 'do sau', 'mau do', 'hoa do'] },
  { value: 'Xanh lam', terms: ['xanh lam', 'xanh duong', 'xanh pastel'] },
  { value: 'Xanh lá', terms: ['xanh la', 'la xanh'] },
  { value: 'Xám', terms: ['mau xam', 'mau ghi'] },
]

const STEP_MOOD_MATCHES = {
  'Dịu dàng': ['Dịu dàng', 'Nhẹ nhàng', 'Trong trẻo'],
  'Tươi sáng': ['Rạng rỡ', 'Vui tươi', 'Năng lượng', 'Tươi mới'],
  'Thanh lịch': ['Thanh lịch', 'Trong trẻo', 'Thanh mát', 'Bình yên', 'Sâu lắng'],
  'Ấm áp': ['Ấm áp', 'Lãng mạn', 'Sâu lắng'],
}

const STEP_COLOR_MATCHES = {
  'Kem và trắng': ['Trắng', 'Trắng ngà'],
  'Hồng dịu': ['Hồng phấn'],
  'Vàng ấm': ['Vàng ấm'],
  'Đỏ sâu': ['Đỏ'],
  'Xanh dịu': ['Xanh lam', 'Trắng'],
}

function includesTerm(text, term) {
  return (` ${text} `).includes(` ${term} `)
}

function findMatches(text, rules) {
  return rules
    .filter((rule) => rule.terms.some((term) => includesTerm(text, term)))
    .map((rule) => rule.value)
}

function collectBudgetAmounts(text) {
  const matches = []
  const occupiedRanges = []
  const patterns = [
    { regex: /\b(\d+(?:[.,]\d+)?)\s*(?:triệu|trieu|tr)\b/g, multiplier: 1000000 },
    { regex: /\b(\d+(?:[.,]\d+)?)\s*(?:nghìn|nghin|ngàn|ngan|k)\b/g, multiplier: 1000 },
    { regex: /\b\d{1,3}(?:[.,]\d{3})+\b/g, multiplier: 1 },
    { regex: /\b\d{6,7}\b/g, multiplier: 1 },
  ]

  patterns.forEach(({ regex, multiplier }) => {
    for (const match of text.matchAll(regex)) {
      const start = match.index ?? 0
      const end = start + match[0].length
      if (occupiedRanges.some((range) => start < range.end && end > range.start)) continue

      const numericPart = multiplier === 1
        ? match[0].replace(/[.,]/g, '')
        : match[1].replace(',', '.')
      const amount = Math.round(Number(numericPart) * multiplier)
      if (Number.isFinite(amount) && amount >= 100000) {
        matches.push({ amount, start })
        occupiedRanges.push({ end, start })
      }
    }
  })

  return matches.sort((first, second) => first.start - second.start).map(({ amount }) => amount)
}

export function parseBudget(message) {
  const normalized = normalizeSearch(message).replace(/[^\p{L}\p{N}.,]+/gu, ' ').trim()
  const amounts = collectBudgetAmounts(normalized)
  if (amounts.length === 0) return null

  if (amounts.length >= 2) {
    return {
      max: Math.max(amounts[0], amounts[1]),
      min: Math.min(amounts[0], amounts[1]),
      target: Math.max(amounts[0], amounts[1]),
    }
  }

  const target = amounts[0]
  const isMinimum = /\b(tu|tren|hon)\b/.test(normalized) && !/\b(duoi|toi da|khong qua)\b/.test(normalized)
  return {
    max: isMinimum ? null : target,
    min: isMinimum ? target : 0,
    target,
  }
}

export function parseConciergeMessage(message) {
  const normalized = normalizeSearch(message).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  return {
    budget: parseBudget(message),
    colors: findMatches(normalized, COLOR_RULES),
    moods: findMatches(normalized, MOOD_RULES),
    occasions: findMatches(normalized, OCCASION_RULES),
  }
}

function normalizedSet(values = []) {
  return new Set(values.map(normalizeSearch))
}

function getProductMatches(product, criteria) {
  const productOccasions = normalizedSet(product.occasions)
  const productMoods = normalizedSet(product.moods)
  const productColors = normalizedSet(product.colorPalette)
  return {
    colors: criteria.colors.filter((value) => productColors.has(normalizeSearch(value))),
    moods: criteria.moods.filter((value) => productMoods.has(normalizeSearch(value))),
    occasions: criteria.occasions.filter((value) => productOccasions.has(normalizeSearch(value))),
  }
}

function scoreBudget(price, budget) {
  if (!budget) return { fits: false, score: 0 }
  const aboveMinimum = budget.min == null || price >= budget.min
  const belowMaximum = budget.max == null || price <= budget.max
  if (aboveMinimum && belowMaximum) return { fits: true, score: 3 }
  if (budget.max != null && price > budget.max) {
    const distance = (price - budget.max) / Math.max(budget.max, 1)
    return { fits: false, score: -Math.min(6, 2 + Math.round(distance * 6)) }
  }
  return { fits: false, score: -2 }
}

export function rankProducts(catalogue, criteria, limit = 8) {
  return catalogue
    .filter(isPurchasableProduct)
    .map((product, index) => {
      const matches = getProductMatches(product, criteria)
      const budget = scoreBudget(product.price, criteria.budget)
      const occasionScore = matches.occasions.length > 0 ? 8 + ((matches.occasions.length - 1) * 2) : 0
      const moodScore = matches.moods.length > 0 ? 4 + (matches.moods.length - 1) : 0
      const score = occasionScore
        + moodScore
        + (matches.colors.length * 3)
        + budget.score
      return { budgetFits: budget.fits, index, matches, product, score }
    })
    .filter(({ score }) => score > 0)
    .sort((first, second) => second.score - first.score
      || Number(second.budgetFits) - Number(first.budgetFits)
      || first.product.price - second.product.price
      || first.index - second.index)
    .slice(0, limit)
}

export function buildRecommendationCopy(rankedProduct, criteria) {
  const { budgetFits, matches } = rankedProduct
  const tags = [
    ...matches.occasions,
    ...matches.moods,
    ...matches.colors,
    ...(budgetFits ? ['Trong ngân sách'] : []),
  ].slice(0, 3)
  const details = []
  if (matches.occasions[0]) details.push(`hợp dịp ${matches.occasions[0].toLowerCase()}`)
  if (matches.colors[0]) details.push(`đúng tông ${matches.colors[0].toLowerCase()}`)
  if (matches.moods[0]) details.push(`mang cảm giác ${matches.moods[0].toLowerCase()}`)
  if (budgetFits && criteria.budget) details.push('nằm trong ngân sách bạn nêu')

  return {
    fitTags: tags,
    reason: details.length > 0
      ? `${details[0][0].toUpperCase()}${details[0].slice(1)}${details.length > 1 ? `, ${details.slice(1).join(' và ')}` : ''}.`
      : 'Một lựa chọn gần với nhu cầu bạn vừa chia sẻ.',
  }
}

export function getGroundedCandidates(message, catalogue, limit = 8) {
  const criteria = parseConciergeMessage(message)
  const signalCount = criteria.colors.length
    + criteria.moods.length
    + criteria.occasions.length
    + Number(Boolean(criteria.budget))

  if (signalCount === 0) {
    return {
      candidates: [],
      clarification: {
        options: ['Sinh nhật', 'Kỷ niệm', 'Lời cảm ơn', 'Tặng không cần dịp'],
        question: 'Bạn muốn gửi món quà này vào dịp nào?',
      },
      criteria,
    }
  }

  return {
    candidates: rankProducts(catalogue, criteria, limit),
    clarification: null,
    criteria,
  }
}

export function criteriaFromStepAnswers(answers) {
  const budget = answers.budget === 'Dưới 600.000 ₫'
    ? { max: 599999, min: 0, target: 599999 }
    : answers.budget === '600.000 ₫ – 750.000 ₫'
      ? { max: 750000, min: 600000, target: 750000 }
      : answers.budget === 'Từ 750.000 ₫'
        ? { max: null, min: 750000, target: 750000 }
        : null

  return {
    budget,
    colors: STEP_COLOR_MATCHES[answers.color] ?? [],
    moods: STEP_MOOD_MATCHES[answers.mood] ?? [],
    occasions: answers.occasion ? [answers.occasion] : [],
  }
}
