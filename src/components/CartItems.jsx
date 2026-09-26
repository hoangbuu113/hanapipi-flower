import { Minus, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCommerce } from '../context/commerceStore'
import { usePublicCommerce } from '../context/publicCommerceStore.js'
import { bouquetPreviewImage } from '../data/bouquetOptions'
import { cartItemLineTotal, normalizeGiftAddOns } from '../utils/cart'
import { formatCurrency } from '../utils/formatCurrency'
import './CartItems.css'

export function DeliveryProgress({ subtotal }) {
  const { mode } = usePublicCommerce()
  if (mode !== 'checkout') return null
  const threshold = 1000000
  const remaining = Math.max(0, threshold - subtotal)
  const progress = Math.min(100, (subtotal / threshold) * 100)
  return (
    <div className="delivery-progress">
      <p>
        {remaining > 0
          ? `Bạn chỉ còn ${formatCurrency(remaining)} để được giao hoa miễn phí.`
          : 'Đơn hoa của bạn đã được miễn phí giao hàng.'}
      </p>
      <span aria-hidden="true"><i style={{ width: `${progress}%` }} /></span>
    </div>
  )
}

function CartItems() {
  const { cartItems, removeFromCart, removeGiftAddOn, updateQuantity } = useCommerce()

  return (
    <div className="cart-items">
      {cartItems.map((item) => {
        if (!item) return null

        if (item.custom) {
          return (
            <article className="cart-item" key={item.key}>
              <div className="cart-item__image">
                <img alt="Bó hoa hồng dịu và trắng ngà, hình ảnh gợi ý" loading="lazy" src={bouquetPreviewImage} />
              </div>
              <div className="cart-item__details">
                <div className="cart-item__top">
                  <div>
                    <h3>{item.name}</h3>
                    <p>{item.style} · {item.palette} · {item.size}</p>
                    <p>{item.flowers.join(', ')} · {item.wrapping}</p>
                    {item.message && <p>“{item.message}”</p>}
                  </div>
                  <strong>{formatCurrency(item.lineTotal ?? cartItemLineTotal(item))}</strong>
                </div>
                <div className="cart-item__actions">
                  <div className="cart-item__stepper">
                    <button
                      aria-label="Giảm số lượng bó hoa theo ý bạn"
                      type="button"
                      onClick={() => updateQuantity(item.key, item.quantity - 1)}
                    >
                      <Minus aria-hidden="true" />
                    </button>
                    <output>{item.quantity}</output>
                    <button
                      aria-label="Tăng số lượng bó hoa theo ý bạn"
                      type="button"
                      onClick={() => updateQuantity(item.key, item.quantity + 1)}
                    >
                      <Plus aria-hidden="true" />
                    </button>
                  </div>
                  <button className="cart-item__remove" type="button" onClick={() => removeFromCart(item.key)}>
                    Xóa
                  </button>
                </div>
              </div>
            </article>
          )
        }

        const isAvailable = item.isAvailable !== false
        const isPriceless = item.isPriceless === true
        const image = item.image
        const imageSrc = image?.src ?? ''
        const imageAlt = image?.alt ?? item.name ?? 'Bó hoa Hut Flower'
        const imageFit = image?.fit ?? 'cover'
        const imagePosition = image?.position ?? 'center 45%'
        const selectedGiftAddOns = Array.isArray(item.giftAddOns)
          ? item.giftAddOns
          : normalizeGiftAddOns(item.giftAddOns)

        return (
          <article className={`cart-item ${isAvailable ? '' : 'cart-item--unavailable'}`} key={item.key}>
            {isAvailable && item.slug ? (
              <Link aria-label={`Xem ${item.name}`} to={`/product/${item.slug}`}>
                {imageSrc ? (
                  <img
                    alt={imageAlt}
                    loading="lazy"
                    src={imageSrc}
                    style={{ objectFit: imageFit, objectPosition: imagePosition }}
                  />
                ) : (
                  <div className="cart-item__placeholder" />
                )}
              </Link>
            ) : (
              <div className="cart-item__image">
                {imageSrc ? (
                  <img
                    alt={imageAlt}
                    loading="lazy"
                    src={imageSrc}
                    style={{ objectFit: imageFit, objectPosition: imagePosition }}
                  />
                ) : (
                  <div className="cart-item__placeholder" />
                )}
              </div>
            )}
            <div className="cart-item__details">
              <div className="cart-item__top">
                <div>
                  <h3>
                    {isAvailable && item.slug ? (
                      <Link to={`/product/${item.slug}`}>{item.name}</Link>
                    ) : (
                      item.name
                    )}
                  </h3>
                  {isAvailable ? (
                    <p>{item.size?.label}{item.wrapping ? ` · ${item.wrapping.label}` : ''}</p>
                  ) : (
                    <p className="cart-item__unavailable-notice" role="alert">
                      {item.unavailableReason || 'Sản phẩm hiện không còn mở bán'}
                    </p>
                  )}
                </div>
                <strong>
                  {isPriceless
                    ? 'Vô giá'
                    : isAvailable
                      ? formatCurrency(item.lineTotal ?? cartItemLineTotal(item))
                      : '—'}
                </strong>
              </div>

              {selectedGiftAddOns.length > 0 && isAvailable && (
                <div className="cart-item__gifts" aria-label={`Quà gửi kèm ${item.name}`}>
                  <p>Quà gửi kèm</p>
                  <ul>
                    {selectedGiftAddOns.map((addOn) => (
                      <li key={addOn.id}>
                        <span>
                          {addOn.name}{' '}
                          {addOn.active === false ? (
                            <small className="cart-item__gift-inactive">(Hết quà tặng, không tính phí)</small>
                          ) : (
                            <small>{addOn.price === 0 ? 'Miễn phí' : `+ ${formatCurrency(addOn.price)} / bó`}</small>
                          )}
                        </span>
                        <button
                          aria-label={`Bỏ ${addOn.name} khỏi ${item.name}`}
                          type="button"
                          onClick={() => removeGiftAddOn(item.key, addOn.id)}
                        >
                          Bỏ
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="cart-item__actions">
                {isAvailable ? (
                  <div className="cart-item__stepper">
                    <button
                      aria-label={`Giảm số lượng ${item.name}`}
                      type="button"
                      onClick={() => updateQuantity(item.key, item.quantity - 1)}
                    >
                      <Minus aria-hidden="true" />
                    </button>
                    <output>{item.quantity}</output>
                    <button
                      aria-label={`Tăng số lượng ${item.name}`}
                      type="button"
                      onClick={() => updateQuantity(item.key, item.quantity + 1)}
                    >
                      <Plus aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <span className="cart-item__qty-label">Số lượng: {item.quantity}</span>
                )}
                <button
                  className="cart-item__remove"
                  type="button"
                  onClick={() => removeFromCart(item.key)}
                >
                  Xóa
                </button>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

export default CartItems
