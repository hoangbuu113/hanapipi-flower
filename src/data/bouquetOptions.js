import previewImage from '../assets/hanapipi-photos/ae7bf17a-f600-4378-9c5f-82004588994f.jfif'
import { bouquetPrices } from './prices'

export const bouquetPreviewImage = previewImage

export const bouquetSteps = ['Phong cách', 'Bảng màu', 'Kích thước', 'Hoa chủ đạo', 'Kiểu gói', 'Lời nhắn']

export const bouquetOptions = {
  styles: [
    { id: 'natural', label: 'Tự nhiên', description: 'Mềm mại, có khoảng thở và giàu texture.' },
    { id: 'minimal', label: 'Tối giản', description: 'Ít sắc độ, đường nét gọn gàng và thanh thoát.' },
    { id: 'romantic', label: 'Lãng mạn', description: 'Dịu dàng, nhiều lớp hoa và cảm xúc.' },
    { id: 'vivid', label: 'Rực rỡ', description: 'Tươi sáng, có điểm nhấn vui vẻ và sống động.' },
  ],
  palettes: [
    { id: 'cream-white', label: 'Kem và trắng', colors: ['#f6eee3', '#fffdf8', '#d9d1c2'] },
    { id: 'soft-pink', label: 'Hồng dịu', colors: ['#edc9c7', '#cf9290', '#f6e6df'] },
    { id: 'apricot', label: 'Cam đào', colors: ['#e7a279', '#f2cfaf', '#fff0db'] },
    { id: 'smoky-purple', label: 'Tím khói', colors: ['#8c7784', '#c9b3bd', '#e7dce3'] },
    { id: 'green-white', label: 'Xanh trắng', colors: ['#718374', '#ecf0e8', '#d2ddd0'] },
  ],
  sizes: [
    { id: 'small', label: 'Nhỏ', price: bouquetPrices.sizes.small },
    { id: 'standard', label: 'Tiêu chuẩn', price: bouquetPrices.sizes.standard },
    { id: 'large', label: 'Lớn', price: bouquetPrices.sizes.large },
  ],
  flowers: [
    { id: 'garden-rose', label: 'Hồng garden', description: 'Cánh dày, hương thơm nhẹ.', price: bouquetPrices.flowers['garden-rose'] },
    { id: 'ranunculus', label: 'Mao lương', description: 'Nhiều lớp cánh mềm mại.', price: bouquetPrices.flowers.ranunculus },
    { id: 'tulip', label: 'Tulip', description: 'Dáng hoa trong trẻo, hiện đại.', price: bouquetPrices.flowers.tulip },
    { id: 'lisianthus', label: 'Cát tường', description: 'Nhẹ nhàng và có độ rủ tự nhiên.', price: bouquetPrices.flowers.lisianthus },
  ],
  wrappings: [
    { id: 'ivory', label: 'Giấy ivory mờ', note: 'Không thêm phí', price: bouquetPrices.wrappings.ivory },
    { id: 'blush-ribbon', label: 'Ruy băng hồng phấn', note: '+30.000 ₫', price: bouquetPrices.wrappings['blush-ribbon'] },
    { id: 'linen', label: 'Vải linen tự nhiên', note: '+50.000 ₫', price: bouquetPrices.wrappings.linen },
  ],
}
