import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import Container from '../components/Container'
import CheckoutSummary from '../components/CheckoutSummary'
import DeliverySelector from '../components/DeliverySelector'
import { useAccount } from '../context/accountStore'
import { useCommerce } from '../context/commerceStore'
import { createOrder } from '../services/apiClient'
import { cartHasGiftAddOn, cartSubtotal } from '../utils/cart'
import { isDeliveryDateAvailable } from '../utils/delivery'
import './CheckoutPage.css'

const initialForm = { buyerName: '', buyerPhone: '', email: '', receiverIsBuyer: false, receiverName: '', receiverPhone: '', city: '', district: '', ward: '', address: '', message: '', cardSenderName: '', anonymousSender: false, payment: 'cod' }

function CheckoutPage() {
  const { addOrder, user } = useAccount()
  const { cartItems, clearCart, deliveryDraft, hasUnavailableItems } = useCommerce()
  const { getToken, isSignedIn } = useAuth()
  const [form, setForm] = useState(() => ({ ...initialForm, buyerName: user?.name ?? '', buyerPhone: user?.phone ?? '', email: user?.email ?? '' }))
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const navigate = useNavigate()
  const subtotal = cartSubtotal(cartItems)
  const includesHandwrittenCard = cartHasGiftAddOn(cartItems, 'handwritten-card')
  const giftingPreview = {
    anonymous: form.anonymousSender,
    message: form.message.trim(),
    senderName: form.anonymousSender ? '' : form.cardSenderName.trim(),
  }

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: '' }))
    setSubmitError(null)
  }
  function validate() {
    const next = {}
    const phonePattern = /^(0\d{9}|\+84\d{9})$/
    if (!form.buyerName.trim()) next.buyerName = 'Vui lòng nhập họ và tên người đặt.'
    if (!phonePattern.test(form.buyerPhone.replace(/\s/g, ''))) next.buyerPhone = 'Vui lòng nhập số điện thoại Việt Nam hợp lệ.'
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) next.email = 'Vui lòng kiểm tra lại địa chỉ email.'
    if (!form.receiverIsBuyer && !form.receiverName.trim()) next.receiverName = 'Vui lòng nhập tên người nhận.'
    if (!form.receiverIsBuyer && !phonePattern.test(form.receiverPhone.replace(/\s/g, ''))) next.receiverPhone = 'Vui lòng nhập số điện thoại người nhận hợp lệ.'
    if (!form.city) next.city = 'Vui lòng chọn tỉnh hoặc thành phố.'
    if (!form.district) next.district = 'Vui lòng chọn quận hoặc huyện.'
    if (!form.ward) next.ward = 'Vui lòng chọn phường hoặc xã.'
    if (!form.address.trim()) next.address = 'Vui lòng nhập địa chỉ giao hoa cụ thể.'
    if (!deliveryDraft.date || !deliveryDraft.slot) next.delivery = 'Vui lòng chọn ngày và khung giờ giao hoa.'
    else if (!isDeliveryDateAvailable(deliveryDraft.date)) next.delivery = 'Ngày giao đã qua thời hạn nhận đơn. Vui lòng chọn ngày khác.'
    setErrors(next)
    return Object.keys(next).length === 0
  }
  async function submit(event) {
    event.preventDefault()
    if (isSubmitting) return
    setSubmitError(null)
    if (!validate()) return

    if (hasUnavailableItems) {
      setSubmitError('Giỏ hoa có sản phẩm không còn khả dụng. Vui lòng quay lại giỏ hàng để cập nhật.')
      return
    }

    if (!isSignedIn) {
      setSubmitError('Vui lòng đăng nhập để hoàn tất đặt hoa.')
      return
    }

    const receiver = form.receiverIsBuyer
      ? { name: form.buyerName.trim(), phone: form.buyerPhone.trim() }
      : { name: form.receiverName.trim(), phone: form.receiverPhone.trim() }

    const payload = {
      address: {
        city: form.city,
        detail: form.address.trim(),
        district: form.district,
        ward: form.ward,
      },
      buyer: {
        email: form.email.trim(),
        name: form.buyerName.trim(),
        phone: form.buyerPhone.trim(),
      },
      recipient: receiver,
      delivery: {
        date: deliveryDraft.date,
        slot: deliveryDraft.slot,
      },
      gifting: {
        anonymous: Boolean(form.anonymousSender),
        message: form.message.trim(),
        senderName: form.anonymousSender ? '' : form.cardSenderName.trim(),
      },
      items: cartItems.map((item) => ({
        giftAddOnIds: (item.giftAddOns || [])
          .filter((g) => g.active !== false)
          .map((g) => (typeof g === 'string' ? g : g.id)),
        productId: item.productId || item.product?.id || item.slug || item.product?.slug || item.id,
        quantity: item.quantity,
        sizeId: item.sizeId || item.size?.id || item.size?.code,
        wrappingId: item.wrappingId || item.wrapping?.id || item.wrapping?.code || null,
      })),
      paymentMethod: form.payment === 'cod' ? 'cod_mock' : 'bank_transfer_mock',
    }

    setIsSubmitting(true)
    try {
      const result = await createOrder({ getToken, order: payload })
      if (!result.ok) {
        if (result.error?.fieldErrors) {
          setErrors((current) => ({ ...current, ...result.error.fieldErrors }))
        }
        setSubmitError(result.error?.message || 'Không thể tạo đơn hoa. Vui lòng thử lại.')
        return
      }

      addOrder(result.order)
      clearCart()
      navigate(`/checkout/success/${result.order.code || result.order.orderCode}`)
    } catch {
      setSubmitError('Đã xảy ra lỗi khi gửi thông tin đơn hoa. Vui lòng thử lại.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!cartItems.length) return <main className="checkout-empty"><Container><p className="eyebrow">Giỏ hoa đang chờ bạn</p><h1>Chưa có bó hoa nào để thanh toán.</h1><p>Hãy quay lại giỏ hàng hoặc chọn một thiết kế thật vừa vặn.</p><Link className="button button--secondary" to="/cart">Quay lại giỏ hàng</Link></Container></main>

  return <main className="checkout-page"><Container><header className="checkout-page__intro"><p className="eyebrow">Gửi hoa thật chỉn chu</p><h1>Thông tin giao hoa và thanh toán</h1></header><div className="checkout-page__layout"><form className="checkout-form" noValidate onSubmit={submit}>
    <FormSection title="Thông tin người đặt"><Field error={errors.buyerName} label="Họ và tên" required><input autoComplete="name" value={form.buyerName} onChange={(event) => update('buyerName', event.target.value)} /></Field><div className="checkout-fields"><Field error={errors.buyerPhone} label="Số điện thoại" required><input autoComplete="tel" inputMode="tel" placeholder="090 123 4567" value={form.buyerPhone} onChange={(event) => update('buyerPhone', event.target.value)} /></Field><Field error={errors.email} label="Email"><input autoComplete="email" type="email" value={form.email} onChange={(event) => update('email', event.target.value)} /></Field></div></FormSection>
    <FormSection title="Thông tin người nhận"><label className="checkout-checkbox"><input checked={form.receiverIsBuyer} type="checkbox" onChange={(event) => update('receiverIsBuyer', event.target.checked)} /> Người nhận là tôi</label>{!form.receiverIsBuyer && <div className="checkout-fields"><Field error={errors.receiverName} label="Họ và tên" required><input value={form.receiverName} onChange={(event) => update('receiverName', event.target.value)} /></Field><Field error={errors.receiverPhone} label="Số điện thoại" required><input inputMode="tel" value={form.receiverPhone} onChange={(event) => update('receiverPhone', event.target.value)} /></Field></div>}</FormSection>
    <FormSection title="Địa chỉ giao hoa"><div className="checkout-fields checkout-fields--three"><Field error={errors.city} label="Tỉnh / thành phố" required><select value={form.city} onChange={(event) => update('city', event.target.value)}><option value="">Chọn khu vực</option><option>TP. Hồ Chí Minh</option><option>Hà Nội</option><option>Đà Nẵng</option></select></Field><Field error={errors.district} label="Quận / huyện" required><select value={form.district} onChange={(event) => update('district', event.target.value)}><option value="">Chọn quận / huyện</option><option>Quận 1</option><option>Quận 3</option><option>Quận Bình Thạnh</option><option>Quận Cầu Giấy</option><option>Quận Hải Châu</option></select></Field><Field error={errors.ward} label="Phường / xã" required><select value={form.ward} onChange={(event) => update('ward', event.target.value)}><option value="">Chọn phường / xã</option><option>Phường Bến Nghé</option><option>Phường Võ Thị Sáu</option><option>Phường 25</option><option>Phường Dịch Vọng</option><option>Phường Thạch Thang</option></select></Field></div><Field error={errors.address} label="Địa chỉ cụ thể" required><input placeholder="Ví dụ: 18 Nguyễn Huệ, tòa nhà A" value={form.address} onChange={(event) => update('address', event.target.value)} /></Field></FormSection>
    <FormSection title="Thời gian giao hoa"><DeliverySelector />{errors.delivery && <p className="checkout-error">{errors.delivery}</p>}</FormSection>
    <FormSection title="Lời nhắn tặng hoa">
      {includesHandwrittenCard && <p className="checkout-gifting-note">Đơn hoa có Thiệp viết tay. Lời nhắn dưới đây sẽ được chuẩn bị trên thiệp.</p>}
      <Field label="Lời nhắn cho người nhận"><textarea maxLength="200" placeholder="Một lời nhắn ngắn dành cho người nhận" value={form.message} onChange={(event) => update('message', event.target.value)} /><small>{form.message.length}/200</small></Field>
      <Field label="Tên người gửi trên thiệp (không bắt buộc)"><input disabled={form.anonymousSender} maxLength="60" placeholder="Ví dụ: Minh Anh" value={form.cardSenderName} onChange={(event) => update('cardSenderName', event.target.value)} /></Field>
      <label className="checkout-checkbox"><input checked={form.anonymousSender} type="checkbox" onChange={(event) => update('anonymousSender', event.target.checked)} /> Không ghi tên người gửi</label>
      <p className="checkout-gifting-reassurance">Đơn giao đến người nhận không kèm hóa đơn hoặc thông tin giá.</p>
    </FormSection>
    <FormSection title="Phương thức thanh toán"><div className="checkout-payment"><label><input checked={form.payment === 'cod'} name="payment" type="radio" onChange={() => update('payment', 'cod')} /> Thanh toán khi nhận hoa</label><label><input checked={form.payment === 'bank'} name="payment" type="radio" onChange={() => update('payment', 'bank')} /> Chuyển khoản ngân hàng</label></div><p className="checkout-demo-note">Đây là bản demo, chưa phát sinh thanh toán.</p></FormSection>
    {submitError && (
      <p className="checkout-error checkout-submit-error" role="alert">
        {submitError}
        {!isSignedIn && (
          <> <Link to="/login" style={{ textDecoration: 'underline' }}>Đăng nhập ngay</Link></>
        )}
      </p>
    )}
    <button className="button button--primary checkout-submit" disabled={isSubmitting} type="submit">
      {isSubmitting ? 'Đang gửi thông tin...' : 'Đặt hoa'}
    </button>
  </form><CheckoutSummary cartItems={cartItems} deliveryDraft={deliveryDraft} gifting={giftingPreview} subtotal={subtotal} /></div></Container></main>
}

function FormSection({ children, title }) { return <fieldset className="checkout-section"><legend>{title}</legend>{children}</fieldset> }
function Field({ children, error, label, required }) { return <label className="checkout-field"><span>{label}{required && ' *'}</span>{children}{error && <em>{error}</em>}</label> }
export default CheckoutPage
