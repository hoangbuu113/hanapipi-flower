import birthdayImage from '../assets/occasion-birthday.jpg'
import craftImage from '../assets/florist-craft.jpg'
import heroImage from '../assets/hero-bouquet.jpg'
import seasonalImage from '../assets/seasonal-collection.jpg'
import giftingImage from '../assets/social-gifting.jpg'
import windowImage from '../assets/social-window.jpg'
import whiteImage from '../assets/occasion-white.jpg'

export const occasions = [
  {
    alt: 'Bó hoa cam đào nhẹ nhàng trên bàn gỗ cho dịp sinh nhật',
    image: birthdayImage,
    label: 'Sinh nhật',
  },
  {
    alt: 'Bó hoa hồng phấn và kem trong ánh nắng cửa sổ',
    image: heroImage,
    label: 'Yêu thương',
  },
  {
    alt: 'Khoảnh khắc tặng hoa cùng hộp quà và thiệp viết tay',
    image: giftingImage,
    label: 'Lời cảm ơn',
  },
  {
    alt: 'Bó hoa trắng tinh tế trong không gian đá sáng',
    image: whiteImage,
    label: 'Khởi đầu mới',
  },
  {
    alt: 'Người thợ hoa buộc tay bó hoa tươi',
    image: craftImage,
    label: 'Chia sẻ',
  },
  {
    alt: 'Bình hoa theo mùa bên khung cửa sổ đầy nắng',
    image: windowImage,
    label: 'Tặng không cần dịp',
  },
]

export const bestSellers = [
  {
    alt: 'Bó Nắng Dịu với hoa cam đào và kem',
    badge: 'Bán chạy',
    description: 'Cam đào, kem và nét xanh nhẹ.',
    image: birthdayImage,
    name: 'Nắng Dịu',
    price: 590000,
  },
  {
    alt: 'Bó Dư Âm Hồng với hoa hồng phấn và hoa trắng',
    badge: null,
    description: 'Hồng phấn, trắng ngà, đầy dư âm.',
    image: heroImage,
    name: 'Dư Âm Hồng',
    price: 680000,
  },
  {
    alt: 'Bó Mây Trắng với tulip và hoa trắng theo mùa',
    badge: 'Theo mùa',
    description: 'Tulip trắng và sắc xanh thanh mát.',
    image: whiteImage,
    name: 'Mây Trắng',
    price: 620000,
  },
  {
    alt: 'Bó Vườn Sớm Mai với hoa hồng nhạt và foliage',
    badge: null,
    description: 'Sớm mai dịu dàng, tự nhiên và tươi mới.',
    image: windowImage,
    name: 'Vườn Sớm Mai',
    price: 750000,
  },
]

export const testimonials = [
  {
    author: 'Minh Anh',
    location: 'Quận 3, TP. Hồ Chí Minh',
    quote: 'Hoa đẹp và tinh tế hơn mong đợi. Người nhận rất thích tấm thiệp đi kèm.',
  },
  {
    author: 'Thảo Vy',
    location: 'Quận Bình Thạnh, TP. Hồ Chí Minh',
    quote: 'Giao đúng khung giờ, bó hoa tươi và được gói rất chỉn chu.',
  },
  {
    author: 'Ngọc Hà',
    location: 'Quận Cầu Giấy, Hà Nội',
    quote: 'Chỉ cần nói dịp tặng, Hanapipi Flower đã hiểu đúng điều mình muốn gửi gắm.',
  },
]

export const socialMoments = [
  {
    alt: 'Bó hoa hồng phấn bên cửa sổ',
    caption: 'Một lời chúc sinh nhật dịu dàng.',
    image: heroImage,
  },
  {
    alt: 'Hoa tươi gói giấy bên món quà nhỏ',
    caption: 'Gửi cả điều khó nói.',
    image: giftingImage,
  },
  {
    alt: 'Bình hoa tươi bên cửa sổ',
    caption: 'Một góc nhà đầy hoa.',
    image: windowImage,
  },
  {
    alt: 'Người thợ hoa đang buộc tay bó hoa',
    caption: 'Từ những cành hoa được chọn kỹ.',
    image: craftImage,
  },
  {
    alt: 'Bó hoa sắc cam đào ấm áp',
    caption: 'Chút nắng cho ngày mới.',
    image: birthdayImage,
  },
  {
    alt: 'Bó hoa trắng tinh tế',
    caption: 'Nhẹ nhàng cho một khởi đầu.',
    image: whiteImage,
  },
]

export const homeImages = {
  craft: craftImage,
  hero: heroImage,
  seasonal: seasonalImage,
}
