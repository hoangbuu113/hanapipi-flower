import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Footer from '../components/Footer'
import CartDrawer from '../components/CartDrawer'
import ConciergeWidget from '../components/ConciergeWidget'
import Navbar from '../components/Navbar'
import { DELIVERY_CUTOFF_HOUR } from '../utils/delivery'

function SiteLayout() {
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
      <div className="announcement">Giao hoa trong ngày cho đơn đặt trước {DELIVERY_CUTOFF_HOUR}:00.</div>
      <Navbar />
      <div className="site-main">
        <Outlet />
      </div>
      <Footer />
      <ConciergeWidget />
      <CartDrawer />
    </div>
  )
}

export default SiteLayout
