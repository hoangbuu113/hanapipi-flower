import {
  deliveryKnowledge,
  flowerCareKnowledge,
  giftingKnowledge,
  UNKNOWN_SUPPORT_MESSAGE,
} from '../data/supportKnowledge.js'
import { formatCurrency } from './formatCurrency.js'
import { normalizeSearch } from './normalizeSearch.js'
import { buildRecommendationCopy } from './conciergeGrounding.js'

const SEASONAL_NOTE =
  'Hoa theo mùa có thể được thay thế bằng lựa chọn tương đương. Thời gian giao cần được xác nhận theo địa chỉ tại bước Thanh toán.'

function includesAny(message, terms) {
  return terms.some((term) => message.includes(term))
}

function createResponse(type, message, options = {}) {
  return {
    links: options.links ?? [],
    message,
    note: options.note ?? null,
    productIds: options.products?.map(({ id }) => id) ?? [],
    products: options.products ?? [],
    quickReplies: options.quickReplies ?? [],
    source: 'local',
    type,
  }
}

function createSelectionResponse(grounding) {
  if (grounding.clarification) {
    return createResponse('clarification', grounding.clarification.question, {
      quickReplies: grounding.clarification.options,
    })
  }

  if (grounding.candidates.length === 0) {
    return createResponse(
      'navigation',
      'Mình chưa tìm thấy lựa chọn thật sát với mô tả này. Bạn có thể chọn lại theo từng bước hoặc xem toàn bộ bộ sưu tập.',
      { links: ['flower_finder', 'shop'] },
    )
  }

  const recommendations = grounding.candidates.slice(0, 3)
  const details = recommendations
    .map((candidate) => {
      const copy = buildRecommendationCopy(candidate, grounding.criteria)
      return `${candidate.product.name}: ${copy.reason}`
    })
    .join(' ')

  return createResponse(
    'recommendations',
    `Mình chọn được ${recommendations.length} bó hoa gần nhất với điều bạn vừa chia sẻ. ${details}`,
    {
      note: SEASONAL_NOTE,
      products: recommendations.map(({ product }) => product),
      quickReplies: ['Xem thêm lựa chọn', 'Tự tạo bó hoa'],
    },
  )
}

