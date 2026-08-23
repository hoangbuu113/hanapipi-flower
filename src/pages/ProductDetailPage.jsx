import { ChevronRight, Heart, Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Container from '../components/Container'
import ProductCard from '../components/ProductCard'
import { getProductBySlug, products } from '../data/products'
import { formatCurrency } from '../utils/formatCurrency'
import { useCommerce } from '../context/commerceStore'
import './ProductDetailPage.css'

function ProductDetailPage() {
  const { slug } = useParams()
  const product = getProductBySlug(slug)
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const [selectedSizeId, setSelectedSizeId] = useState('standard')
  const [selectedWrappingId, setSelectedWrappingId] = useState(product?.wrappingOptions?.[0]?.id)
  const [quantity, setQuantity] = useState(1)
  const [showCartFeedback, setShowCartFeedback] = useState(false)
  const { addToCart, toggleWishlist, wishlistIds } = useCommerce()

  if (!product) {
    return (
      <main className="product-not-found">
        <Container>
          <p className="eyebrow">Bó hoa không còn trong bộ sưu tập</p>
          <h1>Hãy để chúng tôi gợi ý một lựa chọn khác.</h1>
          <Link className="button button--secondary" to="/shop">Xem bộ sưu tập</Link>
        </Container>
      </main>
    )
  }

  const selectedSize = product.sizeOptions.find((option) => option.id === selectedSizeId) ?? product.sizeOptions[1]
  const relatedProducts = product.relatedProductIds
    .map((id) => products.find((item) => item.id === id))
    .filter(Boolean)
    .slice(0, 4)
  const isWishlisted = wishlistIds.includes(product.id)

  function handleAddToCart() {
    addToCart({ productId: product.id, quantity, sizeId: selectedSize.id, unitPrice: selectedSize.price, wrappingId: selectedWrappingId })
    setShowCartFeedback(true)
  }

  return (
    <main className="product-page">
      <Container>
        <nav aria-label="Điều hướng đường dẫn" className="product-breadcrumb">
          <Link to="/shop">Cửa hàng</Link>
          <ChevronRight aria-hidden="true" />
          <span aria-current="page">{product.name}</span>
        </nav>

        <section className="product-detail" aria-labelledby="product-title">
          <div className="product-gallery">
            <figure className="product-gallery__main">
              <img alt={product.images[activeImageIndex].alt} src={product.images[activeImageIndex].src} />
            </figure>
            <div aria-label="Chọn hình ảnh bó hoa" className="product-gallery__thumbnails">
              {product.images.map((image, index) => (
                <button
                  aria-label={`Xem ảnh ${index + 1} của ${product.name}`}
                  aria-pressed={activeImageIndex === index}
                  className={activeImageIndex === index ? 'is-active' : ''}
                  key={image.alt}
                  type="button"
                  onClick={() => setActiveImageIndex(index)}
                >
                  <img alt="" src={image.src} />
                </button>
              ))}
            </div>
          </div>

          <div className="product-detail__info">
            <p className="eyebrow">{product.collection}</p>
            <div className="product-detail__title-row">
              <h1 id="product-title">{product.name}</h1>
              {product.badges[0] && <span className="product-detail__badge">{product.badges[0]}</span>}
              <button aria-label={isWishlisted ? `Bỏ lưu ${product.name}` : `Lưu ${product.name}`} aria-pressed={isWishlisted} className={`product-detail__wishlist ${isWishlisted ? 'is-saved' : ''}`} type="button" onClick={() => toggleWishlist(product.id)}><Heart aria-hidden="true" fill={isWishlisted ? 'currentColor' : 'none'} /></button>
            </div>
            <p className="product-detail__price">{formatCurrency(selectedSize.price)}</p>
            <p className="product-detail__story">{product.description}</p>

            <fieldset className="product-option-group">
              <legend>Chọn kích thước</legend>
              <div className="product-size-options">
                {product.sizeOptions.map((option) => (
                  <label className={selectedSizeId === option.id ? 'is-selected' : ''} key={option.id}>
                    <input
                      checked={selectedSizeId === option.id}
                      name="size"
                      type="radio"
                      value={option.id}
                      onChange={() => setSelectedSizeId(option.id)}
                    />
                    <span>{option.label}</span>
                    <strong>{formatCurrency(option.price)}</strong>
                  </label>
                ))}
              </div>
            </fieldset>

            {product.wrappingOptions?.length > 0 && (
              <fieldset className="product-option-group">
                <legend>Kiểu gói</legend>
                <div className="product-wrapping-options">
                  {product.wrappingOptions.map((option) => (
                    <label className={selectedWrappingId === option.id ? 'is-selected' : ''} key={option.id}>
                      <input
                        checked={selectedWrappingId === option.id}
                        name="wrapping"
                        type="radio"
                        value={option.id}
                        onChange={() => setSelectedWrappingId(option.id)}
                      />
                      <span>{option.label}</span>
                      <small>{option.note}</small>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <div className="product-quantity">
              <span>Số lượng</span>
              <div aria-label="Số lượng bó hoa" className="product-stepper">
                <button aria-label="Giảm số lượng" disabled={quantity === 1} type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>
                  <Minus aria-hidden="true" />
                </button>
                <output aria-live="polite">{quantity}</output>
                <button aria-label="Tăng số lượng" type="button" onClick={() => setQuantity((value) => value + 1)}>
                  <Plus aria-hidden="true" />
                </button>
              </div>
            </div>

            <p className="product-detail__availability">{product.status === 'Đặt trước' ? 'Bó hoa này được chuẩn bị theo đơn đặt trước.' : 'Bó hoa đang sẵn sàng để được gửi đi.'}</p>
            <button className="button button--primary product-add-to-cart" type="button" onClick={handleAddToCart}>Thêm vào giỏ hàng</button>
            {showCartFeedback && <p className="product-cart-feedback" role="status">Đã thêm vào giỏ hàng. <Link to="/cart">Xem giỏ hàng</Link></p>}
          </div>
        </section>

        <section className="product-information" aria-label="Thông tin về bó hoa">
          <div>
            <p className="eyebrow">Những gì bên trong</p>
            <h2>Thành phần hoa</h2>
            <ul>
              {product.flowerComposition.map((flower) => <li key={flower}>{flower}</li>)}
            </ul>
          </div>
          <div>
            <p className="eyebrow">Để hoa ở lại lâu hơn</p>
            <h2>Chăm sóc hoa</h2>
            <p>Đặt hoa nơi thoáng mát, thay nước mỗi ngày và cắt vát gốc hoa khoảng 1–2 cm.</p>
          </div>
          <div>
            <p className="eyebrow">Gửi đi thật chỉn chu</p>
            <h2>Giao hoa</h2>
            <p>Có thể giao trong ngày tại khu vực được hỗ trợ.</p>
            <p>Đặt trước 14:00 để được ưu tiên giao trong ngày.</p>
            <p>Bạn có thể chọn ngày và khung giờ giao trong giỏ hàng.</p>
          </div>
        </section>

        {relatedProducts.length > 0 && (
          <section className="product-related" aria-labelledby="related-products-title">
            <div className="product-related__header">
              <div>
                <p className="eyebrow">Có thể bạn cũng sẽ thích</p>
                <h2 id="related-products-title">Những bó hoa cùng cảm xúc</h2>
              </div>
              <Link className="home-link" to="/shop">Xem bộ sưu tập</Link>
            </div>
            <div className="product-related__grid">
              {relatedProducts.map((relatedProduct) => <ProductCard key={relatedProduct.id} product={relatedProduct} />)}
            </div>
          </section>
        )}
      </Container>
    </main>
  )
}

export default ProductDetailPage
