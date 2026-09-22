import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Container from '../components/Container'
import ProductCard from '../components/ProductCard'
import { useCommerce } from '../context/commerceStore'
import { fetchShopCatalogue } from '../services/catalogueClient'
import './DiscoveryPages.css'

function WishlistPage() {
  const { wishlistIds } = useCommerce()
  const hasWishlist = wishlistIds.length > 0
  const [products, setProducts] = useState([])
  const [isFetching, setIsFetching] = useState(hasWishlist)
  const [error, setError] = useState(null)
  const [reloadIndex, setReloadIndex] = useState(0)

  useEffect(() => {
    if (!hasWishlist) return

    const controller = new AbortController()
    let isSubscribed = true

    fetchShopCatalogue({ signal: controller.signal })
      .then((result) => {
        if (!isSubscribed) return
        if (result.ok && Array.isArray(result.data)) {
          setProducts(result.data)
          setError(null)
        } else {
          setError(result.error ?? { code: 'API_ERROR', message: 'Không thể tải danh sách hoa đã lưu.' })
        }
      })
      .catch((err) => {
        if (!isSubscribed || err?.name === 'AbortError') return
        setError({ code: 'CLIENT_ERROR', message: 'Đã có lỗi xảy ra khi tải danh mục.' })
      })
      .finally(() => {
        if (isSubscribed) {
          setIsFetching(false)
        }
      })

    return () => {
      isSubscribed = false
      controller.abort()
    }
  }, [hasWishlist, reloadIndex])

  function handleRetry() {
    setIsFetching(true)
    setError(null)
    setReloadIndex((current) => current + 1)
  }

  const isLoading = hasWishlist && isFetching

  const wishlistProducts = useMemo(() => {
    if (!wishlistIds.length || !products.length) return []
    return wishlistIds
      .map((id) => products.find((product) => product.id === id || product.slug === id))
      .filter(Boolean)
  }, [wishlistIds, products])

  return (
    <main className="discovery-page">
      <Container>
        <header className="discovery-intro">
          <p className="eyebrow">Dành cho một dịp đặc biệt</p>
          <h1>Những bó hoa bạn đã lưu</h1>
        </header>

        {isLoading && products.length === 0 ? (
          <div className="discovery-loading" role="status" aria-live="polite">
            <p>Đang chuẩn bị danh sách hoa đã lưu...</p>
          </div>
        ) : error && products.length === 0 ? (
          <div className="discovery-error" role="alert">
            <p>Không thể tải danh sách hoa đã lưu.</p>
            <span className="discovery-error-message">
              {error.message || 'Đã có lỗi xảy ra khi tải danh mục.'}
            </span>
            <button className="button button--secondary" type="button" onClick={handleRetry}>
              Thử lại
            </button>
          </div>
        ) : wishlistProducts.length > 0 ? (
          <section aria-labelledby="wishlist-products-title">
            <h2 className="sr-only" id="wishlist-products-title">Danh sách hoa đã lưu</h2>
            <div className="discovery-grid">
              {wishlistProducts.map((product, index) => (
                <ProductCard key={product.id} priority={index < 3} product={product} />
              ))}
            </div>
          </section>
        ) : (
          <div className="discovery-empty">
            <h2>Chưa có bó hoa nào được lưu.</h2>
            <p>Lưu lại những thiết kế bạn muốn quay lại sau.</p>
            <Link className="button button--secondary" to="/shop">Khám phá bộ sưu tập</Link>
          </div>
        )}
      </Container>
    </main>
  )
}

export default WishlistPage
