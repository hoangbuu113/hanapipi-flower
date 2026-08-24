import { Heart } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCommerce } from '../context/commerceStore'
import { getProductPriceLabel, PRICELESS_PURCHASE_TYPE } from '../utils/productCommerce'
import './ProductCard.css'

function ProductCard({ product, priority = false }) {
  const badge = product.purchaseType === PRICELESS_PURCHASE_TYPE
    ? 'Chỉ để ngắm'
    : product.badges?.[0]
  const { toggleWishlist, wishlistIds } = useCommerce()
  const isWishlisted = wishlistIds.includes(product.id)

  return (
    <article className="product-card">
      <Link aria-label={`Xem bó hoa ${product.name}`} className="product-card__link" to={`/product/${product.slug}`}>
        <div className="product-card__media">
          <img
            alt={product.images[0].alt}
            loading={priority ? 'eager' : 'lazy'}
            src={product.images[0].src}
            style={{
              objectFit: product.images[0].fit ?? 'cover',
              objectPosition: product.images[0].position,
            }}
          />
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
