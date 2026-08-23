import whiteBouquetOne from '../assets/hanapipi-photos/0a16b3a9-6b5b-41a5-bb9f-c4f3e003ba0d.jfif'
import fiveRedRosesImage from '../assets/hanapipi-photos/11e6ab96-b808-4da3-81cd-737f39fc97c3.jfif'
import pinkBouquetOne from '../assets/hanapipi-photos/41cd6826-4f50-40cd-9b08-32438e216342.jfif'
import strawberryGiftImage from '../assets/hanapipi-photos/42fdaebb-daa5-4b66-87cd-56b4666bd3ba.jfif'
import pastelBouquetOne from '../assets/hanapipi-photos/45c02138-3e6c-42f9-ac5c-40f748c868d2.jfif'
import blushAtelierImage from '../assets/hanapipi-photos/49ce5412-ca99-45e1-8347-b8b6e8957cf1 (1).jfif'
import blushAtelierDuplicate from '../assets/hanapipi-photos/49ce5412-ca99-45e1-8347-b8b6e8957cf1.jfif'
import whiteBouquetTwo from '../assets/hanapipi-photos/4a543021-ea8d-41ab-b921-e1b062334cfd.jfif'
import blueWrappedBlushImage from '../assets/hanapipi-photos/4e295c8e-4bd7-489b-8bbc-3485e350a064.jfif'
import blueBouquetOne from '../assets/hanapipi-photos/4f55637f-62c1-4c4a-86b9-1a0a91d53b7d.jfif'
import blueMeadowImage from '../assets/hanapipi-photos/60e6dad8-bd92-4b9b-83bb-466ef6035ee6.jfif'
import classicRedRosesImage from '../assets/hanapipi-photos/7c5b31b5-e724-413d-9654-6b7774972a8c.jfif'
import softPinkRosesImage from '../assets/hanapipi-photos/8ba5f461-1cd8-47ad-a09e-aed8b3d38e80.jfif'
import bluePinkBouquetOne from '../assets/hanapipi-photos/8f4bc810-e1dd-4fa0-8094-9436d1872ec7.jfif'
import sunflowerBouquet from '../assets/hanapipi-photos/9d055925-4c58-4c97-8bb4-88714cc1468a.jfif'
import blushBouquetOne from '../assets/hanapipi-photos/ae7bf17a-f600-4378-9c5f-82004588994f.jfif'
import noWateringFlowerImage from '../assets/hanapipi-photos/bcaa9546-c4be-416d-9bf7-454eb2fd3b8b.jfif'
import redBouquetOne from '../assets/hanapipi-photos/c0a70a74-4bba-447a-a25c-a5c26bf8b669.jfif'
import pastelCloudImage from '../assets/hanapipi-photos/c0b9c0a4-8fc4-482e-b2ca-cfe4707dab96.jfif'
import bluePinkRibbonImage from '../assets/hanapipi-photos/c4ac4a4d-d91d-4a17-aaf0-29e95394caa2.jfif'
import gentleWhitePinkImage from '../assets/hanapipi-photos/d48f02bc-4b0f-422d-8d00-01349439972e.jfif'
import blushRoseGardenImage from '../assets/hanapipi-photos/d68f0fff-be3f-4c1e-8af6-844f9ab0f9fc.jfif'
import softPinkGardenImage from '../assets/hanapipi-photos/e40e61f7-3281-4064-af20-e08842412663.jfif'
import happyPastelImage from '../assets/hanapipi-photos/ed53b488-db50-4f7b-977b-7a863b4ba2ba.jfif'
import grandArrangementImage from '../assets/hanapipi-photos/fa411ea3-dd3e-4e6a-b4ee-f7dd36ef7f06.jfif'
import pinkBouquetDetail from '../assets/hanapipi-photos/fca52819-999f-479f-af3f-bc046b4a18cb.jfif'
import { productPrices } from './prices'

const standardCareNote =
  'Đặt hoa nơi thoáng mát, thay nước mỗi ngày và cắt vát gốc hoa khoảng 1–2 cm.'
const standardDeliveryNote =
  'Có thể giao trong ngày tại khu vực được hỗ trợ; thời gian sẽ được xác nhận theo địa chỉ.'

const standardSizes = (price) => [
  { id: 'small', label: 'Nhỏ', price: price - 100000 },
  { id: 'standard', label: 'Tiêu chuẩn', price },
  { id: 'large', label: 'Lớn', price: price + 180000 },
]

