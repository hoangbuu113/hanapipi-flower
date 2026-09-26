import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import Container from '../components/Container'
import CheckoutSummary from '../components/CheckoutSummary'
import DeliverySelector from '../components/DeliverySelector'
import AdministrativeUnitSelector from '../components/AdministrativeUnitSelector'
import { HCMC_CITY, getHcmcAdministrativeUnit } from '../data/hcmcAdministrativeUnits.js'
import { useAccount } from '../context/accountStore'
import { useCommerce } from '../context/commerceStore'
import { createOrder } from '../services/apiClient'
import { cartHasGiftAddOn, cartSubtotal } from '../utils/cart'
import { isDeliveryDateAvailable } from '../utils/delivery'
import { validateHcmcDeliveryAddress } from '../utils/hcmcDelivery.js'
import { getCheckoutSavedAddressFields } from '../utils/savedAddress.js'
import { saveGuestOrderAccess } from '../utils/guestOrderAccess.js'
import { clearCheckoutAttempt, getCheckoutAttempt } from '../utils/checkoutAttempt.js'
import { getCartScope } from '../utils/cartIdentity.js'
import './CheckoutPage.css'

const initialForm = { buyerName: '', buyerPhone: '', email: '', receiverIsBuyer: false, receiverName: '', receiverPhone: '', city: HCMC_CITY, district: '', ward: '', unitCode: '', address: '', deliveryNote: '', message: '', cardSenderName: '', anonymousSender: false }

