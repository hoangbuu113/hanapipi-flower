import personalFlowerMemoryOne from '../assets/hanapipi-photos/personal-gallery/personal-flower-memory-01.jpg'
import personalFlowerMemoryTwo from '../assets/hanapipi-photos/personal-gallery/personal-flower-memory-02.jpg'
import personalFlowerVideo from '../assets/hanapipi-photos/personal-gallery/personal-flower-video-01.mp4'
import personalFlowerVideoPoster from '../assets/hanapipi-photos/personal-gallery/personal-flower-video-01-poster.jpg'

export const personalFlowerMedia = [
  {
    alt: 'Một khoảnh khắc riêng của bông hoa vô giá trong không gian âm nhạc.',
    caption: 'Một chiều rất riêng, vẫn thuộc bộ sưu tập chỉ để ngắm.',
    position: 'center 48%',
    src: personalFlowerMemoryOne,
    type: 'image',
  },
  {
    alt: 'Bông hoa thuộc bộ sưu tập chỉ để ngắm giữa khu vườn mùa lễ hội.',
    caption: 'Một chút sắc đỏ dành riêng cho bộ sưu tập không restock.',
    position: 'center 42%',
    src: personalFlowerMemoryTwo,
    type: 'image',
  },
  {
    alt: 'Một thước phim riêng của bông hoa vô giá.',
    caption: 'Khoảnh khắc chuyển động, đã được giữ yên phần âm thanh.',
    fit: 'contain',
    poster: personalFlowerVideoPoster,
    src: personalFlowerVideo,
    type: 'video',
  },
]
