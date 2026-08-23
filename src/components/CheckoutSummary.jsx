import { DeliveryProgress } from './CartItems'
import { formatCurrency } from '../utils/formatCurrency'
import { formatDeliveryDate, getCartItemPresentation } from '../utils/order'
import './CheckoutSummary.css'

function CheckoutSummary({ cartItems, deliveryDraft, subtotal }) {
  return <aside className="checkout-summary" aria-label="Tóm tắt đơn hoa">
    <h2>Đơn hoa của bạn</h2>
    <div className="checkout-summary__items">{cartItems.map((item) => { const presentation = getCartItemPresentation(item); return <div key={item.key}><div><strong>{presentation.name}</strong><span>{presentation.details}</span><span>Số lượng: {item.quantity}</span></div><b>{formatCurrency(item.unitPrice * item.quantity)}</b></div> })}</div>
    <div className="checkout-summary__delivery"><span>Giao dự kiến</span><strong>{formatDeliveryDate(deliveryDraft.date)}{deliveryDraft.slot ? ` · ${deliveryDraft.slot}` : ''}</strong></div>
    <DeliveryProgress subtotal={subtotal} />
    <div className="checkout-summary__total"><span>Tổng thanh toán</span><strong>{formatCurrency(subtotal)}</strong></div>
  </aside>
}
export default CheckoutSummary
