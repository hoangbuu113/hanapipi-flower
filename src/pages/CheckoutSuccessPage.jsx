import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import qrcode from 'qrcode-generator'
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

function QrCodeSvg({ payload, size = 180 }) {
  const svg = useMemo(() => {
    if (!payload) return null
    try {
      const qr = qrcode(0, 'M')
      qr.addData(payload)
      qr.make()
      return qr.createSvgTag({ scalable: true })
    } catch {
      return null
    }
  }, [payload])

  if (!svg) return null
  return (
    <div
      className="bank-transfer__qr-code"
      dangerouslySetInnerHTML={{ __html: svg }}
      role="img"
      aria-label="Mã VietQR thanh toán chuyển khoản"
      style={{ height: size, width: size }}
    />
  )
}

function CopyButton({ label = 'Sao chép', text }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    if (!text) return
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const textArea = document.createElement('textarea')
        textArea.value = text
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Ignore clipboard write errors
    }
  }

  return (
    <button
      className={`button button--text bank-transfer__copy ${copied ? 'is-copied' : ''}`}
      title={copied ? 'Đã sao chép' : `Sao chép ${text}`}
      type="button"
      onClick={handleCopy}
    >
      {copied ? 'Đã sao chép' : label}
    </button>
  )
}

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

  const isMomo = order.paymentMethod === 'momo'
    || order.payment?.method === 'momo'
  const isBankTransfer = order.paymentMethod === 'bank_transfer'
    || order.paymentMethod === 'bank_transfer_mock'
    || order.payment?.method === 'bank_transfer'
    || order.payment?.method === 'bank_transfer_mock'
  const isPaymentPending = order.paymentStatus === 'pending'
    || order.paymentStatus === 'mock_pending'
    || order.payment?.status === 'pending'
    || order.payment?.status === 'mock_pending'

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

          {isMomo && isPaymentPending && (
            <section className="bank-transfer-box momo-payment-box" aria-labelledby="momo-payment-title">
              <div className="bank-transfer-box__header">
                <h2 id="momo-payment-title">Thanh toán qua Ví MoMo</h2>
                <span className="bank-transfer-badge">Chờ thanh toán</span>
              </div>

              {order.payment?.momo?.available ? (
                <div className="bank-transfer-box__grid">
                  <div className="bank-transfer-box__qr">
                    <img
                      alt="Mã QR Ví MoMo"
                      className="momo-payment-qr-img"
                      src={order.payment.momo.qrUrl}
                      style={{ width: 180, height: 180, objectFit: 'contain', borderRadius: 8 }}
                    />
                    <p className="bank-transfer-box__qr-hint">Quét mã bằng ứng dụng MoMo để thanh toán</p>
                  </div>
                  <div className="bank-transfer-box__details">
                    <dl className="bank-transfer-details">
                      <div>
                        <dt>Chủ tài khoản</dt>
                        <dd><strong>{order.payment.momo.accountName}</strong></dd>
                      </div>
                      <div>
                        <dt>Số điện thoại</dt>
                        <dd className="bank-transfer-copyable">
                          <code>{order.payment.momo.phoneNumber}</code>
                          <CopyButton text={order.payment.momo.phoneNumber} />
                        </dd>
                      </div>
                      <div>
                        <dt>Số tiền</dt>
                        <dd className="bank-transfer-copyable">
                          <strong>{formatCurrency(order.payment.momo.amountVnd)}</strong>
                          <CopyButton label="Sao chép số tiền" text={String(order.payment.momo.amountVnd)} />
                        </dd>
                      </div>
                      <div>
                        <dt>Lời nhắn chuyển tiền</dt>
                        <dd className="bank-transfer-copyable">
                          <code>{order.payment.momo.transferContent}</code>
                          <CopyButton text={order.payment.momo.transferContent} />
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              ) : (
                <div className="bank-transfer-box__unavailable">
                  <p>{order.payment?.momo?.message || 'Thông tin thanh toán MoMo hiện chưa được cấu hình. Vui lòng liên hệ Hanapipi Flower để được hỗ trợ.'}</p>
                </div>
              )}

              <div className="bank-transfer-box__reassurance">
                <p>❀ Đơn hoa sẽ được xử lý sau khi Hanapipi Flower xác nhận nhận được thanh toán.</p>
                <p>❀ Vui lòng chuyển chính xác số tiền và lời nhắn để đơn được xác nhận nhanh nhất.</p>
              </div>
            </section>
          )}

          {isBankTransfer && isPaymentPending && (
            <section className="bank-transfer-box" aria-labelledby="bank-transfer-title">
              <div className="bank-transfer-box__header">
                <h2 id="bank-transfer-title">Thông tin thanh toán chuyển khoản</h2>
                <span className="bank-transfer-badge">Chờ thanh toán</span>
              </div>

              {order.payment?.bank?.available ? (
                <div className="bank-transfer-box__grid">
                  <div className="bank-transfer-box__qr">
                    <QrCodeSvg payload={order.payment.bank.qrPayload} size={180} />
                    <p className="bank-transfer-box__qr-hint">Quét mã bằng ứng dụng ngân hàng bất kỳ</p>
                  </div>
                  <div className="bank-transfer-box__details">
                    <dl className="bank-transfer-details">
                      <div>
                        <dt>Ngân hàng</dt>
                        <dd>
                          <strong>{order.payment.bank.bankName}</strong>
                          {order.payment.bank.bankCode ? ` (${order.payment.bank.bankCode})` : ''}
                        </dd>
                      </div>
                      <div>
                        <dt>Chủ tài khoản</dt>
                        <dd><strong>{order.payment.bank.accountName}</strong></dd>
                      </div>
                      <div>
                        <dt>Số tài khoản</dt>
                        <dd className="bank-transfer-copyable">
                          <code>{order.payment.bank.accountNumber}</code>
                          <CopyButton text={order.payment.bank.accountNumber} />
                        </dd>
                      </div>
                      <div>
                        <dt>Số tiền</dt>
                        <dd className="bank-transfer-copyable">
                          <strong>{formatCurrency(order.payment.bank.amountVnd)}</strong>
                          <CopyButton label="Sao chép số tiền" text={String(order.payment.bank.amountVnd)} />
                        </dd>
                      </div>
                      <div>
                        <dt>Nội dung chuyển khoản</dt>
                        <dd className="bank-transfer-copyable">
                          <code>{order.payment.bank.transferContent}</code>
                          <CopyButton text={order.payment.bank.transferContent} />
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              ) : (
                <div className="bank-transfer-box__unavailable">
                  <p>{order.payment?.bank?.message || 'Thông tin chuyển khoản hiện chưa được cấu hình. Vui lòng liên hệ Hanapipi Flower để được hỗ trợ.'}</p>
                </div>
              )}

              <div className="bank-transfer-box__reassurance">
                <p>❀ Đơn hoa sẽ được xử lý sau khi Hanapipi Flower xác nhận nhận được chuyển khoản.</p>
                <p>❀ Vui lòng giữ nguyên nội dung chuyển khoản để đơn được xác nhận nhanh nhất.</p>
              </div>
            </section>
          )}

          {(isBankTransfer || isMomo) && !isPaymentPending && (order.paymentStatus === 'paid' || order.payment?.status === 'paid') && (
            <section className="bank-transfer-box bank-transfer-box--paid" aria-labelledby="bank-transfer-paid-title">
              <div className="bank-transfer-box__header">
                <h2 id="bank-transfer-paid-title">Thông tin thanh toán</h2>
                <span className="bank-transfer-badge bank-transfer-badge--paid">Đã thanh toán</span>
              </div>
              <div className="bank-transfer-box__confirmed">
                <p className="bank-transfer-box__confirmed-msg">❀ Hanapipi đã xác nhận thanh toán</p>
                <p className="bank-transfer-box__confirmed-sub">Đơn hoa của bạn đang được chuẩn bị và xử lý theo lịch giao.</p>
              </div>
            </section>
          )}

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
            Thời gian giao và phương thức thanh toán sẽ được xác nhận trước khi xử lý thực tế.
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
