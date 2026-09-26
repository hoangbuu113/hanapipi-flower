import { Link } from 'react-router-dom'
import { useRef, useState } from 'react'
import Container from '../components/Container'
import CheckoutSummary from '../components/CheckoutSummary'
import { STORE_CONTACT } from '../config/storeContact.js'
import { useCommerce } from '../context/commerceStore'
import { buildConsultationPayload, createConsultation, getConsultationAttempt } from '../services/consultationClient.js'
import { formatCurrency } from '../utils/formatCurrency.js'
import './CheckoutPage.css'

function CheckoutPage() {
  const { cartItems, cartError, isCartLoading, retryCart } = useCommerce()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [received, setReceived] = useState(null)
  const attemptRef = useRef(null)
  const submittingRef = useRef(false)
  const payload = buildConsultationPayload(cartItems)
  const fingerprint = JSON.stringify(payload)
  const currentReceived = received?.fingerprint === fingerprint ? received.consultation : null

  async function handleConsultation() {
    if (submittingRef.current) return
    submittingRef.current = true
    setIsSubmitting(true)
    setSubmitError('')
    try {
      if (attemptRef.current?.fingerprint !== fingerprint) {
        attemptRef.current = { fingerprint, key: await getConsultationAttempt(payload) }
      }
      const result = await createConsultation(payload, { idempotencyKey: attemptRef.current.key })
      if (result.ok) setReceived({ fingerprint, consultation: result.consultation })
      else setSubmitError(result.error)
    } catch { setSubmitError('Chưa thể gửi yêu cầu. Giỏ hoa vẫn được giữ lại. Vui lòng thử lại.') }
    finally { submittingRef.current = false; setIsSubmitting(false) }
  }

  return (
    <main className="checkout-page selection-page">
      <Container>
        <header className="checkout-page__intro">
          <p className="eyebrow">Những lựa chọn của bạn</p>
          <h1>Tóm tắt lựa chọn</h1>
          <p>Xem lại bó hoa và những chi tiết bạn đã chọn trước khi liên hệ tư vấn.</p>
        </header>
        {isCartLoading && !cartItems.length ? (
          <p role="status">Đang chuẩn bị thông tin lựa chọn...</p>
        ) : cartError && !cartItems.length ? (
          <div role="alert" className="selection-page__feedback">
            <p>Chưa thể tải thông tin giỏ hoa. Lựa chọn của bạn vẫn được giữ lại.</p>
            <button className="button button--secondary" onClick={retryCart} type="button">Thử lại</button>
          </div>
        ) : !cartItems.length ? (
          <div className="selection-page__feedback">
            <h2>Chưa có bó hoa nào trong lựa chọn.</h2>
            <Link className="button button--secondary" to="/shop">Khám phá bộ sưu tập</Link>
          </div>
        ) : (
          <div className="selection-page__layout">
            <section aria-label="Thông tin lựa chọn">
              {isCartLoading && <p role="status">Đang cập nhật giá tham khảo...</p>}
              {cartError && <div className="selection-page__feedback" role="alert"><p>Chưa thể cập nhật giá tham khảo. Lựa chọn của bạn vẫn được giữ lại.</p><button className="button button--text" onClick={retryCart} type="button">Thử lại</button></div>}
              <CheckoutSummary cartItems={cartItems} pricesReady={!isCartLoading && !cartError} />
              <Link className="button button--text" to="/cart">Chỉnh sửa giỏ hoa</Link>
            </section>
            <aside className="selection-contact" aria-labelledby="selection-contact-title">
              <p className="eyebrow">Trao đổi cùng Hut Flower</p>
              <h2 id="selection-contact-title">Liên hệ tư vấn</h2>
              {currentReceived ? (
                <div className="selection-contact__received" role="status">
                  <p>Hut Flower đã nhận thông tin lựa chọn của bạn.</p>
                  <p>Mã tham chiếu: <strong>{currentReceived.referenceCode}</strong></p>
                  <p>Tổng giá tham khảo: {formatCurrency(currentReceived.referenceTotal)}</p>
                  <p>Khi nhắn Zalo, bạn chỉ cần gửi mã trên để Hut Flower nhận ra lựa chọn này.</p>
                </div>
              ) : (
                <button className="button button--primary" type="button" onClick={handleConsultation}
                  disabled={isSubmitting || isCartLoading || Boolean(cartError) || cartItems.some((item) => item.isAvailable === false)}>
                  {isSubmitting ? 'Đang gửi yêu cầu...' : 'Gửi yêu cầu tư vấn'}
                </button>
              )}
              {submitError && <p role="alert">{submitError}</p>}
              {STORE_CONTACT.zaloQrImage ? (
                <img className="selection-contact__qr" src={STORE_CONTACT.zaloQrImage} alt="Mã QR liên hệ Zalo của Hut Flower" width="180" height="180" loading="lazy" />
              ) : (
                <p className="selection-contact__pending">Mã QR Zalo chưa được cập nhật.</p>
              )}
              <p>Quét mã Zalo để liên hệ</p>
              <a className="button button--secondary" href={STORE_CONTACT.zaloUrl} target="_blank" rel="noopener noreferrer">{currentReceived ? 'Nhắn qua Zalo' : 'Liên hệ qua Zalo'}</a>
              <p>{STORE_CONTACT.phoneDisplay}</p>
              <a className="button button--secondary" href={STORE_CONTACT.phoneTel}>Gọi tư vấn</a>
              <p className="selection-contact__notice">Hut Flower là dự án portfolio/demo. Website không tiếp nhận đơn hàng và không xử lý thanh toán trực tuyến.</p>
            </aside>
          </div>
        )}
      </Container>
    </main>
  )
}

export default CheckoutPage
