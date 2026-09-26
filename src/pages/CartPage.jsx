import { Link } from 'react-router-dom'
import Container from '../components/Container'
import CartItems, { DeliveryProgress } from '../components/CartItems'
import { useCommerce } from '../context/commerceStore'
import { formatCurrency } from '../utils/formatCurrency'
import DeliverySelector from '../components/DeliverySelector'
import './CartPage.css'

function CartPage() {
  const {
    cartError,
    cartItems,
    cartSubtotal,
    hasUnavailableItems,
    isCartLoading,
    retryCart,
  } = useCommerce()

  const hasItems = cartItems.length > 0
  const subtotal = cartSubtotal

  return (
    <main className="cart-page">
      <Container>
        <header className="cart-page__intro">
          <p className="eyebrow">Những bó hoa bạn đã chọn</p>
          <h1>Giỏ hàng</h1>
        </header>

        {isCartLoading && !hasItems ? (
          <div className="cart-loading" role="status" aria-live="polite">
            <p>Đang chuẩn bị giỏ hàng của bạn...</p>
          </div>
        ) : cartError && !hasItems ? (
          <div className="cart-error" role="alert">
            <p>Không thể tải thông tin giỏ hàng.</p>
            <span className="cart-error-message">
              {cartError.message || 'Đã có lỗi xảy ra khi tải giỏ hàng.'}
            </span>
            <button className="button button--secondary" type="button" onClick={retryCart}>
              Thử lại
            </button>
          </div>
        ) : hasItems ? (
          <div className="cart-page__layout">
            <section aria-labelledby="cart-items-title">
              <h2 className="sr-only" id="cart-items-title">Các bó hoa trong giỏ hàng</h2>
              <CartItems />
              <DeliverySelector />
            </section>
            <aside className="cart-page__summary">
              <h2>Tóm tắt đơn hoa</h2>
              <DeliveryProgress subtotal={subtotal} />
              <div>
                <span>Tạm tính</span>
                <strong>{formatCurrency(subtotal)}</strong>
              </div>
              {hasUnavailableItems && (
                <p className="cart-page__unavailable-warning" role="alert">
                  Giỏ hàng có sản phẩm không còn mở bán hoặc không khả dụng. Vui lòng cập nhật trước khi xem tóm tắt.
                </p>
              )}
              <div className="cart-page__summary-actions">
                {hasUnavailableItems ? (
                  <button
                    className="button button--primary button--disabled"
                    disabled
                    type="button"
                    aria-disabled="true"
                  >
                    Cần cập nhật giỏ hàng
                  </button>
                ) : (
                  <Link className="button button--primary" to="/checkout">
                    Xem tóm tắt lựa chọn
                  </Link>
                )}
                <Link className="button button--secondary" to="/shop">
                  Tiếp tục chọn hoa
                </Link>
              </div>
            </aside>
          </div>
        ) : (
          <div className="cart-page__empty">
            <h2>Giỏ hàng của bạn đang trống.</h2>
            <p>Hãy chọn một bó hoa thật vừa vặn cho dịp sắp tới.</p>
            <Link className="button button--secondary" to="/shop">
              Khám phá bộ sưu tập
            </Link>
          </div>
        )}
      </Container>
    </main>
  )
}

export default CartPage
