import { DeliveryProgress } from './CartItems'
import { formatCurrency } from '../utils/formatCurrency'
import { formatDeliveryDate, getCartItemPresentation } from '../utils/order'
import { cartItemLineTotal } from '../utils/cart'
import './CheckoutSummary.css'

function CheckoutSummary({ cartItems, deliveryDraft, gifting, subtotal }) {
  return <aside className="checkout-summary" aria-label="Tóm tắt đơn hoa">
    <h2>Đơn hoa của bạn</h2>
    <div className="checkout-summary__items">{cartItems.map((item) => { const presentation = getCartItemPresentation(item); return <div key={item.key}><div><strong>{presentation.name}</strong><span>{presentation.details}</span>{presentation.giftAddOns.map((addOn) => <span key={addOn.id}>+ {addOn.name}{addOn.price ? ` · ${formatCurrency(addOn.price)} / bó` : ' · Miễn phí'}</span>)}<span>Số lượng: {item.quantity}</span></div><b>{formatCurrency(cartItemLineTotal(item))}</b></div> })}</div>
    {(gifting?.message || gifting?.anonymous || gifting?.senderName) && <div className="checkout-summary__gifting"><span>Lời nhắn tặng hoa</span>{gifting.message && <p>“{gifting.message}”</p>}<strong>{gifting.anonymous ? 'Không ghi tên người gửi' : gifting.senderName}</strong></div>}
    <div className="checkout-summary__delivery"><span>Giao dự kiến</span><strong>{formatDeliveryDate(deliveryDraft.date)}{deliveryDraft.slot ? ` · ${deliveryDraft.slot}` : ''}</strong></div>
    <DeliveryProgress subtotal={subtotal} />
    <div className="checkout-summary__total"><span>Tổng thanh toán</span><strong>{formatCurrency(subtotal)}</strong></div>
  </aside>
}
export default CheckoutSummary
