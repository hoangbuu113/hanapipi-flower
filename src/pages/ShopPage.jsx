import { SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Container from '../components/Container'
import ProductCard from '../components/ProductCard'
import { fetchShopCatalogue } from '../services/catalogueClient'
import { trapDialogFocus } from '../utils/focus'
import { compareProductPrices, matchesProductPriceFilter } from '../utils/productCommerce'
import './ShopPage.css'

const defaultFilters = {
  color: 'all',
  occasion: 'all',
  price: 'all',
  status: 'all',
}

const filterOptions = {
  occasion: ['Sinh nhật', 'Yêu thương', 'Kỷ niệm', 'Lời cảm ơn', 'Chúc mừng', 'Khởi đầu mới', 'Chia sẻ', 'Tặng không cần dịp'],
  color: ['Hồng phấn', 'Vàng ấm', 'Trắng', 'Trắng ngà', 'Xanh lam', 'Xanh lá', 'Đỏ'],
  status: ['Có sẵn', 'Theo mùa', 'Đặt trước'],
}

function ShopFilters({ filters, onChange, onClear }) {
  return (
    <div className="shop-filter-fields">
      <label>
        <span>Dịp tặng</span>
        <select value={filters.occasion} onChange={(event) => onChange('occasion', event.target.value)}>
          <option value="all">Tất cả dịp tặng</option>
          {filterOptions.occasion.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <label>
        <span>Tông màu</span>
        <select value={filters.color} onChange={(event) => onChange('color', event.target.value)}>
          <option value="all">Tất cả tông màu</option>
          {filterOptions.color.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <label>
        <span>Mức giá</span>
        <select value={filters.price} onChange={(event) => onChange('price', event.target.value)}>
          <option value="all">Tất cả mức giá</option>
          <option value="under-600">Dưới 600.000 ₫</option>
          <option value="600-700">600.000 ₫ – 700.000 ₫</option>
          <option value="over-700">Trên 700.000 ₫</option>
        </select>
      </label>
      <label>
        <span>Tình trạng</span>
        <select value={filters.status} onChange={(event) => onChange('status', event.target.value)}>
          <option value="all">Tất cả tình trạng</option>
          {filterOptions.status.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <button className="shop-clear-button" type="button" onClick={onClear}>Xóa bộ lọc</button>
    </div>
  )
}

function ShopPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFilters] = useState(defaultFilters)
  const [sort, setSort] = useState('featured')
  const [products, setProducts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadIndex, setReloadIndex] = useState(0)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isFilterClosing, setIsFilterClosing] = useState(false)
  const filterCloseTimerRef = useRef(null)
  const filterCloseRequestRef = useRef(null)
  const filterTriggerRef = useRef(null)
  const filterCloseRef = useRef(null)
  const filterSheetRef = useRef(null)
  const occasionParam = searchParams.get('occasion')
  const occasionFilter = filterOptions.occasion.includes(occasionParam) ? occasionParam : 'all'
  const activeFilters = useMemo(
    () => ({ ...filters, occasion: occasionFilter }),
    [filters, occasionFilter],
  )
  const selectedFilterCount = Object.values(activeFilters).filter((value) => value !== 'all').length

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

  function openFilterSheet() {
    window.clearTimeout(filterCloseTimerRef.current)
    setIsFilterClosing(false)
    setIsFilterOpen(true)
  }

  function closeFilterSheet() {
    if (isFilterClosing) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) {
      setIsFilterOpen(false)
      return
    }

    setIsFilterClosing(true)
    filterCloseTimerRef.current = window.setTimeout(() => {
      setIsFilterClosing(false)
      setIsFilterOpen(false)
    }, 320)
  }

  useEffect(() => {
    filterCloseRequestRef.current = closeFilterSheet
  })

  useEffect(() => {
    const desktopFilterQuery = window.matchMedia('(min-width: 720px)')
    const closeOnDesktop = (event) => {
      if (event.matches) {
        window.clearTimeout(filterCloseTimerRef.current)
        setIsFilterClosing(false)
        setIsFilterOpen(false)
      }
    }

    desktopFilterQuery.addEventListener('change', closeOnDesktop)
    return () => desktopFilterQuery.removeEventListener('change', closeOnDesktop)
  }, [])

  useEffect(() => () => window.clearTimeout(filterCloseTimerRef.current), [])

  useEffect(() => {
    if (!isFilterOpen) return undefined

    const previousOverflow = document.body.style.overflow
    const filterTrigger = filterTriggerRef.current
    document.body.style.overflow = 'hidden'
    const focusFrame = window.requestAnimationFrame(() => filterCloseRef.current?.focus())
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') filterCloseRequestRef.current()
      else trapDialogFocus(event, filterSheetRef.current)
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)

      if (window.matchMedia('(max-width: 719px)').matches) {
        filterTrigger?.focus()
      }
    }
  }, [isFilterOpen])

  const filteredProducts = useMemo(() => {
    const visibleProducts = products.filter((product) => (
      (activeFilters.occasion === 'all' || product.occasions?.includes(activeFilters.occasion)) &&
      (activeFilters.color === 'all' || product.colorPalette?.includes(activeFilters.color)) &&
      (activeFilters.status === 'all' || product.status === activeFilters.status) &&
      matchesProductPriceFilter(product, activeFilters.price)
    ))

    return visibleProducts.sort((first, second) => {
      if (sort === 'newest') return new Date(second.createdAt) - new Date(first.createdAt)
      if (sort === 'price-ascending' || sort === 'price-descending') {
        return compareProductPrices(first, second, sort === 'price-descending' ? 'descending' : 'ascending')
      }
      return Number(second.isBestSeller) - Number(first.isBestSeller)
    })
  }, [products, activeFilters, sort])

  function updateFilter(key, value) {
    if (key === 'occasion') {
      const nextSearchParams = new URLSearchParams(searchParams)
      if (value === 'all') nextSearchParams.delete('occasion')
      else nextSearchParams.set('occasion', value)
      setSearchParams(nextSearchParams, { replace: true })
      return
    }

    setFilters((current) => ({ ...current, [key]: value }))
  }

  function clearFilters() {
    setFilters(defaultFilters)
    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.delete('occasion')
    setSearchParams(nextSearchParams, { replace: true })
  }

  return (
    <main className="shop-page">
      <Container>
        <header className="shop-page__intro">
          <p className="eyebrow">Bộ sưu tập hoa</p>
          <h1>Chọn một bó hoa thật vừa vặn.</h1>
          <p>
            Những bó hoa được chọn theo mùa, để mỗi dịp gửi đi đều có một cảm giác riêng.
          </p>
        </header>

        <section className="shop-catalogue" aria-label="Danh sách bó hoa">
          <h2 className="sr-only">Danh sách bó hoa</h2>
          <div className="shop-toolbar">
            <button ref={filterTriggerRef} className="shop-filter-trigger" type="button" onClick={openFilterSheet}>
              <SlidersHorizontal aria-hidden="true" />
              Lọc {selectedFilterCount > 0 && `(${selectedFilterCount})`}
            </button>
            <div className="shop-filters-desktop">
              <ShopFilters filters={activeFilters} onChange={updateFilter} onClear={clearFilters} />
            </div>
            <label className="shop-sort">
              <span>Sắp xếp</span>
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="featured">Nổi bật</option>
                <option value="newest">Mới nhất</option>
                <option value="price-ascending">Giá tăng dần</option>
                <option value="price-descending">Giá giảm dần</option>
              </select>
            </label>
          </div>

          <p className="shop-result-count">{filteredProducts.length} bó hoa được chọn cho bạn</p>

          {isLoading && products.length === 0 ? (
            <div className="shop-loading-state" role="status" aria-live="polite">
              <p>Đang chuẩn bị danh sách bó hoa...</p>
            </div>
          ) : error && products.length === 0 ? (
            <div className="shop-error-state" role="alert">
              <p>Không thể tải danh sách hoa.</p>
              <span className="shop-error-message">{error.message || 'Đã có lỗi xảy ra khi tải danh mục.'}</span>
              <button
                className="button button--secondary"
                type="button"
                onClick={handleRetry}
              >
                Thử lại
              </button>
            </div>
          ) : filteredProducts.length > 0 ? (
            <div className="shop-product-grid">
              {filteredProducts.map((product, index) => (
                <ProductCard key={product.id} priority={index < 3} product={product} />
              ))}
            </div>
          ) : (
            <div className="shop-empty-state">
              <p>Chưa có bó hoa phù hợp với lựa chọn này.</p>
              <button className="button button--secondary" type="button" onClick={clearFilters}>
                Xóa bộ lọc
              </button>
            </div>
          )}
        </section>
      </Container>

      {isFilterOpen && (
        <div className={`shop-filter-modal ${isFilterClosing ? 'is-closing' : 'is-open'}`} role="dialog" aria-modal="true" aria-label="Bộ lọc hoa">
          <button
            aria-label="Đóng bộ lọc"
            className="shop-filter-backdrop"
            disabled={isFilterClosing}
            type="button"
            onClick={closeFilterSheet}
          />
          <aside ref={filterSheetRef} className="shop-filter-sheet">
            <div className="shop-filter-sheet__header">
              <div>
                <p className="eyebrow">Khám phá theo ý bạn</p>
                <h2>Bộ lọc</h2>
              </div>
              <button ref={filterCloseRef} aria-label="Đóng bộ lọc" className="shop-filter-close" disabled={isFilterClosing} type="button" onClick={closeFilterSheet}>
                <X aria-hidden="true" />
              </button>
            </div>
            <ShopFilters filters={activeFilters} onChange={updateFilter} onClear={clearFilters} />
            <button className="button button--primary shop-filter-apply" disabled={isFilterClosing} type="button" onClick={closeFilterSheet}>
              Xem {filteredProducts.length} bó hoa
            </button>
          </aside>
        </div>
      )}
    </main>
  )
}

export default ShopPage
