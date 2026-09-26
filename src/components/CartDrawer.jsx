import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCommerce } from '../context/commerceStore'
import { usePublicCommerce } from '../context/publicCommerceStore.js'
import CartItems, { DeliveryProgress } from './CartItems'
import { formatCurrency } from '../utils/formatCurrency'
import { trapDialogFocus } from '../utils/focus'
import './CartDrawer.css'

function CartDrawer() {
  const { mode } = usePublicCommerce()
  const {
    cartError,
    cartItems,
    cartSubtotal,
    closeCart,
    hasUnavailableItems,
    isCartLoading,
    isCartOpen,
    retryCart,
  } = useCommerce()
  const closeButtonRef = useRef(null)
  const closeTimerRef = useRef(null)
  const drawerPanelRef = useRef(null)
  const previousFocusRef = useRef(null)
  const requestCloseRef = useRef(null)
  const [isClosing, setIsClosing] = useState(false)
  const subtotal = cartSubtotal
  const hasItems = cartItems.length > 0

  function requestClose() {
    if (isClosing) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) {
      closeCart()
      return
    }

    setIsClosing(true)
    closeTimerRef.current = window.setTimeout(() => {
      setIsClosing(false)
      closeCart()
    }, 320)
  }

  useEffect(() => {
    requestCloseRef.current = requestClose
  })

  useEffect(() => () => window.clearTimeout(closeTimerRef.current), [])

  useEffect(() => {
    if (!isCartOpen) return undefined

    previousFocusRef.current = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus())
    const handleKeydown = (event) => {
      if (event.key === 'Escape') requestCloseRef.current()
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

  return (
    <div
      className={`cart-drawer ${isClosing ? 'is-closing' : 'is-open'}`}
      role="dialog"
      aria-modal="true"
      aria-label="Giỏ hàng của bạn"
    >
      <button
        aria-label="Đóng giỏ hàng"
        className="cart-drawer__backdrop"
        type="button"
        onClick={requestClose}
      />
      <aside ref={drawerPanelRef} className="cart-drawer__panel">
        <header>
          <h2>Giỏ hàng</h2>
          <button
            ref={closeButtonRef}
            aria-label="Đóng giỏ hàng"
            type="button"
            onClick={requestClose}
          >
            <X aria-hidden="true" />
          </button>
        </header>

        {isCartLoading && !hasItems ? (
          <div className="cart-drawer__loading" role="status" aria-live="polite">
            <p>Đang chuẩn bị giỏ hàng...</p>
          </div>
        ) : cartError && !hasItems ? (
          <div className="cart-drawer__error" role="alert">
            <p>Không thể tải giỏ hàng.</p>
            <button className="button button--secondary" type="button" onClick={retryCart}>
              Thử lại
            </button>
          </div>
        ) : hasItems ? (
          <>
            <div className="cart-drawer__body">
              <CartItems />
            </div>
            <footer>
              <p className="cart-drawer__delivery-note">{mode === 'checkout' ? 'Chọn thời gian giao trong giỏ hàng' : 'Xem lại lựa chọn và gửi yêu cầu tư vấn'}</p>
              <DeliveryProgress subtotal={subtotal} />
              <div className="cart-drawer__subtotal">
                <span>Tạm tính</span>
                <strong>{formatCurrency(subtotal)}</strong>
              </div>
              {hasUnavailableItems && (
                <p className="cart-drawer__unavailable-note" role="alert">
                  Có sản phẩm không khả dụng trong giỏ hàng.
                </p>
              )}
              <Link className="button button--primary" to="/cart" onClick={requestClose}>
                Xem giỏ hàng
              </Link>
            </footer>
          </>
        ) : (
          <div className="cart-drawer__empty">
            <p>Giỏ hàng của bạn đang trống.</p>
            <Link className="button button--secondary" to="/shop" onClick={requestClose}>
              Khám phá bộ sưu tập
            </Link>
          </div>
        )}
      </aside>
    </div>
  )
}

export default CartDrawer
