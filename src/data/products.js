import birthdayImage from '../assets/occasion-birthday.jpg'
import craftImage from '../assets/florist-craft.jpg'
import heroImage from '../assets/hero-bouquet.jpg'
import seasonalImage from '../assets/seasonal-collection.jpg'
import giftingImage from '../assets/social-gifting.jpg'
import windowImage from '../assets/social-window.jpg'
import whiteImage from '../assets/occasion-white.jpg'

const standardSizes = (price) => [
  { id: 'small', label: 'Nhỏ', price: price - 100000 },
  { id: 'standard', label: 'Tiêu chuẩn', price },
  { id: 'large', label: 'Lớn', price: price + 180000 },
]

const wrappingOptions = [
  { id: 'ivory-paper', label: 'Giấy ivory mờ', note: 'Nhẹ nhàng, tối giản' },
  { id: 'blush-ribbon', label: 'Ruy băng hồng phấn', note: 'Dịu dàng, có điểm nhấn' },
]

export const products = [
  {
    id: 'nang-diu',
    slug: 'nang-diu',
    name: 'Nắng Dịu',
    price: 590000,
    images: [
      { src: birthdayImage, alt: 'Bó Nắng Dịu với hoa cam đào và kem' },
      { src: giftingImage, alt: 'Bó hoa tông cam đào được gói cùng thiệp nhỏ' },
    ],
    shortDescription: 'Cam đào, kem và nét xanh nhẹ.',
    description:
      'Một bó hoa ấm áp, có chút rạng rỡ vừa đủ để mở đầu ngày vui của người nhận.',
    collection: 'Khoảnh khắc dịu dàng',
    moods: ['Ấm áp', 'Rạng rỡ'],
    occasions: ['Sinh nhật', 'Lời cảm ơn', 'Tặng không cần dịp'],
    colorPalette: ['Cam đào', 'Kem'],
    flowerComposition: ['Hồng cam đào', 'Cẩm chướng kem', 'Scabiosa', 'Lá bạc hà'],
    sizeOptions: standardSizes(590000),
    wrappingOptions,
    status: 'Có sẵn',
    badges: ['Bán chạy'],
    isBestSeller: true,
    createdAt: '2026-08-18',
    relatedProductIds: ['du-am-hong', 'vuon-som-mai', 'sac-apricot'],
  },
  {
    id: 'du-am-hong',
    slug: 'du-am-hong',
    name: 'Dư Âm Hồng',
    price: 680000,
    images: [
      { src: heroImage, alt: 'Bó Dư Âm Hồng với hoa hồng phấn và hoa trắng' },
      { src: seasonalImage, alt: 'Bó hoa hồng phấn đặt cạnh bình gốm sáng màu' },
    ],
    shortDescription: 'Hồng phấn, trắng ngà, đầy dư âm.',
    description:
      'Những sắc hồng lặng lẽ đi cùng hoa trắng ngà, để lời yêu thương được nói ra thật tự nhiên.',
    collection: 'Lời muốn nói',
    moods: ['Lãng mạn', 'Dịu dàng'],
    occasions: ['Yêu thương', 'Kỷ niệm', 'Tặng không cần dịp'],
    colorPalette: ['Hồng phấn', 'Trắng ngà'],
    flowerComposition: ['Hồng garden', 'Ranunculus', 'Lisianthus', 'Eucalyptus'],
    sizeOptions: standardSizes(680000),
    wrappingOptions,
    status: 'Có sẵn',
    badges: [],
    isBestSeller: true,
    createdAt: '2026-08-10',
    relatedProductIds: ['nang-diu', 'may-trang', 'dem-nhe'],
  },
  {
    id: 'may-trang',
    slug: 'may-trang',
    name: 'Mây Trắng',
    price: 620000,
    images: [
      { src: whiteImage, alt: 'Bó Mây Trắng với tulip và hoa trắng theo mùa' },
      { src: seasonalImage, alt: 'Hoa trắng theo mùa trong ánh sáng tự nhiên' },
    ],
    shortDescription: 'Tulip trắng và sắc xanh thanh mát.',
    description:
      'Trong trẻo và thư thái, Mây Trắng dành cho một khởi đầu mới hoặc một lời chúc thật an lành.',
    collection: 'Khoảng trời trong',
    moods: ['Trong trẻo', 'An lành'],
    occasions: ['Khởi đầu mới', 'Lời cảm ơn', 'Chia sẻ'],
    colorPalette: ['Trắng', 'Xanh lá'],
    flowerComposition: ['Tulip trắng', 'Mõm sói', 'Cúc tana', 'Lá olive'],
    sizeOptions: standardSizes(620000),
    wrappingOptions,
    status: 'Theo mùa',
    badges: ['Theo mùa'],
    isBestSeller: true,
    createdAt: '2026-08-15',
    relatedProductIds: ['vuon-som-mai', 'ban-mai-xanh', 'du-am-hong'],
  },
  {
    id: 'vuon-som-mai',
    slug: 'vuon-som-mai',
    name: 'Vườn Sớm Mai',
    price: 750000,
    images: [
      { src: windowImage, alt: 'Bó Vườn Sớm Mai với hoa hồng nhạt và foliage' },
      { src: craftImage, alt: 'Người thợ hoa hoàn thiện bó hoa hồng nhạt' },
    ],
    shortDescription: 'Sớm mai dịu dàng, tự nhiên và tươi mới.',
    description:
      'Một khu vườn nhỏ trong tay, nhiều lớp hoa và lá để không gian ngày mới trở nên mềm mại hơn.',
    collection: 'Khoảnh khắc dịu dàng',
    moods: ['Tươi mới', 'Tự nhiên'],
    occasions: ['Sinh nhật', 'Khởi đầu mới', 'Yêu thương'],
    colorPalette: ['Hồng nhạt', 'Xanh lá'],
    flowerComposition: ['Hồng spray', 'Thược dược', 'Cẩm tú cầu', 'Dương xỉ'],
    sizeOptions: standardSizes(750000),
    wrappingOptions,
    status: 'Có sẵn',
    badges: [],
    isBestSeller: true,
    createdAt: '2026-08-06',
    relatedProductIds: ['nang-diu', 'dem-nhe', 'may-trang'],
  },
  {
    id: 'sac-apricot',
    slug: 'sac-apricot',
    name: 'Sắc Apricot',
    price: 640000,
    images: [
      { src: birthdayImage, alt: 'Bó Sắc Apricot với hoa đào và sắc vàng ấm' },
      { src: heroImage, alt: 'Hoa apricot và kem trong ánh sáng sớm' },
    ],
    shortDescription: 'Apricot ấm, hồng nhạt và lớp lá mềm.',
    description:
      'Sắc hoa tươi nhưng không quá rực, phù hợp để gửi một lời chúc đầy năng lượng và tinh tế.',
    collection: 'Những ngày rực rỡ',
    moods: ['Vui tươi', 'Năng lượng'],
    occasions: ['Sinh nhật', 'Chúc mừng', 'Lời cảm ơn'],
    colorPalette: ['Apricot', 'Vàng kem'],
    flowerComposition: ['Hồng apricot', 'Đồng tiền', 'Cẩm chướng', 'Lá nguyệt quế'],
    sizeOptions: standardSizes(640000),
    wrappingOptions,
    status: 'Có sẵn',
    badges: ['Mới'],
    isBestSeller: false,
    createdAt: '2026-08-22',
    relatedProductIds: ['nang-diu', 'vuon-som-mai', 'gio-hoa-nhe'],
  },
  {
    id: 'dem-nhe',
    slug: 'dem-nhe',
    name: 'Đêm Nhẹ',
    price: 720000,
    images: [
      { src: giftingImage, alt: 'Bó Đêm Nhẹ tông hồng trầm cùng gói quà nhỏ' },
      { src: craftImage, alt: 'Bó hoa hồng trầm được buộc tay' },
    ],
    shortDescription: 'Hồng trầm, mận chín và nâu ấm.',
    description:
      'Một bó hoa có chiều sâu, dành cho những dịp cần nhiều hơn một lời chúc ngắn gọn.',
    collection: 'Lời muốn nói',
    moods: ['Sâu lắng', 'Lãng mạn'],
    occasions: ['Yêu thương', 'Kỷ niệm', 'Chia sẻ'],
    colorPalette: ['Hồng trầm', 'Đỏ rượu'],
    flowerComposition: ['Hồng đỏ sẫm', 'Cẩm chướng mận', 'Astrantia', 'Lá ruscus'],
    sizeOptions: standardSizes(720000),
    wrappingOptions,
    status: 'Đặt trước',
    badges: ['Đặt trước'],
    isBestSeller: false,
    createdAt: '2026-08-20',
    relatedProductIds: ['du-am-hong', 'vuon-som-mai', 'gio-hoa-nhe'],
  },
  {
    id: 'ban-mai-xanh',
    slug: 'ban-mai-xanh',
    name: 'Ban Mai Xanh',
    price: 560000,
    images: [
      { src: seasonalImage, alt: 'Bó Ban Mai Xanh với hoa trắng và foliage xanh' },
      { src: whiteImage, alt: 'Bó hoa xanh trắng nhẹ nhàng' },
    ],
    shortDescription: 'Trắng xanh mát lành, nhẹ như buổi sớm.',
    description:
      'Bó hoa nhiều khoảng thở tự nhiên, mang cảm giác thanh mát và gần gũi cho bất kỳ ngày nào.',
    collection: 'Khoảng trời trong',
    moods: ['Thanh mát', 'Bình yên'],
    occasions: ['Khởi đầu mới', 'Chia sẻ', 'Tặng không cần dịp'],
    colorPalette: ['Trắng', 'Xanh lá'],
    flowerComposition: ['Cúc mẫu đơn', 'Thanh liễu', 'Cúc tana', 'Lá bạc'],
    sizeOptions: standardSizes(560000),
    wrappingOptions,
    status: 'Có sẵn',
    badges: [],
    isBestSeller: false,
    createdAt: '2026-08-21',
    relatedProductIds: ['may-trang', 'gio-hoa-nhe', 'nang-diu'],
  },
  {
    id: 'gio-hoa-nhe',
    slug: 'gio-hoa-nhe',
    name: 'Gió Hoa Nhẹ',
    price: 610000,
    images: [
      { src: windowImage, alt: 'Bó Gió Hoa Nhẹ với hoa hồng và hoa đồng nội' },
      { src: heroImage, alt: 'Bó hoa hồng phấn bên cửa sổ' },
    ],
    shortDescription: 'Hồng phấn, hoa đồng nội và nét xanh mềm.',
    description:
      'Dành cho những ngày không cần lý do lớn, chỉ cần một bó hoa làm dịu căn phòng hoặc nụ cười.',
    collection: 'Khoảnh khắc dịu dàng',
    moods: ['Nhẹ nhàng', 'Tự nhiên'],
    occasions: ['Tặng không cần dịp', 'Lời cảm ơn', 'Sinh nhật'],
    colorPalette: ['Hồng phấn', 'Xanh lá'],
    flowerComposition: ['Hồng spray', 'Cúc tana', 'Mao lương', 'Dương xỉ'],
    sizeOptions: standardSizes(610000),
    wrappingOptions,
    status: 'Có sẵn',
    badges: [],
    isBestSeller: false,
    createdAt: '2026-08-12',
    relatedProductIds: ['ban-mai-xanh', 'nang-diu', 'du-am-hong'],
  },
]

export const bestSellers = products.filter((product) => product.isBestSeller)

export function getProductBySlug(slug) {
  return products.find((product) => product.slug === slug)
}
