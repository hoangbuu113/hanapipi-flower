import { useState } from 'react'
import { Link } from 'react-router-dom'
import Container from '../components/Container'
import { useAccount } from '../context/accountStore'
import { formatCurrency } from '../utils/formatCurrency'
import { getCartItemPresentation, getOrderGiftAddOns, getOrderGifting } from '../utils/order'
import './AccountPages.css'

function AccountPage() {
  const { isAuthLoading, logout, orders, updateProfile, user } = useAccount()

  return (
    <main className="account-page">
      <Container>
        <header className="account-page__intro">
          <p className="eyebrow">Hanapipi Flower của bạn</p>
          <h1>Mọi điều bạn cần, thật gọn gàng.</h1>
        </header>

        {isAuthLoading && !user ? (
          <section className="account-signin">
            <h2>Đang tải thông tin tài khoản...</h2>
            <p>Vui lòng chờ trong giây lát.</p>
          </section>
        ) : user ? (
          <ProfileForm
            key={user.id}
            logout={logout}
            updateProfile={updateProfile}
            user={user}
          />
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
          {orders.length ? (
            <div className="account-order-list">
              {orders.map((order) => {
                const gifting = getOrderGifting(order)
                const giftAddOns = getOrderGiftAddOns(order)
                return (
                  <article key={order.code}>
                    <header>
                      <div>
                        <strong>{order.code}</strong>
                        <span>
                          {new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(new Date(order.timestamp))}
                        </span>
                      </div>
                      <em>{order.status}</em>
                    </header>
                    <dl>
                      <div>
                        <dt>Người nhận</dt>
                        <dd>{order.receiver.name}</dd>
                      </div>
                      <div>
                        <dt>Tổng tiền</dt>
                        <dd>{formatCurrency(order.total)}</dd>
                      </div>
                    </dl>
                    <p>
                      {order.items.map((item) => {
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

export default AccountPage
