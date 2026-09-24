import { giftAddOns } from './giftAddOns.js'
import { bouquetSteps } from './bouquetOptions.js'
import { DELIVERY_CUTOFF_HOUR } from '../utils/delivery.js'

export const OFFICIAL_INSTAGRAM_URL = 'https://www.instagram.com/tiem_hoa_hanapipi/'

export const UNKNOWN_SUPPORT_MESSAGE =
  'Mình chưa có đủ thông tin để xác nhận điều này. Bạn có thể liên hệ trực tiếp Hanapipi Flower để được hỗ trợ chính xác hơn.'

export const supportLinks = [
  { id: 'home', label: 'Trang chủ', to: '/' },
  { id: 'shop', label: 'Cửa hàng', to: '/shop' },
  { id: 'occasions', label: 'Dịp tặng hoa', to: '/#occasions' },
  { id: 'seasonal', label: 'Bộ sưu tập theo mùa', to: '/#seasonal' },
  { id: 'build_bouquet', label: 'Tự tạo bó hoa', to: '/build-your-bouquet' },
  { id: 'flower_finder', label: 'Chọn hoa từng bước', to: '/flower-finder' },
  { id: 'search', label: 'Tìm kiếm', to: '/search' },
  { id: 'wishlist', label: 'Hoa đã lưu', to: '/wishlist' },
  { id: 'cart', label: 'Giỏ hàng', to: '/cart' },
  { id: 'checkout', label: 'Thanh toán', to: '/checkout' },
  { id: 'account', label: 'Tài khoản và đơn đã đặt', to: '/account' },
  { id: 'delivery_information', label: 'Thông tin giao hoa', to: '/delivery-information' },
  { id: 'flower_care', label: 'Hướng dẫn chăm hoa', to: '/flower-care' },
  { id: 'priceless_product', label: 'Bông Hoa Không Cần Tưới', to: '/product/no-watering-flower' },
  { id: 'priceless_story', label: 'Bông hoa đã có chủ', to: '/flower-already-taken' },
  {
    external: true,
    id: 'instagram',
    label: 'Liên hệ Hanapipi Flower qua Instagram',
    to: OFFICIAL_INSTAGRAM_URL,
  },
]

export const supportLinkIds = supportLinks.map(({ id }) => id)

export const deliveryKnowledge = {
  cutoffHour: DELIVERY_CUTOFF_HOUR,
  sections: [
    {
      title: 'Giao hoa trong ngày',
      text: `Với đơn đặt trước ${DELIVERY_CUTOFF_HOUR}:00, bạn có thể chọn mong muốn giao trong ngày. Khả năng phục vụ sẽ được xác nhận theo địa chỉ và tình trạng hoa tại thời điểm đặt hàng.`,
    },
    {
      title: 'Ngày và khung giờ',
      text: 'Ngày cùng khung giờ tại Giỏ hàng và Thanh toán là lựa chọn dự kiến. Hanapipi Flower sẽ xác nhận lại thời gian phù hợp dựa trên địa chỉ người nhận.',
    },
    {
      title: 'Phạm vi và chi phí',
      text: 'Hanapipi hiện nhận địa chỉ tại TP. Hồ Chí Minh. Website chưa tính phí giao động theo khu vực; thông tin giao nhận sẽ được xác nhận trước khi đơn hoa được xử lý thực tế.',
    },
  ],
}

export const flowerCareKnowledge = {
  sections: [
    {
      title: 'Khi vừa nhận hoa',
      text: 'Dùng kéo sạch cắt vát gốc khoảng 1–2 cm, bỏ những lá nằm dưới mặt nước và đặt hoa vào bình đã được rửa sạch.',
    },
    {
      title: 'Chăm hoa mỗi ngày',
      text: 'Thay nước sạch hằng ngày, rửa lại bình và cắt thêm một đoạn ngắn ở gốc nếu cành hoa bắt đầu mềm.',
    },
    {
      title: 'Chọn vị trí phù hợp',
      text: 'Giữ hoa ở nơi thoáng mát, tránh nắng trực tiếp, luồng gió mạnh và đặt xa trái cây đang chín.',
    },
  ],
}

export const giftingKnowledge = {
  addOns: giftAddOns.map(({ id, name, note, price }) => ({ id, name, note, price })),
  messageGuidance:
    'Người dùng có thể chọn quà gửi kèm ở Product Detail và điền lời nhắn ở Checkout. Thiệp viết tay không thêm phí. Trợ lý chỉ hướng dẫn, không sửa giỏ hàng hoặc điền lời nhắn thay người dùng.',
}

export const supportKnowledgeForModel = {
  brand: 'Hanapipi Flower',
  buildYourBouquet: {
    guidance:
      'Công cụ Tự tạo bó hoa gồm sáu bước. Người dùng tự chọn từng phương án, xem lại cấu hình rồi chủ động thêm vào giỏ hàng.',
    steps: bouquetSteps,
  },
  commerce: {
    account:
      'Trang Tài khoản hiển thị các đơn demo đã ghi nhận trên chính trình duyệt của người dùng. Không khẳng định trạng thái đơn thực tế.',
    cart:
      'Người dùng tự xem, cập nhật số lượng hoặc xóa sản phẩm trong Giỏ hàng. Trợ lý không thay đổi giỏ hàng.',
    checkout:
      'Người dùng tự điền thông tin giao nhận và xác nhận đơn tại Thanh toán. Không yêu cầu họ gửi thông tin cá nhân vào chat.',
    wishlist:
      'Người dùng có thể lưu hoặc bỏ lưu sản phẩm và xem lại tại Hoa đã lưu.',
  },
  delivery: deliveryKnowledge,
  flowerCare: flowerCareKnowledge,
  gifting: giftingKnowledge,
  pricelessProduct: {
    id: 'no-watering-flower',
    guidance:
      'Bông hoa này thuộc bộ sưu tập vô giá và đã có chủ rồi. Bạn chỉ được phép ngắm thôi nha.',
    purchasable: false,
  },
  routes: supportLinks.map(({ id, label }) => ({ id, label })),
  unknownAnswer: UNKNOWN_SUPPORT_MESSAGE,
}

export function getSupportLink(linkId) {
  return supportLinks.find(({ id }) => id === linkId) ?? null
}

export function compactProductKnowledge(product) {
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
