import { lazy } from 'react'
import { usePublicCommerce } from '../context/publicCommerceStore.js'
import CheckoutPage from './CheckoutPage.jsx'

const CommerceCheckoutPage = lazy(() => import('./CommerceCheckoutPage.jsx'))
export default function PublicCheckoutRoute() {
  const { mode, isLoading } = usePublicCommerce()
  if (isLoading) return <main className="checkout-page"><p role="status">Đang chuẩn bị lựa chọn...</p></main>
  return mode === 'checkout' ? <CommerceCheckoutPage /> : <CheckoutPage />
}
