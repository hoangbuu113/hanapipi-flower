import { Heart } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCommerce } from '../context/commerceStore'
import { getProductPriceLabel, PRICELESS_PURCHASE_TYPE } from '../utils/productCommerce'
import { getPrimaryMediaSrc } from '../utils/media'
import './ProductCard.css'

function ProductCard({ product, priority = false }) {
  const badge = product.purchaseType === PRICELESS_PURCHASE_TYPE
    ? 'Chỉ để ngắm'
    : product.badges?.[0]
  const { toggleWishlist, wishlistIds } = useCommerce()
  const isWishlisted = wishlistIds.includes(product.id)
  const image = product.images?.[0] ?? product.media?.[0]
  const imageSrc = getPrimaryMediaSrc(product)

  return (
    <article className="product-card">
      <Link aria-label={`Xem bó hoa ${product.name}`} className="product-card__link" to={`/product/${product.slug}`}>
        <div className="product-card__media">
          {imageSrc ? (
            <img
              alt={image?.alt ?? product.name}
              loading={priority ? 'eager' : 'lazy'}
              src={imageSrc}
              style={{
                objectFit: image?.fit ?? 'cover',
                objectPosition: image?.position,
              }}
            />
          ) : (
            <span aria-label={`Ảnh ${product.name} đang được cập nhật`} className="product-card__media-fallback" role="img" />
          )}
          {badge && <span className="product-card__badge">{badge}</span>}
        </div>
        <div className="product-card__content">
          <div>
            <h3>{product.name}</h3>
            <p>{product.shortDescription}</p>
          </div>
          <strong>{getProductPriceLabel(product)}</strong>
        </div>
      </Link>
      <button
        aria-label={isWishlisted ? `Bỏ lưu ${product.name}` : `Lưu ${product.name}`}
        aria-pressed={isWishlisted}
        className={`product-card__wishlist ${isWishlisted ? 'is-saved' : ''}`}
        type="button"
        onClick={() => toggleWishlist(product.id)}
      >
        <Heart aria-hidden="true" fill={isWishlisted ? 'currentColor' : 'none'} />
      </button>
    </article>
  )
}

export default ProductCard
