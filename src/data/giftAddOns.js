export const giftAddOns = [
  {
    id: 'handwritten-card',
    name: 'Thiệp viết tay',
    price: 0,
    note: 'Được viết riêng theo lời nhắn của bạn.',
  },
  {
    id: 'mini-scented-candle',
    name: 'Nến thơm mini',
    price: 120000,
    note: 'Hương dịu, được chuẩn bị cùng bó hoa.',
  },
  {
    id: 'artisan-chocolate',
    name: 'Chocolate thủ công',
    price: 180000,
    note: 'Một chút ngọt ngào để gửi kèm.',
  },
  {
    id: 'small-ceramic-vase',
    name: 'Bình gốm nhỏ',
    price: 260000,
    note: 'Dáng gọn cho một góc nhỏ trong nhà.',
  },
]

export function createGiftAddOnSnapshot(addOn) {
  return { id: addOn.id, name: addOn.name, price: addOn.price }
}
