import { Link } from 'react-router-dom'
import BrandMark from './BrandMark'
import Container from './Container'
import { usePublicCommerce } from '../context/publicCommerceStore.js'

const footerGroups = [
  {
    title: 'Khám phá',
      links: [
        { label: 'Chọn hoa', to: '/shop' },
        { label: 'Tự tay phối hoa', to: '/build-your-bouquet' },
        { label: 'Tìm hoa phù hợp', to: '/flower-finder' },
        { label: 'Hoa đã lưu', to: '/wishlist' },
    ],
  },
  {
    title: 'Chăm sóc',
      links: [
        { label: 'Thông tin giao hoa', to: '/delivery-information' },
        { label: 'Hướng dẫn chăm hoa', to: '/flower-care' },
        { label: 'Quà tặng cùng chúng tôi', to: '/#occasions' },
        {
          external: true,
          href: 'https://www.instagram.com/tiem_hoa_hanapipi/',
          label: 'Liên hệ tiệm hoa',
        },
    ],
  },
]

function Footer() {
  const { mode } = usePublicCommerce()
  return (
    <footer className="site-footer">
      <Container className="site-footer__upper">
        <div className="site-footer__brand">
          <BrandMark />
          <p className="site-footer__intro">
            Hoa theo mùa, được chăm chút cho những khoảnh khắc đáng nhớ.
          </p>
        </div>

        {footerGroups.map((group) => (
          <div className="site-footer__group" key={group.title}>
            <h2 className="site-footer__title">{group.title}</h2>
            <ul className="site-footer__list">
              {group.links.map((link) => (
                <li key={link.label}>
                  {link.to ? (
                    <Link className="site-footer__link" to={link.to}>
                      {link.label}
                    </Link>
                  ) : (
                    <a
                      className="site-footer__link"
                      href={link.href}
                      rel={link.external ? 'noopener noreferrer' : undefined}
                      target={link.external ? '_blank' : undefined}
                    >
                      {link.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="site-footer__group">
          <h2 className="site-footer__title">Thông tin cửa hàng</h2>
          <ul className="site-footer__list">
            <li className="site-footer__detail">{mode === 'checkout' ? 'Giao trong ngày cho đơn đặt trước 14:00.' : 'Thời gian gửi hoa được trao đổi khi tư vấn.'}</li>
            <li className="site-footer__detail">Thứ Hai–Chủ Nhật, 8:00–19:00.</li>
            <li>
              <a
                className="site-footer__link"
                href="https://www.instagram.com/tiem_hoa_hanapipi/"
                rel="noopener noreferrer"
                target="_blank"
              >
                Instagram
              </a>
            </li>
          </ul>
        </div>
      </Container>

      <Container className="site-footer__lower">
            <span>Được chọn lựa và gửi gắm thật tinh tế.</span>
        <span>© 2026 Hut Flower. Bảo lưu mọi quyền.</span>
      </Container>
    </footer>
  )
}

export default Footer
