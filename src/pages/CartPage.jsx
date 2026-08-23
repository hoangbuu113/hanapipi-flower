import { Link } from 'react-router-dom'
import Container from '../components/Container'
import CartItems, { DeliveryProgress } from '../components/CartItems'
import { cartSubtotal } from '../utils/cart'
import { useCommerce } from '../context/commerceStore'
import { formatCurrency } from '../utils/formatCurrency'
import DeliverySelector from '../components/DeliverySelector'
import './CartPage.css'

function CartPage() {
  const { cartItems } = useCommerce()
  const subtotal = cartSubtotal(cartItems)
  return <main className="cart-page"><Container>
    <header className="cart-page__intro"><p className="eyebrow">Những bó hoa bạn đã chọn</p><h1>Giỏ hàng</h1></header>
    {cartItems.length ? <div className="cart-page__layout"><section aria-labelledby="cart-items-title"><h2 className="sr-only" id="cart-items-title">Các bó hoa trong giỏ hàng</h2><CartItems /><DeliverySelector /></section><aside className="cart-page__summary"><h2>Tóm tắt đơn hoa</h2><DeliveryProgress subtotal={subtotal} /><div><span>Tạm tính</span><strong>{formatCurrency(subtotal)}</strong></div><div className="cart-page__summary-actions"><Link className="button button--primary" to="/checkout">Tiếp tục thanh toán</Link><Link className="button button--secondary" to="/shop">Tiếp tục chọn hoa</Link></div></aside></div> : <div className="cart-page__empty"><h2>Giỏ hàng của bạn đang trống.</h2><p>Hãy chọn một bó hoa thật vừa vặn cho dịp sắp tới.</p><Link className="button button--secondary" to="/shop">Khám phá bộ sưu tập</Link></div>}
  </Container></main>
}
export default CartPage
