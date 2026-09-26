import { Link } from 'react-router-dom'
import { bouquetPreviewImage } from '../data/bouquetOptions'
import { formatCurrency } from '../utils/formatCurrency'
import { getCartItemPresentation } from '../utils/order'
import { cartItemLineTotal, cartItemUnitTotal, cartSubtotal } from '../utils/cart'
import './CheckoutSummary.css'

function CheckoutSummary({ cartItems, pricesReady = true }) {
  return (
    <div className="selection-summary">
      <h2>Giỏ hoa đã chọn</h2>
      <div className="selection-summary__items">
        {cartItems.map((item) => {
          const presentation = item.custom
            ? { name: item.name, details: [item.style, item.palette, item.size, ...(item.flowers || []), item.wrapping].filter(Boolean).join(' · '), giftAddOns: item.giftAddOns || [] }
            : { ...getCartItemPresentation(item), giftAddOns: item.giftAddOns || [] }
          const image = item.custom ? { src: bouquetPreviewImage, alt: 'Hình ảnh gợi ý cho bó hoa theo ý bạn' } : item.image
          const available = pricesReady && item.isAvailable !== false
          return (
            <article className="selection-summary__item" key={item.key}>
              {image?.src ? <img src={image.src} alt={image.alt || presentation.name} width="120" height="150" loading="lazy" style={{ objectFit: image.fit || 'cover', objectPosition: image.position || 'center' }} /> : <div className="selection-summary__image-placeholder" aria-label="Chưa có hình ảnh bó hoa" />}
              <div className="selection-summary__details">
                <h3>{item.slug ? <Link to={`/product/${item.slug}`}>{presentation.name}</Link> : presentation.name}</h3>
                {presentation.details && <p>{presentation.details}</p>}
                <p>Số lượng: <strong>{item.quantity}</strong></p>
                {presentation.giftAddOns.length > 0 && <ul aria-label="Quà gửi kèm">{presentation.giftAddOns.map((gift) => <li key={gift.id}>{gift.name}{gift.active === false ? ' · Không còn khả dụng, không tính phí' : ` · ${gift.price ? formatCurrency(gift.price) : 'Miễn phí'} / bó`}</li>)}</ul>}
                {item.message && <p>Lời nhắn: “{item.message}”</p>}
                {item.isAvailable === false && <p role="status">{item.unavailableReason || 'Lựa chọn này hiện không còn khả dụng.'}</p>}
                <dl>
                  <div><dt>Giá tham khảo / bó</dt><dd>{available ? formatCurrency(cartItemUnitTotal(item)) : 'Chưa xác định'}</dd></div>
                  <div><dt>Tạm tính</dt><dd>{available ? formatCurrency(cartItemLineTotal(item)) : 'Chưa xác định'}</dd></div>
                </dl>
              </div>
            </article>
          )
        })}
      </div>
      <div className="selection-summary__total"><span>Tổng giá tham khảo</span><strong>{pricesReady ? formatCurrency(cartSubtotal(cartItems)) : 'Đang cập nhật'}</strong></div>
      <p className="selection-summary__note">Giá mang tính tham khảo cho các lựa chọn hiện khả dụng. Giỏ hoa được giữ lại khi bạn xem tóm tắt hoặc liên hệ.</p>
    </div>
  )
}

export default CheckoutSummary