function CheckoutPage() {
  const { addAddress, addOrder, savedAddresses, user } = useAccount()
  const { cartItems, clearCart, deliveryDraft, hasUnavailableItems } = useCommerce()
  const { getToken, isLoaded: isAuthLoaded, isSignedIn, userId } = useAuth()
  const checkoutScope = getCartScope({ isLoaded: isAuthLoaded, isSignedIn, userId })
  const activeScopeRef = useRef(checkoutScope)
  const submittingRef = useRef(false)
  useLayoutEffect(() => {
    activeScopeRef.current = checkoutScope
    return () => { activeScopeRef.current = null }
  }, [checkoutScope])
  const [form, setForm] = useState(() => ({ ...initialForm, buyerName: user?.name ?? '', buyerPhone: user?.phone ?? '', email: user?.email ?? '' }))
  const [selectedAddressId, setSelectedAddressId] = useState(null)
  const [saveForLater, setSaveForLater] = useState(false)
  const [isManualAddress, setIsManualAddress] = useState(false)
  const [newAddressLabel, setNewAddressLabel] = useState('')
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const accountSubjectRef = useRef(user?.clerkId ?? null)
  const navigate = useNavigate()
  const subtotal = cartSubtotal(cartItems)
  const includesHandwrittenCard = cartHasGiftAddOn(cartItems, 'handwritten-card')
  const giftingPreview = {
    anonymous: form.anonymousSender,
    message: form.message.trim(),
    senderName: form.anonymousSender ? '' : form.cardSenderName.trim(),
  }

  useEffect(() => {
    const subject = user?.clerkId ?? null
    if (subject === accountSubjectRef.current) return
    accountSubjectRef.current = subject
    // A checkout kept open across logout/account switch must not retain another user's address.
    // oxlint-disable-next-line react/set-state-in-effect
    setSelectedAddressId(null)
    // oxlint-disable-next-line react/set-state-in-effect
    setSaveForLater(false)
    // oxlint-disable-next-line react/set-state-in-effect
    setIsManualAddress(false)
    // oxlint-disable-next-line react/set-state-in-effect
    setForm({ ...initialForm, buyerName: user?.name ?? '', buyerPhone: user?.phone ?? '', email: user?.email ?? '' })
  }, [user])

  useEffect(() => {
    if (isSignedIn && savedAddresses && savedAddresses.length > 0 && selectedAddressId === null) {
      const defaultAddr = savedAddresses.find((a) => a.isDefault) || savedAddresses[0]
      if (defaultAddr) {
        // oxlint-disable-next-line react/set-state-in-effect
        setSelectedAddressId(defaultAddr.id)
        // oxlint-disable-next-line react/set-state-in-effect
        setForm((current) => ({ ...current, ...getCheckoutSavedAddressFields(defaultAddr) }))
      }
    }
  }, [isSignedIn, savedAddresses, selectedAddressId])

  function handleSelectSavedAddress(id) {
    setSelectedAddressId(id)
    if (id === 'new') {
      setSaveForLater(false)
      setIsManualAddress(true)
      setForm((current) => ({ ...current, address: '', city: HCMC_CITY, district: '', ward: '', unitCode: '', deliveryNote: '' }))
      return
    }
    const chosen = savedAddresses.find((a) => a.id === id)
    if (chosen) {
      setSaveForLater(false)
      setIsManualAddress(false)
      setForm((current) => ({ ...current, ...getCheckoutSavedAddressFields(chosen) }))
      setErrors({})
    }
  }

  function update(key, value) {
    setForm((current) => key === 'unitCode'
      ? { ...current, unitCode: value, ward: getHcmcAdministrativeUnit(value)?.name || '', district: '' }
      : { ...current, [key]: value })
    if (['address', 'unitCode', 'ward', 'deliveryNote', 'receiverName', 'receiverPhone'].includes(key) && selectedAddressId && selectedAddressId !== 'new') {
      setIsManualAddress(true)
    }
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
    if (!form.unitCode && selectedAddressId && selectedAddressId !== 'new' && form.ward) {
      if (form.city !== HCMC_CITY) next.city = 'Hanapipi hiện chỉ giao hoa tại TP. Hồ Chí Minh.'
      if (!form.address.trim()) next.address = 'Vui lòng nhập địa chỉ giao hoa cụ thể.'
    } else {
      const location = validateHcmcDeliveryAddress({ city: form.city, detail: form.address, unitCode: form.unitCode, ward: form.unitCode ? undefined : form.ward })
      if (location.errors.city) next.city = location.errors.city
      if (location.errors.unitCode) next.unitCode = location.errors.unitCode
      if (location.errors.detail) next.address = location.errors.detail
    }
    if (!deliveryDraft.date || !deliveryDraft.slot) next.delivery = 'Vui lòng chọn ngày và khung giờ giao hoa.'
    else if (!isDeliveryDateAvailable(deliveryDraft.date)) next.delivery = 'Ngày giao đã qua thời hạn nhận đơn. Vui lòng chọn ngày khác.'
    setErrors(next)
    return Object.keys(next).length === 0
  }
  async function submit(event) {
    event.preventDefault()
    if (submittingRef.current) return
    setSubmitError(null)
    if (!validate()) return

    if (hasUnavailableItems) {
      setSubmitError('Giỏ hoa có sản phẩm không còn khả dụng. Vui lòng quay lại giỏ hàng để cập nhật.')
      return
    }

    if (!isAuthLoaded) {
      setSubmitError('Đang kiểm tra phiên làm việc. Vui lòng thử lại trong giây lát.')
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
        unitCode: form.unitCode || undefined,
        ward: form.ward,
        deliveryNote: form.deliveryNote.trim(),
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
      paymentMethod: 'momo',
      savedAddressId: selectedAddressId && selectedAddressId !== 'new' ? selectedAddressId : undefined,
    }

    setIsSubmitting(true)
    submittingRef.current = true
    try {
      const idempotencyKey = await getCheckoutAttempt({ scope: checkoutScope, order: payload })
      const result = await createOrder({ getToken, idempotencyKey, order: payload, requireAuth: Boolean(isSignedIn) })
      if (activeScopeRef.current !== checkoutScope) return
      if (!result.ok) {
        if (result.error?.fieldErrors) {
          setErrors((current) => ({ ...current, ...result.error.fieldErrors, unitCode: result.error.fieldErrors.unitCode || result.error.fieldErrors['address.unitCode'] || current.unitCode, address: result.error.fieldErrors.detail || result.error.fieldErrors['address.detail'] || current.address }))
        }
        setSubmitError(result.error?.message || 'Không thể tạo đơn hoa. Vui lòng thử lại.')
        return
      }

      if (!isSignedIn && !result.guestAccessToken) {
        setSubmitError('Đơn hoa đã được ghi nhận nhưng chưa thể mở trang thanh toán. Vui lòng liên hệ Hanapipi Flower và giữ nguyên giỏ hàng.')
        return
      }

      if (isSignedIn) addOrder(result.order)
      else if (!saveGuestOrderAccess(result.order.code || result.order.orderCode, result.guestAccessToken)) {
        setSubmitError('Chưa thể lưu quyền xem đơn hoa trong phiên này. Giỏ hoa vẫn được giữ nguyên; vui lòng thử lại hoặc liên hệ Hanapipi.')
        return
      }
      clearCart()
      clearCheckoutAttempt(checkoutScope, idempotencyKey)

      let addressSaveFailed = false
      if (saveForLater && isSignedIn) {
        try {
          const saved = await addAddress({
            city: form.city,
            deliveryNote: form.deliveryNote.trim(),
            detail: form.address.trim(),
            district: form.district,
            unitCode: form.unitCode,
            label: newAddressLabel.trim() || 'Địa chỉ mới',
            recipientName: receiver.name,
            recipientPhone: receiver.phone,
          })
          addressSaveFailed = !saved.ok
        } catch {
          addressSaveFailed = true
        }
      }

      navigate(`/checkout/success/${result.order.code || result.order.orderCode}`, {
        state: addressSaveFailed ? { addressSaveFailed: true } : undefined,
      })
    } catch {
      if (activeScopeRef.current === checkoutScope) setSubmitError('Đã xảy ra lỗi khi gửi thông tin đơn hoa. Vui lòng thử lại.')
    } finally {
      submittingRef.current = false
      if (activeScopeRef.current === checkoutScope) setIsSubmitting(false)
    }
  }

  if (!cartItems.length) return <main className="checkout-empty"><Container><p className="eyebrow">Giỏ hoa đang chờ bạn</p><h1>Chưa có bó hoa nào để thanh toán.</h1><p>Hãy quay lại giỏ hàng hoặc chọn một thiết kế thật vừa vặn.</p><Link className="button button--secondary" to="/cart">Quay lại giỏ hàng</Link></Container></main>

  return <main className="checkout-page"><Container><header className="checkout-page__intro"><p className="eyebrow">Gửi hoa thật chỉn chu</p><h1>Thông tin giao hoa và thanh toán</h1>{isAuthLoaded && !isSignedIn && <p>Thanh toán không cần tài khoản. Bạn có thể đăng nhập nếu muốn dùng địa chỉ đã lưu.</p>}</header><div className="checkout-page__layout"><form className="checkout-form" noValidate onSubmit={submit}>
    <FormSection title="Thông tin người đặt"><Field error={errors.buyerName} label="Họ và tên" required><input autoComplete="name" value={form.buyerName} onChange={(event) => update('buyerName', event.target.value)} /></Field><div className="checkout-fields"><Field error={errors.buyerPhone} label="Số điện thoại" required><input autoComplete="tel" inputMode="tel" placeholder="090 123 4567" value={form.buyerPhone} onChange={(event) => update('buyerPhone', event.target.value)} /></Field><Field error={errors.email} label="Email"><input autoComplete="email" type="email" value={form.email} onChange={(event) => update('email', event.target.value)} /></Field></div></FormSection>
    <FormSection title="Thông tin người nhận">
      {isSignedIn && savedAddresses && savedAddresses.length > 0 && (
        <Field label="Chọn từ sổ địa chỉ đã lưu">
          <select
            value={selectedAddressId || 'new'}
            onChange={(event) => handleSelectSavedAddress(event.target.value)}
          >
            {savedAddresses.map((addr) => {
              const rName = addr.recipientName || addr.recipient?.name
              const dDetail = addr.detail || addr.address?.detail
              const dDistrict = addr.district || addr.address?.district
              const dUnit = addr.ward || addr.address?.ward
              const dCity = addr.city || addr.address?.city
              const labelPrefix = addr.label ? `[${addr.label}] ` : ''
              const defaultSuffix = addr.isDefault ? ' (Mặc định)' : ''
              return (
                <option key={addr.id} value={addr.id}>
                  {labelPrefix}{rName} — {[dDetail, dUnit, dDistrict || dCity].filter(Boolean).join(', ')}{defaultSuffix}
                </option>
              )
            })}
            <option value="new">+ Nhập địa chỉ mới</option>
          </select>
        </Field>
      )}
      <label className="checkout-checkbox">
        <input checked={form.receiverIsBuyer} type="checkbox" onChange={(event) => update('receiverIsBuyer', event.target.checked)} /> Người nhận là tôi
      </label>
      {!form.receiverIsBuyer && (
        <div className="checkout-fields">
          <Field error={errors.receiverName} label="Họ và tên" required>
            <input value={form.receiverName} onChange={(event) => update('receiverName', event.target.value)} />
          </Field>
          <Field error={errors.receiverPhone} label="Số điện thoại" required>
            <input inputMode="tel" value={form.receiverPhone} onChange={(event) => update('receiverPhone', event.target.value)} />
          </Field>
        </div>
      )}
    </FormSection>
    <FormSection title="Địa chỉ giao hoa">
      <div className="checkout-fields">
        <p className="checkout-city"><strong>Thành phố giao hoa</strong><br />{form.city === HCMC_CITY ? HCMC_CITY : `${form.city} · ngoài khu vực giao hoa hiện tại`}</p>
        {form.unitCode || !selectedAddressId || selectedAddressId === 'new' || !form.ward
          ? <AdministrativeUnitSelector error={errors.unitCode} onChange={(code) => update('unitCode', code)} value={form.unitCode} />
          : <div className="checkout-legacy-location"><strong>Địa chỉ đã lưu</strong><p>{[form.ward, form.district].filter(Boolean).join(', ')}</p><button className="button button--text" type="button" onClick={() => update('ward', '')}>Chọn phường/xã hiện hành</button></div>}
      </div>
      {errors.city && <p className="checkout-error">{errors.city}</p>}
      <Field error={errors.address} label="Địa chỉ cụ thể" required>
        <input placeholder="Ví dụ: 18 Nguyễn Huệ, tòa nhà A" value={form.address} onChange={(event) => update('address', event.target.value)} />
      </Field>
      <Field label="Ghi chú giao hàng"><textarea maxLength="240" value={form.deliveryNote} onChange={(event) => update('deliveryNote', event.target.value)} placeholder="Ví dụ: Gọi trước khi đến" /></Field>
      {isSignedIn && isManualAddress && selectedAddressId && selectedAddressId !== 'new' && !form.unitCode && <p className="checkout-gifting-note">Chọn phường/xã hiện hành trước khi lưu địa chỉ mới.</p>}
      {isSignedIn && form.unitCode && (isManualAddress || selectedAddressId === 'new' || !savedAddresses?.length) && (
        <div style={{ marginTop: 12 }}>
          <label className="checkout-checkbox">
            <input
              checked={saveForLater}
              type="checkbox"
              onChange={(event) => setSaveForLater(event.target.checked)}
            />
            Lưu địa chỉ này cho lần sau
          </label>
          {saveForLater && (
            <Field label="Tên gợi nhớ cho địa chỉ này (không bắt buộc)">
              <input
                placeholder="Ví dụ: Nhà riêng, Công ty..."
                value={newAddressLabel}
                onChange={(event) => setNewAddressLabel(event.target.value)}
              />
            </Field>
          )}
        </div>
      )}
    </FormSection>
    <FormSection title="Thời gian giao hoa"><DeliverySelector />{errors.delivery && <p className="checkout-error">{errors.delivery}</p>}</FormSection>
    <FormSection title="Lời nhắn tặng hoa">
      {includesHandwrittenCard && <p className="checkout-gifting-note">Đơn hoa có Thiệp viết tay. Lời nhắn dưới đây sẽ được chuẩn bị trên thiệp.</p>}
      <Field label="Lời nhắn cho người nhận"><textarea maxLength="200" placeholder="Một lời nhắn ngắn dành cho người nhận" value={form.message} onChange={(event) => update('message', event.target.value)} /><small>{form.message.length}/200</small></Field>
      <Field label="Tên người gửi trên thiệp (không bắt buộc)"><input disabled={form.anonymousSender} maxLength="60" placeholder="Ví dụ: Minh Anh" value={form.cardSenderName} onChange={(event) => update('cardSenderName', event.target.value)} /></Field>
      <label className="checkout-checkbox"><input checked={form.anonymousSender} type="checkbox" onChange={(event) => update('anonymousSender', event.target.checked)} /> Không ghi tên người gửi</label>
      <p className="checkout-gifting-reassurance">Đơn giao đến người nhận không kèm hóa đơn hoặc thông tin giá.</p>
    </FormSection>
    <FormSection title="Phương thức thanh toán">
      <div className="checkout-payment-method">
        <div className="checkout-payment-method__title">Ví MoMo</div>
        <p className="checkout-payment-method__note">
          Mã QR và thông tin chuyển tiền MoMo sẽ hiển thị ngay sau khi bạn đặt hoa.
        </p>
      </div>
    </FormSection>
    {submitError && (
      <p className="checkout-error checkout-submit-error" role="alert">
        {submitError}
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
