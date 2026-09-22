import { Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Container from '../components/Container'
import ProductCard from '../components/ProductCard'
import { fetchShopCatalogue } from '../services/catalogueClient'
import { normalizeSearch } from '../utils/normalizeSearch'
import './DiscoveryPages.css'

const suggestions = ['Sinh nhật', 'Yêu thương', 'Tông trắng']

function SearchPage() {
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadIndex, setReloadIndex] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let isSubscribed = true

    fetchShopCatalogue({ signal: controller.signal })
      .then((result) => {
        if (!isSubscribed) return
        if (result.ok && Array.isArray(result.data)) {
          setProducts(result.data)
          setError(null)
        } else {
          setError(result.error ?? { code: 'API_ERROR', message: 'Đã có lỗi xảy ra khi tải danh mục.' })
        }
      })
      .catch((err) => {
        if (!isSubscribed || err?.name === 'AbortError') return
        setError({ code: 'CLIENT_ERROR', message: 'Đã có lỗi xảy ra khi tải danh mục.' })
      })
      .finally(() => {
        if (isSubscribed) {
          setIsLoading(false)
        }
      })

    return () => {
      isSubscribed = false
      controller.abort()
    }
  }, [reloadIndex])

  function handleRetry() {
    setIsLoading(true)
    setError(null)
    setReloadIndex((current) => current + 1)
  }

  const normalizedQuery = normalizeSearch(query)
  const queryTerms = normalizedQuery.replace(/^tong\s+/, '').split(' ').filter(Boolean)
  const results = useMemo(() => {
    if (!normalizedQuery) return []
    return products.filter((product) => {
      const searchableText = normalizeSearch([
        product.name,
        product.shortDescription,
        product.collection,
        ...(product.occasions || []),
        ...(product.moods || []),
        ...(product.colorPalette || []),
        ...(product.flowerComposition || []),
      ].join(' '))
      return queryTerms.every((term) => searchableText.includes(term))
    })
  }, [products, normalizedQuery, queryTerms])

  return (
    <main className="discovery-page">
      <Container>
        <header className="discovery-intro">
          <p className="eyebrow">Từ những điều bạn đang nghĩ đến</p>
          <h1>Tìm bó hoa phù hợp</h1>
          <p>Tìm theo tên hoa, dịp tặng, màu sắc hoặc cảm xúc.</p>
        </header>
        <label className="search-input">
          <Search aria-hidden="true" />
          <span className="sr-only">Tìm bó hoa</span>
          <input
            autoFocus
            value={query}
            placeholder="Bạn đang tìm điều gì?"
            type="search"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {!normalizedQuery && (
          <div className="search-suggestions">
            <span>Gợi ý nhỏ</span>
            {suggestions.map((suggestion) => (
              <button key={suggestion} type="button" onClick={() => setQuery(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>
        )}
        {normalizedQuery && (!isLoading || products.length > 0) && !error && (
          <p className="discovery-result-count">{results.length} bó hoa phù hợp</p>
        )}
        {isLoading && products.length === 0 ? (
          <div className="discovery-loading" role="status" aria-live="polite">
            <p>Đang chuẩn bị danh sách bó hoa...</p>
          </div>
        ) : error && products.length === 0 ? (
          <div className="discovery-error" role="alert">
            <p>Không thể tải danh sách hoa.</p>
            <span className="discovery-error-message">{error.message || 'Đã có lỗi xảy ra khi tải danh mục.'}</span>
            <button className="button button--secondary" type="button" onClick={handleRetry}>
              Thử lại
            </button>
          </div>
        ) : (
          <>
            {results.length > 0 && (
              <section aria-labelledby="search-results-title">
                <h2 className="sr-only" id="search-results-title">Kết quả tìm kiếm</h2>
                <div className="discovery-grid">
                  {results.map((product, index) => (
                    <ProductCard key={product.id} priority={index < 3} product={product} />
                  ))}
                </div>
              </section>
            )}
            {normalizedQuery && results.length === 0 && (
              <div className="discovery-empty">
                <h2>Chưa tìm thấy bó hoa phù hợp.</h2>
                <p>Bạn thử tìm theo dịp tặng, màu sắc hoặc tên một loài hoa nhé.</p>
                <Link className="button button--secondary" to="/shop">Xem tất cả bó hoa</Link>
              </div>
            )}
          </>
        )}
      </Container>
    </main>
  )
}
export default SearchPage
