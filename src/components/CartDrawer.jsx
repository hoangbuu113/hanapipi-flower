import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useCommerce } from '../context/commerceStore'
import CartItems, { DeliveryProgress } from './CartItems'
import { cartSubtotal } from '../utils/cart'
import { formatCurrency } from '../utils/formatCurrency'
import { trapDialogFocus } from '../utils/focus'
import './CartDrawer.css'

function CartDrawer() {
  const { cartItems, closeCart, isCartOpen } = useCommerce()
  const closeButtonRef = useRef(null)
  const closeCartRef = useRef(closeCart)
  const drawerPanelRef = useRef(null)
  const previousFocusRef = useRef(null)
  const subtotal = cartSubtotal(cartItems)

  useEffect(() => {
    closeCartRef.current = closeCart
  }, [closeCart])

  useEffect(() => {
    if (!isCartOpen) return undefined

    previousFocusRef.current = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus())
    const handleKeydown = (event) => {
      if (event.key === 'Escape') closeCartRef.current()
      else trapDialogFocus(event, drawerPanelRef.current)
    }
    window.addEventListener('keydown', handleKeydown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeydown)

      const previousFocus = previousFocusRef.current
      if (previousFocus?.isConnected) {
        window.requestAnimationFrame(() => previousFocus.focus())
      }
    }
  }, [isCartOpen])
  if (!isCartOpen) return null
  return <div className="cart-drawer" role="dialog" aria-modal="true" aria-label="Giỏ hàng của bạn">
    <button aria-label="Đóng giỏ hàng" className="cart-drawer__backdrop" type="button" onClick={closeCart} />
    <aside ref={drawerPanelRef} className="cart-drawer__panel">
      <header><h2>Giỏ hàng</h2><button ref={closeButtonRef} aria-label="Đóng giỏ hàng" type="button" onClick={closeCart}><X aria-hidden="true" /></button></header>
      {cartItems.length ? <><div className="cart-drawer__body"><CartItems /></div><footer><p className="cart-drawer__delivery-note">Chọn thời gian giao trong giỏ hàng</p><DeliveryProgress subtotal={subtotal} /><div className="cart-drawer__subtotal"><span>Tạm tính</span><strong>{formatCurrency(subtotal)}</strong></div><Link className="button button--primary" to="/cart" onClick={closeCart}>Xem giỏ hàng</Link></footer></> : <div className="cart-drawer__empty"><p>Giỏ hàng của bạn đang trống.</p><Link className="button button--secondary" to="/shop" onClick={closeCart}>Khám phá bộ sưu tập</Link></div>}
    </aside>
  </div>
}
export default CartDrawer
