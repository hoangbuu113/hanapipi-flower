import { SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Container from '../components/Container'
import ProductCard from '../components/ProductCard'
import { products } from '../data/products'
import { trapDialogFocus } from '../utils/focus'
import './ShopPage.css'

const defaultFilters = {
  color: 'all',
  occasion: 'all',
  price: 'all',
  status: 'all',
}

const filterOptions = {
  occasion: ['Sinh nhật', 'Yêu thương', 'Lời cảm ơn', 'Khởi đầu mới', 'Chia sẻ', 'Tặng không cần dịp'],
  color: ['Hồng phấn', 'Cam đào', 'Trắng', 'Xanh lá', 'Hồng trầm'],
  status: ['Có sẵn', 'Theo mùa', 'Đặt trước'],
}

function matchesPrice(product, price) {
  if (price === 'under-600') return product.price < 600000
  if (price === '600-700') return product.price >= 600000 && product.price <= 700000
  if (price === 'over-700') return product.price > 700000
  return true
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
  const [isFilterOpen, setIsFilterOpen] = useState(false)
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
    const desktopFilterQuery = window.matchMedia('(min-width: 720px)')
    const closeOnDesktop = (event) => {
      if (event.matches) setIsFilterOpen(false)
    }

    desktopFilterQuery.addEventListener('change', closeOnDesktop)
    return () => desktopFilterQuery.removeEventListener('change', closeOnDesktop)
  }, [])

  useEffect(() => {
    if (!isFilterOpen) return undefined

    const previousOverflow = document.body.style.overflow
    const filterTrigger = filterTriggerRef.current
    document.body.style.overflow = 'hidden'
    const focusFrame = window.requestAnimationFrame(() => filterCloseRef.current?.focus())
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setIsFilterOpen(false)
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
      (activeFilters.occasion === 'all' || product.occasions.includes(activeFilters.occasion)) &&
      (activeFilters.color === 'all' || product.colorPalette.includes(activeFilters.color)) &&
      (activeFilters.status === 'all' || product.status === activeFilters.status) &&
      matchesPrice(product, activeFilters.price)
    ))

    return visibleProducts.sort((first, second) => {
      if (sort === 'newest') return new Date(second.createdAt) - new Date(first.createdAt)
      if (sort === 'price-ascending') return first.price - second.price
      if (sort === 'price-descending') return second.price - first.price
      return Number(second.isBestSeller) - Number(first.isBestSeller)
    })
  }, [activeFilters, sort])

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
            <button ref={filterTriggerRef} className="shop-filter-trigger" type="button" onClick={() => setIsFilterOpen(true)}>
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

          {filteredProducts.length > 0 ? (
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
        <div className="shop-filter-modal" role="dialog" aria-modal="true" aria-label="Bộ lọc hoa">
          <button
            aria-label="Đóng bộ lọc"
            className="shop-filter-backdrop"
            type="button"
            onClick={() => setIsFilterOpen(false)}
          />
          <aside ref={filterSheetRef} className="shop-filter-sheet">
            <div className="shop-filter-sheet__header">
              <div>
                <p className="eyebrow">Khám phá theo ý bạn</p>
                <h2>Bộ lọc</h2>
              </div>
              <button ref={filterCloseRef} aria-label="Đóng bộ lọc" className="shop-filter-close" type="button" onClick={() => setIsFilterOpen(false)}>
                <X aria-hidden="true" />
              </button>
            </div>
            <ShopFilters filters={activeFilters} onChange={updateFilter} onClear={clearFilters} />
            <button className="button button--primary shop-filter-apply" type="button" onClick={() => setIsFilterOpen(false)}>
              Xem {filteredProducts.length} bó hoa
            </button>
          </aside>
        </div>
      )}
    </main>
  )
}

export default ShopPage
