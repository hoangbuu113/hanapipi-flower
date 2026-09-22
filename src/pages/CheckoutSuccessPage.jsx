import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import Container from '../components/Container'
import { useAccount } from '../context/accountStore'
import { fetchUserOrderDetail } from '../services/apiClient'
import { formatCurrency } from '../utils/formatCurrency'
import {
  formatDeliveryDate,
  formatOrderStatus,
  formatPaymentStatus,
  getOrderGiftAddOns,
  getOrderGifting,
} from '../utils/order'
import './CheckoutSuccessPage.css'

function CheckoutSuccessPage() {
  const { orderCode } = useParams()
  const { getToken, isLoaded: isAuthLoaded, isSignedIn } = useAuth()
  const { orders, user } = useAccount()

  const contextOrder = orders.find((entry) => entry.code === orderCode || entry.orderCode === orderCode)
  const hasCompleteContextOrder = Boolean(contextOrder?.receiver?.name)

  const [detailOrder, setDetailOrder] = useState(null)
  const [isLoading, setIsLoading] = useState(() => !hasCompleteContextOrder)
  const [fetchError, setFetchError] = useState(null)

  useEffect(() => {
    if (hasCompleteContextOrder || !isAuthLoaded || !isSignedIn) {
      return
    }

    let isCancelled = false
    fetchUserOrderDetail(orderCode, { getToken })
      .then((result) => {
        if (isCancelled) return
        if (result.ok && result.order) {
          setDetailOrder(result.order)
          setFetchError(null)
        } else {
          setFetchError(result.error || { code: 'ORDER_NOT_FOUND', message: 'Không tìm thấy đơn hoa.' })
        }
      })
      .catch(() => {
        if (isCancelled) return
        setFetchError({ code: 'FETCH_FAILED', message: 'Không thể kết nối đến máy chủ.' })
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [orderCode, isAuthLoaded, isSignedIn, getToken, hasCompleteContextOrder])

  const order = detailOrder || (hasCompleteContextOrder ? contextOrder : null)

  if (isLoading) {
    return (
      <main className="success-page">
        <Container>
          <div className="success-page__content">
            <p className="eyebrow">Đang tải thông tin đơn hoa...</p>
            <h1>Vui lòng chờ trong giây lát.</h1>
          </div>
        </Container>
      </main>
    )
  }

  if (!order) {
    return (
      <main className="success-page">
        <Container>
          <p className="eyebrow">Chưa tìm thấy đơn hoa</p>
          <h1>{fetchError?.message || 'Đơn hoa này không tồn tại hoặc bạn chưa đăng nhập.'}</h1>
          <div className="success-page__actions">
            {!isSignedIn && (
              <Link className="button button--primary" to="/login">
                Đăng nhập
              </Link>
            )}
            <Link className="button button--secondary" to="/shop">
              Tiếp tục chọn hoa
            </Link>
          </div>
        </Container>
      </main>
    )
  }

  const gifting = getOrderGifting(order)
  const giftAddOns = getOrderGiftAddOns(order)
  const hasGiftingDetails = giftAddOns.length > 0 || gifting.message || gifting.senderName || gifting.anonymous
  const orderId = order.code || order.orderCode

  return (
    <main className="success-page">
      <Container>
        <div className="success-page__content">
          <p className="eyebrow">Cảm ơn bạn đã chọn Hanapipi Flower</p>
          <h1>Đơn hoa đã được ghi nhận</h1>
          <p className="success-page__code">
            Mã đơn: <strong>{orderId}</strong>
          </p>
          <dl>
            {order.receiver?.name && (
              <div>
                <dt>Người nhận</dt>
                <dd>{order.receiver.name}</dd>
              </div>
            )}
            {(order.delivery?.date || order.deliveryDate) && (
              <div>
                <dt>Giao dự kiến</dt>
                <dd>
                  {formatDeliveryDate(order.delivery?.date || order.deliveryDate)}
                  {(order.delivery?.slot || order.deliverySlot) ? ` · ${order.delivery?.slot || order.deliverySlot}` : ''}
                </dd>
              </div>
            )}
            <div>
              <dt>Tổng tiền</dt>
              <dd>{formatCurrency(order.total ?? order.totalVnd)}</dd>
            </div>
            {order.status && (
              <div>
                <dt>Trạng thái</dt>
                <dd>{formatOrderStatus(order.status)}</dd>
              </div>
            )}
            {order.paymentStatus && (
              <div>
                <dt>Thanh toán</dt>
                <dd>{formatPaymentStatus(order.paymentStatus)}</dd>
              </div>
            )}
          </dl>
          {hasGiftingDetails && (
            <section className="success-page__gifting" aria-labelledby="success-gifting-title">
              <h2 id="success-gifting-title">Điều gửi kèm bó hoa</h2>
              {giftAddOns.length > 0 && (
                <p>
                  <strong>Quà nhỏ:</strong> {giftAddOns.map((addOn) => addOn.name).join(', ')}
                </p>
              )}
              {gifting.message && (
                <p>
                  <strong>Lời nhắn:</strong> “{gifting.message}”
                </p>
              )}
              {(gifting.anonymous || gifting.senderName) && (
                <p>
                  <strong>Người gửi:</strong> {gifting.anonymous ? 'Không ghi tên người gửi' : gifting.senderName}
                </p>
              )}
            </section>
          )}
          <p className="success-page__note">
            Đây là đơn hàng demo. Thời gian giao và phương thức thanh toán sẽ cần được xác nhận trước khi xử lý thực tế.
          </p>
          <div className="success-page__actions">
            <Link className="button button--primary" to="/account">
              Xem đơn hàng
            </Link>
            <Link className="button button--secondary" to="/shop">
              Tiếp tục chọn hoa
            </Link>
            {!user && (
              <Link className="button button--text" to="/register">
                Tạo tài khoản để lưu thông tin
              </Link>
            )}
          </div>
        </div>
      </Container>
    </main>
  )
}

export default CheckoutSuccessPage
