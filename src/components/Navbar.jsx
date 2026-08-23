import { Heart, Menu, Search, ShoppingBag, UserRound, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Button from './Button'
import BrandMark from './BrandMark'
import Container from './Container'
import { useCommerce } from '../context/commerceStore'
import { useAccount } from '../context/accountStore'
import { trapDialogFocus } from '../utils/focus'

const primaryLinks = [
  { label: 'Cửa hàng', to: '/shop' },
  { label: 'Dịp tặng hoa', to: '/#occasions' },
  { label: 'Bộ sưu tập', to: '/#seasonal' },
  { label: 'Tự tạo bó hoa', to: '/build-your-bouquet' },
  { label: 'Tìm hoa', to: '/flower-finder' },
]

const mobileLinks = [
  { label: 'Cửa hàng', to: '/shop' },
  { label: 'Tìm kiếm', to: '/search' },
  { label: 'Dịp tặng hoa', to: '/#occasions' },
  { label: 'Bộ sưu tập', to: '/#seasonal' },
  { label: 'Tìm hoa', to: '/flower-finder' },
  { label: 'Tự tạo bó hoa', to: '/build-your-bouquet' },
]

function Navbar() {
  const location = useLocation()
  const [isOpen, setIsOpen] = useState(false)
  const menuButtonRef = useRef(null)
  const closeButtonRef = useRef(null)
  const drawerRef = useRef(null)
  const { cartCount, openCart, wishlistIds } = useCommerce()
  const { user } = useAccount()
  const accountPath = user ? '/account' : '/login'

  function isLinkActive(to) {
    if (to === '/shop') return location.pathname === '/shop' || location.pathname.startsWith('/product/')
    if (to.includes('#')) return `${location.pathname}${location.hash}` === to
    return location.pathname === to
  }

  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 1024px)')
    const closeOnDesktop = (event) => {
      if (event.matches) setIsOpen(false)
    }
    desktopQuery.addEventListener('change', closeOnDesktop)
    return () => desktopQuery.removeEventListener('change', closeOnDesktop)
  }, [])

  useEffect(() => {
    if (!isOpen) return undefined
    const previousOverflow = document.body.style.overflow
    const menuButton = menuButtonRef.current
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setIsOpen(false)
      else trapDialogFocus(event, drawerRef.current)
    }
    document.body.style.overflow = 'hidden'
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus())
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)

      if (window.matchMedia('(max-width: 1023px)').matches) {
        menuButton?.focus()
      }
    }
  }, [isOpen])

  return (
    <header className="site-header">
      <Container className="site-header__inner">
        <Button
          ref={menuButtonRef}
          aria-controls="mobile-navigation"
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Đóng menu điều hướng' : 'Mở menu điều hướng'}
          className="mobile-menu-button"
          onClick={() => setIsOpen((open) => !open)}
          variant="icon"
        >
          <Menu aria-hidden="true" />
        </Button>

        <nav className="primary-nav" aria-label="Điều hướng chính">
          {primaryLinks.map((link) => (
            <Link aria-current={isLinkActive(link.to) ? 'page' : undefined} className="primary-nav__link" key={link.label} to={link.to}>
              {link.label}
            </Link>
          ))}
        </nav>

        <BrandMark className="site-header__brand" />

        <div className="mobile-header-actions" aria-label="Tiện ích khách hàng">
          <Link aria-label="Những bó hoa đã lưu" className="mobile-header-action" to="/wishlist">
            <Heart aria-hidden="true" />
            {wishlistIds.length > 0 && <em>{wishlistIds.length}</em>}
          </Link>
          <button aria-label="Mở giỏ hàng" className="mobile-header-action" type="button" onClick={openCart}>
            <ShoppingBag aria-hidden="true" />
            {cartCount > 0 && <em>{cartCount}</em>}
          </button>
        </div>

        <nav className="utility-nav" aria-label="Tiện ích khách hàng">
          <Link aria-label="Tìm kiếm" className="utility-nav__link" to="/search"><Search aria-hidden="true" /></Link>
          <Link aria-label="Những bó hoa đã lưu" className="utility-nav__link" to="/wishlist"><Heart aria-hidden="true" />{wishlistIds.length > 0 && <em>{wishlistIds.length}</em>}</Link>
          <button aria-label="Mở giỏ hàng" className="utility-nav__link" type="button" onClick={openCart}><ShoppingBag aria-hidden="true" />{cartCount > 0 && <em>{cartCount}</em>}</button>
          <Link aria-label={user ? 'Tài khoản của bạn' : 'Đăng nhập'} className="utility-nav__link" to={accountPath}><UserRound aria-hidden="true" /></Link>
        </nav>

        <button
          aria-hidden={!isOpen}
          aria-label="Đóng menu điều hướng"
          className={`mobile-nav__overlay ${isOpen ? 'is-open' : ''}`}
          disabled={!isOpen}
          tabIndex={isOpen ? 0 : -1}
          type="button"
          onClick={() => setIsOpen(false)}
        />
        <nav
          ref={drawerRef}
          aria-hidden={!isOpen}
          aria-label="Điều hướng trên điện thoại"
          className={`mobile-nav ${isOpen ? 'is-open' : ''}`}
          id="mobile-navigation"
        >
          <div className="mobile-nav__header">
            <BrandMark />
            <button ref={closeButtonRef} aria-label="Đóng menu điều hướng" className="mobile-nav__close" disabled={!isOpen} tabIndex={isOpen ? 0 : -1} type="button" onClick={() => setIsOpen(false)}>
              <X aria-hidden="true" />
            </button>
          </div>
          <div className="mobile-nav__links">
              {mobileLinks.map((link) => (
                <Link
                  aria-current={isLinkActive(link.to) ? 'page' : undefined}
                  className="mobile-nav__link"
                  key={link.label}
                  onClick={() => setIsOpen(false)}
                  to={link.to}
                >
                  {link.label}
                </Link>
              ))}
              <Link className="mobile-nav__link" onClick={() => setIsOpen(false)} to={accountPath}>Tài khoản</Link>
          </div>
        </nav>
      </Container>
    </header>
  )
}

export default Navbar
