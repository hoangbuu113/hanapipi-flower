import { Suspense, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Footer from '../components/Footer'
import CartDrawer from '../components/CartDrawer'
import ConciergeWidget from '../components/ConciergeWidget'
import FloatingCartShortcut from '../components/FloatingCartShortcut'
import Navbar from '../components/Navbar'
import Container from '../components/Container'
import { DELIVERY_CUTOFF_HOUR } from '../utils/delivery'
import { usePublicCommerce } from '../context/publicCommerceStore.js'

function SiteLayout() {
  const { mode } = usePublicCommerce()
  const location = useLocation()

  useEffect(() => {
    const scrollFrame = window.requestAnimationFrame(() => {
      if (location.hash) {
        document.getElementById(location.hash.slice(1))?.scrollIntoView()
      } else {
        window.scrollTo({ left: 0, top: 0 })
      }
    })

    return () => window.cancelAnimationFrame(scrollFrame)
  }, [location.hash, location.pathname])

  return (
    <div className="site-shell">
      <div className="announcement">{mode === 'checkout' ? `Giao hoa trong ngày cho đơn đặt trước ${DELIVERY_CUTOFF_HOUR}:00.` : 'Chọn hoa theo ý bạn, gửi lựa chọn để được tư vấn.'}</div>
      <Navbar />
      <div className="site-main">
        <Suspense fallback={<main className="route-placeholder" aria-busy="true"><Container><p role="status" aria-live="polite">Đang tải nội dung…</p></Container></main>}>
          <Outlet />
        </Suspense>
      </div>
      <Footer />
      <FloatingCartShortcut />
      <ConciergeWidget />
      <CartDrawer />
    </div>
  )
}

export default SiteLayout