export function createLocalConciergeResponse({ currentProduct, grounding, message }) {
  const normalized = normalizeSearch(message)

  if (includesAny(normalized, ['khong can tuoi', 'bong hoa co chu', 'bong hoa vo gia'])) {
    return createResponse(
      'navigation',
      'Bông hoa này thuộc bộ sưu tập vô giá và đã có chủ rồi. Bạn chỉ được phép ngắm thôi nha.',
      { links: ['priceless_product', 'priceless_story'] },
    )
  }

  if (includesAny(normalized, ['con hang', 'het hang', 'restock', 'cam ket', 'chac chan giao', 'trang thai that'])) {
    return createResponse('handoff', UNKNOWN_SUPPORT_MESSAGE, { links: ['instagram'] })
  }

  if (includesAny(normalized, ['trang thai don', 'don cua toi', 'don da dat', 'lich su don', 'xem don'])) {
    return createResponse(
      'navigation',
      'Bạn có thể xem những đơn đã ghi nhận trên trình duyệt này trong trang Tài khoản. Hanapipi Flower chưa thể xác nhận trạng thái đơn thực tế qua khung chat.',
      { links: ['account'] },
    )
  }

  if (includesAny(normalized, ['cham hoa', 'giu hoa', 'hoa tuoi lau', 'thay nuoc', 'cat goc', 'hoa heo'])) {
    const guidance = flowerCareKnowledge.sections.map(({ text }) => text).join(' ')
    return createResponse('answer', guidance, { links: ['flower_care'] })
  }

  if (includesAny(normalized, ['giao hoa', 'giao trong ngay', '14 00', 'khung gio', 'phi giao', 'phi ship', 'cut off'])) {
    return createResponse(
      'answer',
      `Với đơn đặt trước ${deliveryKnowledge.cutoffHour}:00, bạn có thể chọn mong muốn giao trong ngày. Ngày và khung giờ là lựa chọn dự kiến; khả năng phục vụ sẽ được xác nhận theo địa chỉ tại bước Thanh toán.`,
      { links: ['delivery_information', 'checkout'] },
    )
  }

  if (includesAny(normalized, ['qua tang', 'qua kem', 'thiep', 'loi nhan', 'nen thom', 'chocolate', 'binh gom'])) {
    const addOnCopy = giftingKnowledge.addOns
      .map(({ name, price }) => `${name}${price > 0 ? ` ${formatCurrency(price)}` : ' không thêm phí'}`)
      .join(', ')
    return createResponse(
      'answer',
      `Bạn có thể chọn quà gửi kèm tại trang sản phẩm: ${addOnCopy}. Lời nhắn được điền ở bước Thanh toán; mình sẽ không yêu cầu bạn gửi nội dung riêng tư vào chat.`,
      { links: ['shop', 'checkout'] },
    )
  }

  if (includesAny(normalized, ['tu tao bo hoa', 'tu phoi hoa', 'build your bouquet', 'phoi bo hoa'])) {
    return createResponse(
      'navigation',
      'Bạn có thể tự chọn phong cách, bảng màu, kích thước, hoa chủ đạo, kiểu gói và lời nhắn trong công cụ Tự tạo bó hoa.',
      { links: ['build_bouquet'] },
    )
  }

  if (includesAny(normalized, ['tai khoan', 'account', 'dang nhap', 'dang ky'])) {
    return createResponse(
      'navigation',
      'Trang Tài khoản giúp bạn đăng nhập, lưu thông tin trên thiết bị và xem các đơn demo đã ghi nhận.',
      { links: ['account'] },
    )
  }

  if (includesAny(normalized, ['gio hang', 'cart', 'cap nhat so luong', 'xoa san pham'])) {
    return createResponse(
      'navigation',
      'Bạn có thể tự cập nhật số lượng, xóa sản phẩm và chọn thời gian giao trong Giỏ hàng.',
      { links: ['cart'] },
    )
  }

  if (includesAny(normalized, ['thanh toan', 'checkout'])) {
    return createResponse(
      'navigation',
      'Sau khi kiểm tra Giỏ hàng, bạn tự điền thông tin giao nhận và xác nhận đơn tại trang Thanh toán.',
      { links: ['cart', 'checkout'] },
    )
  }

  if (includesAny(normalized, ['yeu thich', 'wishlist', 'hoa da luu', 'luu hoa'])) {
    return createResponse(
      'navigation',
      'Chạm biểu tượng trái tim để lưu một bó hoa, sau đó xem lại trong trang Hoa đã lưu.',
      { links: ['wishlist'] },
    )
  }

  if (includesAny(normalized, ['tim kiem', 'search', 'tim san pham'])) {
    return createResponse(
      'navigation',
      'Bạn có thể tìm theo tên, sắc độ hoặc cảm xúc trong trang Tìm kiếm.',
      { links: ['search'] },
    )
  }

  if (includesAny(normalized, ['lien he', 'nhan vien', 'nguoi that', 'ho tro truc tiep'])) {
    return createResponse('handoff', UNKNOWN_SUPPORT_MESSAGE, { links: ['instagram'] })
  }

  if (
    currentProduct
    && includesAny(normalized, ['bo hoa nay', 'hoa nay', 'san pham nay', 'thiet ke nay', 'mau nay'])
  ) {
    if (currentProduct.purchaseType === 'priceless') {
      return createResponse(
        'navigation',
        'Bông hoa này thuộc bộ sưu tập vô giá và đã có chủ rồi. Bạn chỉ được phép ngắm thôi nha.',
        { links: ['priceless_product', 'priceless_story'] },
      )
    }
    return createResponse(
      'answer',
      `${currentProduct.name} là ${currentProduct.shortDescription.toLowerCase()} Thiết kế phù hợp với ${currentProduct.occasions.slice(0, 3).join(', ').toLowerCase()}.`,
      { links: [`product:${currentProduct.id}`] },
    )
  }

  const selectionSignalCount = grounding.criteria.colors.length
    + grounding.criteria.moods.length
    + grounding.criteria.occasions.length
    + Number(Boolean(grounding.criteria.budget))
  if (
    selectionSignalCount > 0
    || includesAny(normalized, ['chon hoa', 'goi y hoa', 'bo hoa', 'tang hoa', 'tim hoa', 'theo dip'])
  ) {
    return createSelectionResponse(grounding)
  }

  return createResponse(
    'clarification',
    'Mình chỉ hỗ trợ chọn hoa và giải đáp về dịch vụ của Hanapipi Flower. Bạn muốn bắt đầu với điều nào?',
    {
      links: ['flower_finder'],
      quickReplies: ['Chọn hoa theo dịp', 'Cách chăm hoa', 'Giao hoa trong ngày', 'Quà tặng và lời nhắn'],
    },
  )
}
