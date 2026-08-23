import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Footer from '../components/Footer'
import CartDrawer from '../components/CartDrawer'
import Navbar from '../components/Navbar'

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
      <div className="announcement">Giao hoa trong ngày cho đơn đặt trước 14:00.</div>
      <Navbar />
      <div className="site-main">
        <Outlet />
      </div>
      <Footer />
      <CartDrawer />
    </div>
  )
}

export default SiteLayout
