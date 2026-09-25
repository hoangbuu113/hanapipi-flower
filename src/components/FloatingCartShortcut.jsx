import { ShoppingBag } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useCommerce } from '../context/commerceStore'
import './FloatingCartShortcut.css'

const visibleRoutes = new Set(['/', '/shop', '/search', '/flower-finder', '/wishlist'])

function FloatingCartShortcut() {
  const { pathname } = useLocation()
  const { cartCount } = useCommerce()

  if (!visibleRoutes.has(pathname) && !pathname.startsWith('/product/')) return null

  return (
    <Link
      aria-label={cartCount > 0 ? `Xem giỏ hàng, ${cartCount} sản phẩm` : 'Xem giỏ hàng'}
      className="floating-cart-shortcut"
      to="/cart"
    >
      <ShoppingBag aria-hidden="true" />
      <span className="floating-cart-shortcut__label">Giỏ hàng</span>
      {cartCount > 0 && <span aria-hidden="true" className="floating-cart-shortcut__badge">{cartCount}</span>}
    </Link>
  )
}

export default FloatingCartShortcut
