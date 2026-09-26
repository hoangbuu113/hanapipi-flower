import { useState } from 'react'
import { Link } from 'react-router-dom'
import Container from '../components/Container'
import AdministrativeUnitSelector from '../components/AdministrativeUnitSelector'
import { HCMC_CITY } from '../data/hcmcAdministrativeUnits.js'
import { getHcmcDeliveryUnit } from '../data/hcmcDeliveryUnits.js'
import { useAccount } from '../context/accountStore'
import { formatCurrency } from '../utils/formatCurrency'
import {
  formatDeliveryDate,
  formatOrderStatus,
  formatPaymentStatus,
  getCartItemPresentation,
  getOrderGiftAddOns,
  getOrderGifting,
} from '../utils/order'
import './AccountPages.css'

function AccountPage() {
  const {
    isAuthLoading,
    isOrdersLoading,
    logout,
    orders,
    ordersError,
    refreshOrders,
    updateProfile,
    user,
  } = useAccount()

  return (
    <main className="account-page">
      <Container>
        <header className="account-page__intro">
          <p className="eyebrow">Hut Flower của bạn</p>
          <h1>Mọi điều bạn cần, thật gọn gàng.</h1>
        </header>

        {isAuthLoading && !user ? (
          <section className="account-signin">
            <h2>Đang tải thông tin tài khoản...</h2>
            <p>Vui lòng chờ trong giây lát.</p>
          </section>
        ) : user ? (
          <>
            <ProfileForm
              key={user.id}
              logout={logout}
              updateProfile={updateProfile}
              user={user}
            />
            <AddressBookSection />
          </>
        ) : (
          <section className="account-signin">
            <h2>Đăng nhập để lưu thông tin cá nhân.</h2>
            <p>Bạn vẫn có thể xem những đơn hoa đã đặt trên trình duyệt này.</p>
            <div>
              <Link className="button button--primary" to="/login">
                Đăng nhập
              </Link>
              <Link className="button button--secondary" to="/register">
                Tạo tài khoản
              </Link>
            </div>
          </section>
        )}

        <section className="account-orders" aria-labelledby="orders-title">
          <p className="eyebrow">Đơn hoa của tôi</p>
          <h2 id="orders-title">Những đơn hoa đã ghi nhận</h2>
          {isOrdersLoading && !orders.length ? (
            <div className="account-orders__loading">
              <p>Đang tải danh sách đơn hoa...</p>
            </div>
          ) : ordersError && !orders.length ? (
            <div className="account-orders__error" role="alert">
              <p>{ordersError.message || 'Không thể tải danh sách đơn hoa.'}</p>
              <button className="button button--secondary" type="button" onClick={refreshOrders}>
                Thử lại
              </button>
            </div>
          ) : orders.length ? (
            <div className="account-order-list">
              {orders.map((order) => {
                const orderCode = order.code || order.orderCode
                const orderTimestamp = order.timestamp || order.createdAtUtc
                const gifting = getOrderGifting(order)
                const giftAddOns = getOrderGiftAddOns(order)
                return (
                  <article key={orderCode}>
                    <header>
                      <div>
                        <strong>{orderCode}</strong>
                        {orderTimestamp && (
                          <span>
                            {new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(new Date(orderTimestamp))}
                          </span>
                        )}
                      </div>
                      <em>{formatOrderStatus(order.status)}</em>
                    </header>
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
                      {order.paymentStatus && (
                        <div>
                          <dt>Thanh toán</dt>
                          <dd>{formatPaymentStatus(order.paymentStatus)}</dd>
                        </div>
                      )}
                    </dl>
                    <p>
                      {order.items?.map((item) => {
                        const presentation = getCartItemPresentation(item)
                        return `${presentation.name} × ${item.quantity}`
                      }).join(' · ')}
                    </p>
                    {giftAddOns.length > 0 && (
                      <p className="account-order__gifting">
                        <strong>Quà gửi kèm:</strong> {giftAddOns.map((addOn) => addOn.name).join(', ')}
                      </p>
                    )}
                    {gifting.message && (
                      <p className="account-order__gifting">
                        <strong>Lời nhắn:</strong> “{gifting.message}”
                      </p>
                    )}
                    {(gifting.anonymous || gifting.senderName) && (
                      <p className="account-order__gifting">
                        <strong>Người gửi:</strong> {gifting.anonymous ? 'Không ghi tên người gửi' : gifting.senderName}
                      </p>
                    )}
                    <div className="account-order__actions">
                      <Link className="button button--text" to={`/checkout/success/${orderCode}`}>
                        Xem chi tiết đơn hoa →
                      </Link>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="account-orders__empty">
              <h3>Chưa có đơn hoa nào được ghi nhận.</h3>
              <p>Những bó hoa bạn đặt sẽ xuất hiện tại đây.</p>
              <Link className="button button--secondary" to="/shop">
                Khám phá bộ sưu tập
              </Link>
            </div>
          )}
        </section>
      </Container>
    </main>
  )
}

function ProfileForm({ logout, updateProfile, user }) {
  const [profile, setProfile] = useState(() => ({
    email: user?.email ?? '',
    name: user?.name ?? user?.displayName ?? '',
    phone: user?.phone ?? '',
  }))
  const [saved, setSaved] = useState(false)

  function save(event) {
    event.preventDefault()
    updateProfile(profile)
    setSaved(true)
  }

  return (
    <section className="account-profile" aria-labelledby="profile-title">
      <div>
        <p className="eyebrow">Thông tin cá nhân</p>
        <h2 id="profile-title">Thông tin của bạn</h2>
      </div>
      <form onSubmit={save}>
        <label>
          <span>Họ và tên</span>
          <input
            value={profile.name}
            onChange={(event) => {
              setProfile((current) => ({ ...current, name: event.target.value }))
              setSaved(false)
            }}
          />
        </label>
        <label>
          <span>Email</span>
          <input
            type="email"
            value={profile.email}
            onChange={(event) => {
              setProfile((current) => ({ ...current, email: event.target.value }))
              setSaved(false)
            }}
          />
        </label>
        <label>
          <span>Số điện thoại</span>
          <input
            value={profile.phone}
            onChange={(event) => {
              setProfile((current) => ({ ...current, phone: event.target.value }))
              setSaved(false)
            }}
          />
        </label>
        <div className="account-profile__actions">
          <button className="button button--primary" type="submit">
            Lưu thông tin
          </button>
          <button className="button button--text" type="button" onClick={logout}>
            Đăng xuất
          </button>
        </div>
        {saved && <p role="status">Đã lưu thông tin.</p>}
      </form>
    </section>
  )
}

function AddressBookSection() {
  const {
    addAddress,
    addressesError,
    editAddress,
    isAddressesLoading,
    makeAddressDefault,
    refreshAddresses,
    removeAddress,
    savedAddresses,
  } = useAccount()

  const [editingAddress, setEditingAddress] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [isBusy, setIsBusy] = useState(false)

  async function handleDelete(addressId) {
    if (!window.confirm('Bạn có chắc chắn muốn xóa địa chỉ này khỏi sổ địa chỉ?')) return
    setIsBusy(true)
    setActionError(null)
    try {
      const result = await removeAddress(addressId)
      if (!result.ok) {
        setActionError(result.error?.message || 'Không thể xóa địa chỉ.')
      }
    } catch {
      setActionError('Đã xảy ra lỗi khi xóa địa chỉ.')
    } finally {
      setIsBusy(false)
    }
  }

  async function handleSetDefault(addressId) {
    setIsBusy(true)
    setActionError(null)
    try {
      const result = await makeAddressDefault(addressId)
      if (!result.ok) {
        setActionError(result.error?.message || 'Không thể đặt địa chỉ mặc định.')
      }
    } catch {
      setActionError('Đã xảy ra lỗi khi đặt địa chỉ mặc định.')
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <section aria-labelledby="addresses-title" className="account-addresses">
      <div className="account-addresses__header">
        <div>
          <p className="eyebrow">Sổ địa chỉ của bạn</p>
          <h2 id="addresses-title">Địa chỉ đã lưu</h2>
        </div>
        {!editingAddress && (
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              setActionError(null)
              setEditingAddress('new')
            }}
          >
            + Thêm địa chỉ mới
          </button>
        )}
      </div>

      {actionError && (
        <p className="auth-error" role="alert" style={{ marginBottom: 16 }}>
          {actionError}
        </p>
      )}

      {editingAddress ? (
        <AddressForm
          initial={editingAddress === 'new' ? null : editingAddress}
          isFirst={savedAddresses.length === 0}
          onCancel={() => setEditingAddress(null)}
          onSubmit={async (payload) => {
            if (editingAddress === 'new') {
              const res = await addAddress(payload)
              if (res.ok) setEditingAddress(null)
              return res
            }
            const res = await editAddress(editingAddress.id, payload)
            if (res.ok) setEditingAddress(null)
            return res
          }}
        />
      ) : isAddressesLoading && !savedAddresses.length ? (
        <div className="account-orders__loading">
          <p>Đang tải sổ địa chỉ...</p>
        </div>
      ) : addressesError && !savedAddresses.length ? (
        <div className="account-orders__error" role="alert">
          <p>{addressesError.message || 'Không thể tải sổ địa chỉ.'}</p>
          <button className="button button--secondary" type="button" onClick={refreshAddresses}>
            Thử lại
          </button>
        </div>
      ) : savedAddresses.length > 0 ? (
        <div className="account-address-grid">
          {savedAddresses.map((addr) => (
            <article
              key={addr.id}
              className={`account-address-card ${addr.isDefault ? 'account-address-card--default' : ''}`}
            >
              <div>
                <header className="account-address-card__header">
                  <span className="account-address-card__title">
                    {addr.label || 'Địa chỉ giao hoa'}
                  </span>
                  {addr.isDefault && (
                    <span className="account-address-card__badge">Mặc định</span>
                  )}
                </header>
                <div className="account-address-card__body">
                  <p className="account-address-card__recipient">
                    {addr.recipientName || addr.recipient?.name} · {addr.recipientPhone || addr.recipient?.phone}
                  </p>
                  <p>
                    {[addr.detail || addr.address?.detail, addr.ward || addr.address?.ward, addr.district || addr.address?.district, addr.city || addr.address?.city].filter(Boolean).join(', ')}
                  </p>
                  {(addr.deliveryNote || addr.address?.deliveryNote) && (
                    <p>
                      <em>Ghi chú: {addr.deliveryNote || addr.address?.deliveryNote}</em>
                    </p>
                  )}
                </div>
              </div>
              <footer className="account-address-card__actions">
                {!addr.isDefault && (
                  <button
                    className="button button--text"
                    disabled={isBusy}
                    type="button"
                    onClick={() => handleSetDefault(addr.id)}
                  >
                    Đặt làm mặc định
                  </button>
                )}
                <button
                  className="button button--text"
                  disabled={isBusy}
                  type="button"
                  onClick={() => {
                    setActionError(null)
                    setEditingAddress(addr)
                  }}
                >
                  Chỉnh sửa
                </button>
                <button
                  className="button button--text button--text-danger"
                  disabled={isBusy}
                  type="button"
                  onClick={() => handleDelete(addr.id)}
                >
                  Xóa
                </button>
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <div className="account-addresses__empty">
          <h3>Chưa có địa chỉ nào được lưu.</h3>
          <p>Lưu địa chỉ nhận hoa để việc gửi trao lần sau thêm nhanh chóng và chỉn chu.</p>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => setEditingAddress('new')}
          >
            Thêm địa chỉ ngay
          </button>
        </div>
      )}
    </section>
  )
}

function AddressForm({ initial, isFirst, onCancel, onSubmit }) {
  const [form, setForm] = useState(() => ({
    deliveryNote: initial?.deliveryNote ?? initial?.address?.deliveryNote ?? '',
    detail: initial?.detail ?? initial?.address?.detail ?? '',
    isDefault: initial?.isDefault ?? (isFirst ? true : false),
    label: initial?.label ?? '',
    recipientName: initial?.recipientName ?? initial?.recipient?.name ?? '',
    recipientPhone: initial?.recipientPhone ?? initial?.recipient?.phone ?? '',
    unitCode: initial?.unitCode ?? initial?.address?.unitCode ?? '',
  }))
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [serverError, setServerError] = useState(null)

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: '' }))
    setServerError(null)
  }

  function validate() {
    const next = {}
    const phonePattern = /^(0\d{9}|\+84\d{9})$/u
    if (!form.recipientName.trim()) next.recipientName = 'Vui lòng nhập họ và tên người nhận.'
    if (!phonePattern.test(form.recipientPhone.replaceAll(/\s/gu, ''))) {
      next.recipientPhone = 'Vui lòng nhập số điện thoại Việt Nam hợp lệ.'
    }
    if (!getHcmcDeliveryUnit(form.unitCode)) next.unitCode = 'Vui lòng chọn phường hoặc xã trong khu vực giao hoa.'
    if (!form.detail.trim()) next.detail = 'Vui lòng nhập địa chỉ cụ thể.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleFormSubmit(e) {
    e.preventDefault()
    if (isSubmitting) return
    if (!validate()) return

    setIsSubmitting(true)
    setServerError(null)
    try {
      const res = await onSubmit({ ...form, city: HCMC_CITY })
      if (!res.ok) {
        if (res.error?.fieldErrors) {
          setErrors(res.error.fieldErrors)
        }
        setServerError(res.error?.message || 'Không thể lưu địa chỉ. Vui lòng thử lại.')
      }
    } catch {
      setServerError('Đã xảy ra lỗi khi lưu địa chỉ. Vui lòng thử lại.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="account-address-form">
      <h3>{initial ? 'Chỉnh sửa địa chỉ' : 'Thêm địa chỉ giao hoa'}</h3>
      <form noValidate onSubmit={handleFormSubmit}>
        <label>
          <span>Tên gợi nhớ (ví dụ: Nhà, Công ty, Người thương)</span>
          <input
            placeholder="Ví dụ: Nhà riêng"
            value={form.label}
            onChange={(e) => update('label', e.target.value)}
          />
          {errors.label && <em className="auth-error">{errors.label}</em>}
        </label>

        <div className="account-address-form__row">
          <label>
            <span>Họ và tên người nhận *</span>
            <input
              value={form.recipientName}
              onChange={(e) => update('recipientName', e.target.value)}
            />
            {errors.recipientName && <em className="auth-error">{errors.recipientName}</em>}
          </label>
          <label>
            <span>Số điện thoại *</span>
            <input
              inputMode="tel"
              placeholder="090 123 4567"
              value={form.recipientPhone}
              onChange={(e) => update('recipientPhone', e.target.value)}
            />
            {errors.recipientPhone && <em className="auth-error">{errors.recipientPhone}</em>}
          </label>
        </div>

        <div className="account-address-form__row">
          <p className="account-address-form__city"><strong>Thành phố giao hoa</strong><br />{HCMC_CITY}</p>
          <AdministrativeUnitSelector error={errors.unitCode} onChange={(code) => update('unitCode', code)} value={form.unitCode} />
        </div>
        {initial && !initial.unitCode && <p className="account-address-form__legacy">Địa chỉ cũ vẫn dùng được. Khi chỉnh sửa, vui lòng chọn phường/xã hiện hành để cập nhật.</p>}

        <label>
          <span>Địa chỉ cụ thể *</span>
          <input
            placeholder="Số nhà, tên đường, tòa nhà, số căn hộ..."
            value={form.detail}
            onChange={(e) => update('detail', e.target.value)}
          />
          {errors.detail && <em className="auth-error">{errors.detail}</em>}
        </label>

        <label>
          <span>Ghi chú giao hàng (tùy chọn)</span>
          <textarea
            placeholder="Ví dụ: Gọi trước khi đến, gửi bảo vệ nếu vắng mặt..."
            value={form.deliveryNote}
            onChange={(e) => update('deliveryNote', e.target.value)}
          />
          {errors.deliveryNote && <em className="auth-error">{errors.deliveryNote}</em>}
        </label>

        <label className="checkout-checkbox">
          <input
            checked={form.isDefault}
            disabled={isFirst || Boolean(initial && initial.isDefault)}
            type="checkbox"
            onChange={(e) => update('isDefault', e.target.checked)}
          />
          Đặt làm địa chỉ mặc định
        </label>

        {serverError && <p className="auth-error" role="alert">{serverError}</p>}

        <div className="account-address-form__actions">
          <button className="button button--primary" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Đang lưu...' : 'Lưu địa chỉ'}
          </button>
          <button className="button button--secondary" disabled={isSubmitting} type="button" onClick={onCancel}>
            Hủy
          </button>
        </div>
      </form>
    </div>
  )
}

export default AccountPage