const wrappingOptions = [
  { id: 'ivory-paper', label: 'Giấy ivory mờ', note: 'Nhẹ nhàng, tối giản' },
  { id: 'blush-ribbon', label: 'Ruy băng hồng phấn', note: 'Dịu dàng, có điểm nhấn' },
]

const createProduct = (product) => ({
  badges: [],
  careNote: standardCareNote,
  deliveryNote: standardDeliveryNote,
  isBestSeller: false,
  sizeOptions: standardSizes(product.price),
  status: 'Có sẵn',
  wrappingOptions,
  ...product,
})

export const products = [
  createProduct({
    id: 'nang-diu',
    slug: 'nang-diu',
    name: 'Nắng Dịu',
    price: productPrices['nang-diu'],
    images: [
      { src: sunflowerBouquet, alt: 'Bó Nắng Dịu với ba bông hướng dương và hoa nhỏ màu trắng', position: 'center 46%' },
    ],
    shortDescription: 'Hướng dương vàng và lớp hoa nhỏ trắng nhẹ.',
    description:
      'Ba bông hướng dương được gói cùng hoa nhỏ màu trắng và sắc xanh tự nhiên, vừa tươi sáng vừa gọn gàng.',
    collection: 'Những ngày tươi sáng',
    moods: ['Ấm áp', 'Rạng rỡ'],
    occasions: ['Sinh nhật', 'Lời cảm ơn', 'Tặng không cần dịp'],
    colorPalette: ['Vàng ấm', 'Trắng'],
    flowerComposition: ['Hướng dương', 'Hoa nhỏ màu trắng', 'Foliage theo mùa'],
    badges: ['Bán chạy'],
    isBestSeller: true,
    createdAt: '2026-08-18',
    relatedProductIds: ['five-red-roses', 'happy-pastel', 'gentle-white-pink'],
  }),
  createProduct({
    id: 'du-am-hong',
    slug: 'du-am-hong',
    name: 'Dư Âm Hồng',
    price: productPrices['du-am-hong'],
    images: [
      { src: blushBouquetOne, alt: 'Bó Dư Âm Hồng với cụm hoa hồng dịu và hoa trắng ngà', position: 'center 46%' },
    ],
    shortDescription: 'Hồng phấn, trắng ngà và nhiều lớp hoa mềm.',
    description:
      'Những lớp hoa hồng dịu và trắng ngà được sắp theo dáng tròn đầy, phù hợp cho một lời yêu thương tinh tế.',
    collection: 'Lời muốn nói',
    moods: ['Lãng mạn', 'Dịu dàng'],
    occasions: ['Yêu thương', 'Kỷ niệm', 'Tặng không cần dịp'],
    colorPalette: ['Hồng phấn', 'Trắng ngà'],
    flowerComposition: ['Hoa hồng tông trắng và phấn', 'Cụm hoa tông hồng theo mùa', 'Foliage xanh'],
    isBestSeller: true,
    createdAt: '2026-08-10',
    relatedProductIds: ['blush-rose-garden', 'soft-pink-garden', 'soft-pink-roses'],
  }),
  createProduct({
    id: 'may-trang',
    slug: 'may-trang',
    name: 'Mây Trắng',
    price: productPrices['may-trang'],
    images: [
      { src: whiteBouquetOne, alt: 'Bó Mây Trắng với hoa hồng trắng, hoa nhỏ li ti và foliage xanh', position: 'center 45%' },
    ],
    shortDescription: 'Hoa hồng trắng và sắc xanh thanh mát.',
    description:
      'Hoa hồng trắng đi cùng hoa nhỏ và foliage xanh, tạo nên một thiết kế sáng, thanh thoát cho những khởi đầu mới.',
    collection: 'Khoảng trời trong',
    moods: ['Trong trẻo', 'An lành'],
    occasions: ['Khởi đầu mới', 'Lời cảm ơn', 'Chia sẻ'],
    colorPalette: ['Trắng', 'Xanh lá'],
    flowerComposition: ['Hoa hồng trắng', 'Hoa nhỏ màu trắng', 'Foliage xanh theo mùa'],
    status: 'Theo mùa',
    badges: ['Theo mùa'],
    isBestSeller: true,
    createdAt: '2026-08-15',
    relatedProductIds: ['grand-white-roses', 'gentle-white-pink', 'ban-mai-xanh'],
  }),
  createProduct({
    id: 'vuon-som-mai',
    slug: 'vuon-som-mai',
    name: 'Vườn Sớm Mai',
    price: productPrices['vuon-som-mai'],
    images: [
      { src: pastelBouquetOne, alt: 'Bó Vườn Sớm Mai với hoa hồng phấn, xanh dịu và trắng kem', position: 'center 42%' },
      { src: pinkBouquetDetail, alt: 'Chi tiết những lớp hoa hồng phấn và xanh dịu của Vườn Sớm Mai', position: 'center 48%' },
    ],
    shortDescription: 'Hồng phấn, xanh dịu và nhiều lớp hoa mềm.',
    description:
      'Một thiết kế đầy đặn với sắc hồng phấn, xanh dịu và trắng kem, cân bằng giữa nét tươi sáng và mềm mại.',
    collection: 'Khoảnh khắc dịu dàng',
    moods: ['Tươi mới', 'Tự nhiên'],
    occasions: ['Sinh nhật', 'Khởi đầu mới', 'Yêu thương'],
    colorPalette: ['Hồng phấn', 'Xanh lam'],
    flowerComposition: ['Hoa tông hồng', 'Cụm hoa xanh dịu theo mùa', 'Foliage xanh'],
    isBestSeller: true,
    createdAt: '2026-08-06',
    relatedProductIds: ['pastel-cloud', 'happy-pastel', 'gio-hoa-nhe'],
  }),
  createProduct({
    id: 'sac-apricot',
    slug: 'sac-apricot',
    name: 'Ngày Hồng',
    price: productPrices['sac-apricot'],
    images: [
      { src: pinkBouquetOne, alt: 'Bó Ngày Hồng với hoa tông hồng sáng và trắng kem', position: 'center 44%' },
    ],
    shortDescription: 'Hồng sáng, trắng kem và nhịp hoa tươi.',
    description:
      'Sắc hồng sáng được điểm bằng hoa trắng kem và foliage xanh, phù hợp cho sinh nhật hoặc một lời cảm ơn tươi vui.',
    collection: 'Những ngày rực rỡ',
    moods: ['Vui tươi', 'Năng lượng'],
    occasions: ['Sinh nhật', 'Chúc mừng', 'Lời cảm ơn'],
    colorPalette: ['Hồng phấn', 'Trắng'],
    flowerComposition: ['Hoa tông hồng và trắng', 'Cụm hoa theo mùa', 'Foliage xanh'],
    badges: ['Mới'],
    createdAt: '2026-08-22',
    relatedProductIds: ['happy-pastel', 'blue-wrapped-blush', 'nang-diu'],
  }),
  createProduct({
    id: 'dem-nhe',
    slug: 'dem-nhe',
    name: 'Đêm Nhẹ',
    price: productPrices['dem-nhe'],
    images: [
      { src: redBouquetOne, alt: 'Bó Đêm Nhẹ cỡ lớn với hoa hồng đỏ đậm và hoa nhỏ màu trắng', position: 'center 43%' },
    ],
    shortDescription: 'Hoa hồng đỏ đậm, điểm hoa trắng nhỏ.',
    description:
      'Hoa hồng đỏ đậm được bó dày, điểm bằng những cành hoa trắng nhỏ để tổng thể mạnh mẽ mà vẫn thanh thoát.',
    collection: 'Lời muốn nói',
    moods: ['Sâu lắng', 'Lãng mạn'],
    occasions: ['Yêu thương', 'Kỷ niệm', 'Chia sẻ'],
    colorPalette: ['Đỏ', 'Trắng'],
    flowerComposition: ['Hoa hồng đỏ', 'Hoa nhỏ màu trắng', 'Foliage xanh'],
    status: 'Đặt trước',
    badges: ['Đặt trước'],
    createdAt: '2026-08-20',
    relatedProductIds: ['classic-red-roses', 'five-red-roses', 'grand-seasonal-arrangement'],
  }),
  createProduct({
    id: 'ban-mai-xanh',
    slug: 'ban-mai-xanh',
    name: 'Ban Mai Xanh',
    price: productPrices['ban-mai-xanh'],
    images: [
      { src: blueBouquetOne, alt: 'Bó Ban Mai Xanh với cụm hoa xanh lam và hoa nhỏ màu trắng', position: 'center 43%' },
    ],
    shortDescription: 'Xanh lam, trắng và một dáng bó gọn.',
    description:
      'Sắc xanh lam đi cùng hoa nhỏ màu trắng trong một dáng bó gọn, mang cảm giác nhẹ và hiện đại.',
    collection: 'Khoảng trời trong',
    moods: ['Thanh mát', 'Bình yên'],
    occasions: ['Khởi đầu mới', 'Chia sẻ', 'Tặng không cần dịp'],
    colorPalette: ['Xanh lam', 'Trắng'],
    flowerComposition: ['Cụm hoa xanh lam theo mùa', 'Hoa nhỏ màu trắng', 'Foliage xanh'],
    createdAt: '2026-08-21',
    relatedProductIds: ['blue-meadow', 'blue-pink-ribbon', 'may-trang'],
  }),
  createProduct({
    id: 'gio-hoa-nhe',
    slug: 'gio-hoa-nhe',
    name: 'Gió Hoa Nhẹ',
    price: productPrices['gio-hoa-nhe'],
    images: [
      { src: bluePinkBouquetOne, alt: 'Bó Gió Hoa Nhẹ với sắc xanh lam, hồng phấn và trắng ngà', position: 'center 43%' },
    ],
    shortDescription: 'Xanh lam, hồng phấn và trắng ngà cân bằng.',
    description:
      'Những cụm hoa xanh lam được cân bằng bằng sắc hồng phấn và trắng ngà, vừa dịu dàng vừa có điểm nhấn.',
    collection: 'Khoảnh khắc dịu dàng',
    moods: ['Nhẹ nhàng', 'Tự nhiên'],
    occasions: ['Tặng không cần dịp', 'Lời cảm ơn', 'Sinh nhật'],
    colorPalette: ['Xanh lam', 'Hồng phấn'],
    flowerComposition: ['Cụm hoa xanh lam theo mùa', 'Hoa tông hồng và trắng', 'Foliage xanh'],
    createdAt: '2026-08-12',
    relatedProductIds: ['pastel-cloud', 'blue-pink-ribbon', 'vuon-som-mai'],
  }),
  createProduct({
    id: 'five-red-roses',
    slug: 'five-red-roses',
    name: 'Năm Đóa Hồng',
    price: productPrices['five-red-roses'],
    images: [
      { src: fiveRedRosesImage, alt: 'Bó năm bông hồng đỏ cùng foliage xanh trong lớp giấy trắng', position: 'center 40%' },
    ],
    shortDescription: 'Năm bông hồng đỏ, gọn và rõ nét.',
    description:
      'Một dáng bó nhỏ với năm bông hồng đỏ và foliage xanh, phù hợp cho lời nhắn giản dị nhưng có chủ ý.',
    collection: 'Lời muốn nói',
    moods: ['Lãng mạn', 'Ấm áp'],
    occasions: ['Yêu thương', 'Lời cảm ơn', 'Tặng không cần dịp'],
    colorPalette: ['Đỏ', 'Xanh lá'],
    flowerComposition: ['Năm bông hồng đỏ', 'Foliage xanh theo mùa'],
    createdAt: '2026-08-23',
    relatedProductIds: ['classic-red-roses', 'dem-nhe', 'nang-diu'],
  }),
  createProduct({
    id: 'strawberry-bunny-gift',
    slug: 'strawberry-bunny-gift',
    name: 'Quà Ngọt',
    price: productPrices['strawberry-bunny-gift'],
    images: [
      { src: strawberryGiftImage, alt: 'Bó quà với dâu tây, hoa trắng tạo hình và nơ đỏ', position: 'center 44%' },
    ],
    shortDescription: 'Dâu tây, hoa trắng và những chiếc nơ đỏ.',
    description:
      'Một bó quà vui mắt kết hợp dâu tây với hoa trắng tạo hình, thích hợp cho sinh nhật hoặc món quà bất ngờ.',
    collection: 'Những ngày rực rỡ',
    moods: ['Vui tươi', 'Rạng rỡ'],
    occasions: ['Sinh nhật', 'Chúc mừng', 'Tặng không cần dịp'],
    colorPalette: ['Đỏ', 'Trắng'],
    flowerComposition: ['Dâu tây', 'Hoa trắng tạo hình', 'Nơ đỏ'],
    badges: ['Mới'],
    status: 'Đặt trước',
    createdAt: '2026-08-23',
    relatedProductIds: ['nang-diu', 'happy-pastel', 'gentle-white-pink'],
  }),
  createProduct({
    id: 'no-watering-flower',
    slug: 'no-watering-flower',
    name: 'Bông Hoa Không Cần Tưới',
    price: productPrices['no-watering-flower'],
    images: [
      {
        src: noWateringFlowerImage,
        alt: 'Ảnh cận cảnh vui nhộn của cô gái đang cầm cọ trang điểm',
        fit: 'contain',
        position: 'center',
      },
    ],
    shortDescription: 'Không cần tưới, chỉ cần được dỗ đúng lúc.',
    description:
      'Phiên bản giới hạn với biểu cảm khó đoán, năng lượng nhây tự nhiên và khả năng khiến người tặng tự giác xin lỗi dù chưa biết mình sai ở đâu.',
    collection: 'Phiên bản chỉ có một',
    moods: ['Đáng yêu', 'Tinh nghịch'],
    occasions: ['Yêu thương', 'Tặng không cần dịp', 'Lời cảm ơn'],
    colorPalette: ['Hồng phấn', 'Xám'],
    flowerComposition: [
      'Một biểu cảm phiên bản giới hạn',
      'Một cây cọ trang điểm',
      'Năng lượng nhây tự nhiên',
    ],
    careNote:
      'Cho ăn đúng giờ, dỗ dành nhẹ nhàng và tuyệt đối không mở đầu bằng câu “Em giận à?”.',
    deliveryNote:
      'Chỉ giao cho người đủ can đảm nhận quà; lịch giao còn tùy tâm trạng của “bông hoa”.',
    status: 'Đặt trước',
    badges: ['Phiên bản 1/1'],
    createdAt: '2026-08-23',
    relatedProductIds: ['strawberry-bunny-gift', 'five-red-roses', 'soft-pink-roses'],
  }),
  createProduct({
    id: 'blush-atelier',
    slug: 'blush-atelier',
    name: 'Hồng Sương',
    price: productPrices['blush-atelier'],
    images: [
      { src: blushAtelierImage, alt: 'Bó Hồng Sương với hoa hồng phấn, trắng ngà và foliage xanh', position: 'center 44%' },
      { src: blushAtelierDuplicate, alt: 'Một góc khác của bó Hồng Sương tại bàn hoa', position: 'center 44%' },
    ],
    shortDescription: 'Hồng phấn, trắng ngà và sắc xanh nhẹ.',
    description:
      'Những lớp hoa tông phấn và trắng ngà được bó mềm, giữ cảm giác tự nhiên và vừa vặn cho nhiều dịp tặng.',
    collection: 'Khoảnh khắc dịu dàng',
    moods: ['Dịu dàng', 'Tự nhiên'],
    occasions: ['Sinh nhật', 'Lời cảm ơn', 'Tặng không cần dịp'],
    colorPalette: ['Hồng phấn', 'Trắng ngà'],
    flowerComposition: ['Hoa tông hồng và trắng', 'Hoa theo mùa', 'Foliage xanh'],
    createdAt: '2026-08-19',
    relatedProductIds: ['du-am-hong', 'soft-pink-garden', 'blush-rose-garden'],
  }),
  createProduct({
    id: 'grand-white-roses',
    slug: 'grand-white-roses',
    name: 'Vườn Trắng',
    price: productPrices['grand-white-roses'],
    images: [
      { src: whiteBouquetTwo, alt: 'Bó Vườn Trắng cỡ lớn với hoa hồng trắng và foliage xanh', position: 'center 43%' },
    ],
    shortDescription: 'Hoa hồng trắng cỡ lớn và foliage thanh mát.',
    description:
      'Một bó hoa hồng trắng đầy đặn, điểm hoa nhỏ và foliage xanh trong lớp giấy gói sáng màu.',
    collection: 'Khoảng trời trong',
    moods: ['Thanh lịch', 'An lành'],
    occasions: ['Khởi đầu mới', 'Chúc mừng', 'Chia sẻ'],
    colorPalette: ['Trắng', 'Xanh lá'],
    flowerComposition: ['Hoa hồng trắng', 'Hoa nhỏ màu trắng', 'Foliage xanh theo mùa'],
    badges: ['Đặt trước'],
    status: 'Đặt trước',
    createdAt: '2026-08-17',
    relatedProductIds: ['may-trang', 'gentle-white-pink', 'blue-meadow'],
  }),
  createProduct({
    id: 'blue-wrapped-blush',
    slug: 'blue-wrapped-blush',
    name: 'Hồng Ban Mai',
    price: productPrices['blue-wrapped-blush'],
    images: [
      { src: blueWrappedBlushImage, alt: 'Bó Hồng Ban Mai với hoa hồng phấn và trắng trong lớp giấy xanh', position: 'center 44%' },
    ],
    shortDescription: 'Hồng phấn, trắng dịu và lớp giấy xanh nổi bật.',
    description:
      'Sắc hoa hồng phấn và trắng được đặt trong lớp giấy xanh, tạo một tổng thể tươi nhưng không quá rực.',
    collection: 'Những ngày tươi sáng',
    moods: ['Tươi mới', 'Dịu dàng'],
    occasions: ['Sinh nhật', 'Lời cảm ơn', 'Chúc mừng'],
    colorPalette: ['Hồng phấn', 'Trắng', 'Xanh lam'],
    flowerComposition: ['Hoa hồng tông phấn', 'Hoa trắng theo mùa', 'Foliage xanh'],
    createdAt: '2026-08-16',
    relatedProductIds: ['sac-apricot', 'happy-pastel', 'gentle-white-pink'],
  }),
  createProduct({
    id: 'blue-meadow',
    slug: 'blue-meadow',
    name: 'Mùa Xanh',
    price: productPrices['blue-meadow'],
    images: [
      { src: blueMeadowImage, alt: 'Bó Mùa Xanh với cụm hoa xanh lam và trắng cùng nơ xanh', fit: 'contain', position: 'center' },
    ],
    shortDescription: 'Xanh lam, trắng và chiếc nơ xanh mềm.',
    description:
      'Một thiết kế xanh lam và trắng có dáng rộng tự nhiên, hoàn thiện bằng nơ xanh cùng tông.',
    collection: 'Khoảng trời trong',
    moods: ['Thanh mát', 'Bình yên'],
    occasions: ['Khởi đầu mới', 'Chia sẻ', 'Tặng không cần dịp'],
    colorPalette: ['Xanh lam', 'Trắng'],
    flowerComposition: ['Cụm hoa xanh lam theo mùa', 'Hoa trắng theo mùa', 'Foliage xanh'],
    status: 'Theo mùa',
    badges: ['Theo mùa'],
    createdAt: '2026-08-14',
    relatedProductIds: ['ban-mai-xanh', 'blue-pink-ribbon', 'may-trang'],
  }),
  createProduct({
    id: 'classic-red-roses',
    slug: 'classic-red-roses',
    name: 'Hồng Đỏ Cổ Điển',
    price: productPrices['classic-red-roses'],
    images: [
      { src: classicRedRosesImage, alt: 'Bó hoa hồng đỏ cổ điển cùng hoa nhỏ màu trắng và giấy xanh nhạt', position: 'center 34%' },
    ],
    shortDescription: 'Hoa hồng đỏ và lớp hoa nhỏ màu trắng.',
    description:
      'Một bó hồng đỏ theo dáng cổ điển, được làm nhẹ bằng hoa nhỏ màu trắng và lớp giấy xanh nhạt.',
    collection: 'Lời muốn nói',
    moods: ['Lãng mạn', 'Sâu lắng'],
    occasions: ['Yêu thương', 'Kỷ niệm', 'Chia sẻ'],
    colorPalette: ['Đỏ', 'Trắng'],
    flowerComposition: ['Hoa hồng đỏ', 'Hoa nhỏ màu trắng', 'Foliage xanh'],
    createdAt: '2026-08-13',
    relatedProductIds: ['dem-nhe', 'five-red-roses', 'grand-seasonal-arrangement'],
  }),
  createProduct({
    id: 'soft-pink-roses',
    slug: 'soft-pink-roses',
    name: 'Sương Hồng',
    price: productPrices['soft-pink-roses'],
    images: [
      { src: softPinkRosesImage, alt: 'Bó Sương Hồng với hoa hồng phấn và foliage xanh trong lớp giấy trắng', position: 'center 43%' },
    ],
    shortDescription: 'Hoa hồng phấn và foliage xanh nhẹ.',
    description:
      'Sắc hồng phấn được bó theo dáng tròn mềm, điểm foliage xanh và hoa nhỏ để giữ tổng thể thoáng.',
    collection: 'Khoảnh khắc dịu dàng',
    moods: ['Dịu dàng', 'Lãng mạn'],
    occasions: ['Yêu thương', 'Sinh nhật', 'Lời cảm ơn'],
    colorPalette: ['Hồng phấn', 'Xanh lá'],
    flowerComposition: ['Hoa hồng phấn', 'Hoa nhỏ theo mùa', 'Foliage xanh'],
    createdAt: '2026-08-11',
    relatedProductIds: ['du-am-hong', 'soft-pink-garden', 'blush-atelier'],
  }),
  createProduct({
    id: 'pastel-cloud',
    slug: 'pastel-cloud',
    name: 'Mây Phấn',
    price: productPrices['pastel-cloud'],
    images: [
      { src: pastelCloudImage, alt: 'Bó Mây Phấn với sắc hồng phấn, xanh lam và trắng kem', position: 'center 43%' },
    ],
    shortDescription: 'Hồng phấn, xanh lam và trắng kem nhiều lớp.',
    description:
      'Một bó hoa pastel đầy đặn với sắc hồng phấn, xanh lam và trắng kem, phù hợp cho những dịp cần sự mềm mại.',
    collection: 'Khoảnh khắc dịu dàng',
    moods: ['Dịu dàng', 'Tươi mới'],
    occasions: ['Sinh nhật', 'Yêu thương', 'Chúc mừng'],
    colorPalette: ['Hồng phấn', 'Xanh lam', 'Trắng'],
    flowerComposition: ['Hoa tông hồng và trắng', 'Cụm hoa xanh dịu theo mùa', 'Foliage xanh'],
    createdAt: '2026-08-09',
    relatedProductIds: ['vuon-som-mai', 'gio-hoa-nhe', 'happy-pastel'],
  }),
  createProduct({
    id: 'blue-pink-ribbon',
    slug: 'blue-pink-ribbon',
    name: 'Dải Lụa Xanh',
    price: productPrices['blue-pink-ribbon'],
    images: [
      { src: bluePinkRibbonImage, alt: 'Bó Dải Lụa Xanh với hoa xanh lam, hồng phấn và nơ hồng', position: 'center 46%' },
    ],
    shortDescription: 'Xanh lam, hồng phấn và chiếc nơ hồng nhẹ.',
    description:
      'Sắc xanh lam và hồng phấn được gói trong lớp giấy trong, hoàn thiện bằng một dải nơ hồng mềm.',
    collection: 'Khoảng trời trong',
    moods: ['Thanh mát', 'Dịu dàng'],
    occasions: ['Sinh nhật', 'Lời cảm ơn', 'Tặng không cần dịp'],
    colorPalette: ['Xanh lam', 'Hồng phấn'],
    flowerComposition: ['Cụm hoa xanh lam theo mùa', 'Hoa tông hồng và trắng', 'Foliage xanh'],
    createdAt: '2026-08-08',
    relatedProductIds: ['ban-mai-xanh', 'gio-hoa-nhe', 'blue-meadow'],
  }),
  createProduct({
    id: 'gentle-white-pink',
    slug: 'gentle-white-pink',
    name: 'Lời Chúc Nhỏ',
    price: productPrices['gentle-white-pink'],
    images: [
      { src: gentleWhitePinkImage, alt: 'Bó Lời Chúc Nhỏ với hoa trắng, hồng nhạt và nơ xanh', position: 'center 43%' },
    ],
    shortDescription: 'Trắng, hồng nhạt và một dáng bó nhỏ gọn.',
    description:
      'Một bó hoa nhỏ với sắc trắng và hồng nhạt, phù hợp cho lời cảm ơn, lời chúc hoặc món quà nhẹ nhàng.',
    collection: 'Lời muốn nói',
    moods: ['Nhẹ nhàng', 'Trong trẻo'],
    occasions: ['Lời cảm ơn', 'Chia sẻ', 'Tặng không cần dịp'],
    colorPalette: ['Trắng', 'Hồng phấn'],
    flowerComposition: ['Hoa trắng theo mùa', 'Hoa tông hồng nhạt', 'Foliage xanh'],
    createdAt: '2026-08-07',
    relatedProductIds: ['may-trang', 'blue-wrapped-blush', 'nang-diu'],
  }),
  createProduct({
    id: 'blush-rose-garden',
    slug: 'blush-rose-garden',
    name: 'Vườn Hồng Phấn',
    price: productPrices['blush-rose-garden'],
    images: [
      { src: blushRoseGardenImage, alt: 'Bó Vườn Hồng Phấn với nhiều lớp hoa hồng phấn và trắng ngà', position: 'center 42%' },
    ],
    shortDescription: 'Hồng phấn, trắng ngà và dáng bó tròn đầy.',
    description:
      'Những lớp hoa phấn và trắng ngà được sắp dày vừa phải, tạo một bó hoa mềm và sáng trong lớp giấy trắng.',
    collection: 'Khoảnh khắc dịu dàng',
    moods: ['Dịu dàng', 'Lãng mạn'],
    occasions: ['Yêu thương', 'Sinh nhật', 'Kỷ niệm'],
    colorPalette: ['Hồng phấn', 'Trắng ngà'],
    flowerComposition: ['Hoa hồng tông phấn', 'Hoa trắng theo mùa', 'Foliage xanh'],
    createdAt: '2026-08-05',
    relatedProductIds: ['du-am-hong', 'soft-pink-garden', 'blush-atelier'],
  }),
  createProduct({
    id: 'soft-pink-garden',
    slug: 'soft-pink-garden',
    name: 'Hồng Êm',
    price: productPrices['soft-pink-garden'],
    images: [
      { src: softPinkGardenImage, alt: 'Bó Hồng Êm với hoa hồng phấn, hoa nhỏ màu trắng và foliage xanh', position: 'center 43%' },
    ],
    shortDescription: 'Hoa hồng phấn và những cành hoa trắng nhỏ.',
    description:
      'Hoa hồng phấn được gói cùng hoa nhỏ màu trắng và foliage xanh, giữ dáng bó tự nhiên và dễ tặng.',
    collection: 'Khoảnh khắc dịu dàng',
    moods: ['Nhẹ nhàng', 'Tự nhiên'],
    occasions: ['Sinh nhật', 'Lời cảm ơn', 'Tặng không cần dịp'],
    colorPalette: ['Hồng phấn', 'Trắng'],
    flowerComposition: ['Hoa hồng phấn', 'Hoa nhỏ màu trắng', 'Foliage xanh'],
    createdAt: '2026-08-04',
    relatedProductIds: ['soft-pink-roses', 'du-am-hong', 'blush-rose-garden'],
  }),
  createProduct({
    id: 'happy-pastel',
    slug: 'happy-pastel',
    name: 'Ngày Tươi',
    price: productPrices['happy-pastel'],
    images: [
      { src: happyPastelImage, alt: 'Bó Ngày Tươi với hoa hồng phấn, xanh dịu và trắng kem', position: 'center 43%' },
    ],
    shortDescription: 'Hồng tươi, xanh dịu và trắng kem cân bằng.',
    description:
      'Một thiết kế pastel tươi sáng với sắc hồng, xanh dịu và trắng kem, phù hợp cho sinh nhật hoặc lời chúc mừng.',
    collection: 'Những ngày rực rỡ',
    moods: ['Vui tươi', 'Tươi mới'],
    occasions: ['Sinh nhật', 'Chúc mừng', 'Lời cảm ơn'],
    colorPalette: ['Hồng phấn', 'Xanh lam', 'Trắng'],
    flowerComposition: ['Hoa tông hồng và trắng', 'Cụm hoa xanh dịu theo mùa', 'Foliage xanh'],
    badges: ['Mới'],
    createdAt: '2026-08-03',
    relatedProductIds: ['sac-apricot', 'pastel-cloud', 'blue-wrapped-blush'],
  }),
  createProduct({
    id: 'grand-seasonal-arrangement',
    slug: 'grand-seasonal-arrangement',
    name: 'Vườn Đỏ Kem',
    price: productPrices['grand-seasonal-arrangement'],
    images: [
      { src: grandArrangementImage, alt: 'Lẵng Vườn Đỏ Kem cỡ lớn với sắc kem, đỏ trầm và xanh theo mùa', position: 'center 43%' },
    ],
    shortDescription: 'Kem, đỏ trầm và xanh theo mùa trong dáng lẵng lớn.',
    description:
      'Một thiết kế lẵng hoa nhiều lớp với sắc kem, đỏ trầm và xanh theo mùa, phù hợp cho dịp chúc mừng trang trọng.',
    collection: 'Thiết kế theo mùa',
    moods: ['Ấm áp', 'Sâu lắng'],
    occasions: ['Chúc mừng', 'Kỷ niệm', 'Chia sẻ'],
    colorPalette: ['Đỏ', 'Trắng', 'Xanh lá'],
    flowerComposition: ['Hoa hồng tông kem và đỏ', 'Cụm hoa xanh theo mùa', 'Foliage xanh'],
    status: 'Đặt trước',
    badges: ['Đặt trước'],
    createdAt: '2026-08-02',
    relatedProductIds: ['dem-nhe', 'classic-red-roses', 'grand-white-roses'],
  }),
]

export const bestSellers = products.filter((product) => product.isBestSeller)

export function getProductBySlug(slug) {
  return products.find((product) => product.slug === slug)
}
