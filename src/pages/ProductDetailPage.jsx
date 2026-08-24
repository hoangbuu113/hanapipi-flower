import { Check, ChevronRight, Heart, Minus, Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Container from '../components/Container'
import ProductCard from '../components/ProductCard'
import { getProductBySlug, products } from '../data/products'
import { createGiftAddOnSnapshot, giftAddOns } from '../data/giftAddOns'
import { formatCurrency } from '../utils/formatCurrency'
import { getProductPriceLabel, isPurchasableProduct } from '../utils/productCommerce'
import { useCommerce } from '../context/commerceStore'
import './ProductDetailPage.css'

function ProductDetailPage() {
  const { slug } = useParams()
  const product = getProductBySlug(slug)
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const [selectedSizeId, setSelectedSizeId] = useState('standard')
  const [selectedWrappingId, setSelectedWrappingId] = useState(product?.wrappingOptions?.[0]?.id)
  const [quantity, setQuantity] = useState(1)
  const [selectedGiftAddOnIds, setSelectedGiftAddOnIds] = useState([])
  const [showCartFeedback, setShowCartFeedback] = useState(false)
  const activeVideoRef = useRef(null)
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

  const isPurchasable = isPurchasableProduct(product)
  const galleryMedia = product.media ?? product.images
  const activeMedia = galleryMedia[activeImageIndex]
  const selectedSize = isPurchasable
    ? product.sizeOptions.find((option) => option.id === selectedSizeId) ?? product.sizeOptions[1]
    : null
  const relatedProducts = product.relatedProductIds
    .map((id) => products.find((item) => item.id === id))
    .filter(Boolean)
    .slice(0, 4)
  const isWishlisted = wishlistIds.includes(product.id)
  const selectedGiftAddOns = isPurchasable
    ? giftAddOns.filter((addOn) => selectedGiftAddOnIds.includes(addOn.id))
    : []
  const giftAddOnTotal = selectedGiftAddOns.reduce((total, addOn) => total + addOn.price, 0)
  const selectedUnitTotal = isPurchasable ? selectedSize.price + giftAddOnTotal : null
  const purchaseTotal = isPurchasable ? selectedUnitTotal * quantity : null

  function toggleGiftAddOn(addOnId) {
    setSelectedGiftAddOnIds((ids) => ids.includes(addOnId)
      ? ids.filter((id) => id !== addOnId)
      : [...ids, addOnId])
    setShowCartFeedback(false)
  }

  function handleAddToCart() {
    if (!isPurchasable || !selectedSize) return

    addToCart({
      productId: product.id,
      quantity,
      sizeId: selectedSize.id,
      unitPrice: selectedSize.price,
      wrappingId: selectedWrappingId,
      giftAddOns: selectedGiftAddOns.map(createGiftAddOnSnapshot),
    })
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
              {activeMedia.type === 'video' ? (
                  <video
                    ref={activeVideoRef}
                    aria-label={activeMedia.alt}
                    controls
                    playsInline
                    poster={activeMedia.poster}
                    preload="metadata"
                    src={activeMedia.src}
                    style={{ objectFit: activeMedia.fit ?? 'cover', objectPosition: activeMedia.position }}
                  />
                ) : (
                  <img
                    alt={activeMedia.alt}
                    src={activeMedia.src}
                    style={{
                      objectFit: activeMedia.fit ?? 'cover',
                      objectPosition: activeMedia.position,
                    }}
                  />
              )}
            </figure>
            <div aria-label="Chọn ảnh hoặc video" className="product-gallery__thumbnails">
              {galleryMedia.map((mediaItem, index) => (
                <button
                  aria-label={`Xem ${mediaItem.type === 'video' ? 'video' : 'ảnh'} ${index + 1} của ${product.name}`}
                  aria-pressed={activeImageIndex === index}
                  className={activeImageIndex === index ? 'is-active' : ''}
                  key={`${mediaItem.type ?? 'image'}:${mediaItem.src}`}
                  type="button"
                  onClick={() => {
                    activeVideoRef.current?.pause()
                    setActiveImageIndex(index)
                  }}
                >
                  <img
                    alt=""
                    src={mediaItem.type === 'video' ? mediaItem.poster : mediaItem.src}
                    style={{ objectFit: mediaItem.fit ?? 'cover', objectPosition: mediaItem.position }}
                  />
                  {mediaItem.type === 'video' && <span aria-hidden="true">Phát</span>}
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
            <p aria-live="polite" className="product-detail__price">
              {isPurchasable ? formatCurrency(purchaseTotal) : getProductPriceLabel(product)}
            </p>
            {isPurchasable && <p className="product-detail__price-meta">Tổng cho {quantity} bó hoa và quà tặng đã chọn</p>}
            <p className="product-detail__story">{product.description}</p>

            {isPurchasable ? <>
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
                      onChange={() => { setSelectedSizeId(option.id); setShowCartFeedback(false) }}
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
                          onChange={() => { setSelectedWrappingId(option.id); setShowCartFeedback(false) }}
                        />
                        <span>{option.label}</span>
                        <small>{option.note}</small>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              <fieldset className="product-option-group product-gift-options">
                <legend>Thêm một món quà nhỏ</legend>
                <p className="product-gift-options__intro">Chọn một hoặc nhiều món để gửi cùng bó hoa.</p>
                <div className="product-gift-options__list">
                  {giftAddOns.map((addOn) => {
                    const isSelected = selectedGiftAddOnIds.includes(addOn.id)
                    return (
                      <button
                        aria-pressed={isSelected}
                        className={isSelected ? 'is-selected' : ''}
                        key={addOn.id}
                        type="button"
                        onClick={() => toggleGiftAddOn(addOn.id)}
                      >
                        <span className="product-gift-options__check" aria-hidden="true">{isSelected && <Check />}</span>
                        <span className="product-gift-options__copy">
                          <strong>{addOn.name}</strong>
                          <small>{addOn.note}</small>
                        </span>
                        <b>{addOn.price === 0 ? 'Miễn phí' : `+ ${formatCurrency(addOn.price)}`}</b>
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              <div className="product-quantity">
                <span>Số lượng</span>
                <div aria-label="Số lượng bó hoa" className="product-stepper">
                  <button aria-label="Giảm số lượng" disabled={quantity === 1} type="button" onClick={() => { setQuantity((value) => Math.max(1, value - 1)); setShowCartFeedback(false) }}>
                    <Minus aria-hidden="true" />
                  </button>
                  <output aria-live="polite">{quantity}</output>
                  <button aria-label="Tăng số lượng" type="button" onClick={() => { setQuantity((value) => value + 1); setShowCartFeedback(false) }}>
                    <Plus aria-hidden="true" />
                  </button>
                </div>
              </div>

              <p className="product-detail__availability">{product.status === 'Đặt trước' ? 'Bó hoa này được chuẩn bị theo đơn đặt trước.' : 'Bó hoa đang sẵn sàng để được gửi đi.'}</p>
              <button className="button button--primary product-add-to-cart" type="button" onClick={handleAddToCart}>Thêm vào giỏ · {formatCurrency(purchaseTotal)}</button>
              <p aria-live="polite" className={`product-cart-feedback ${showCartFeedback ? 'is-visible' : ''}`} role="status">
                {showCartFeedback && <>Đã thêm {product.name}{selectedGiftAddOns.length ? ` cùng ${selectedGiftAddOns.length} món quà` : ''} vào giỏ hàng. <Link to="/cart">Xem giỏ hàng</Link></>}
              </p>
            </> : (
              <div className="product-priceless-action">
                <span>Chỉ để ngắm</span>
                <Link className="button button--primary product-add-to-cart" to="/flower-already-taken">Mua thử xem</Link>
              </div>
            )}
          </div>
        </section>

        <section className={`product-information ${isPurchasable ? '' : 'product-information--priceless'}`} aria-label="Thông tin về bó hoa">
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
            <p>{product.careNote}</p>
          </div>
          {isPurchasable && <div>
            <p className="eyebrow">Gửi đi thật chỉn chu</p>
            <h2>Giao hoa</h2>
            <p>{product.deliveryNote}</p>
            <p>Đặt trước 14:00 để được ưu tiên giao trong ngày.</p>
            <p>Bạn có thể chọn ngày và khung giờ giao trong giỏ hàng.</p>
            <Link className="product-information__link" to="/delivery-information">Xem thông tin giao hoa</Link>
          </div>}
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
