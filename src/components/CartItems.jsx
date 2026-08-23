import { Minus, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCommerce } from '../context/commerceStore'
import { bouquetPreviewImage } from '../data/bouquetOptions'
import { products } from '../data/products'
import { formatCurrency } from '../utils/formatCurrency'
import './CartItems.css'

export function DeliveryProgress({ subtotal }) {
  const threshold = 1000000
  const remaining = Math.max(0, threshold - subtotal)
  const progress = Math.min(100, (subtotal / threshold) * 100)
  return (
    <div className="delivery-progress">
      <p>{remaining > 0 ? `Bạn chỉ còn ${formatCurrency(remaining)} để được giao hoa miễn phí.` : 'Đơn hoa của bạn đã được miễn phí giao hàng.'}</p>
      <span aria-hidden="true"><i style={{ width: `${progress}%` }} /></span>
    </div>
  )
}

function CartItems() {
  const { cartItems, removeFromCart, updateQuantity } = useCommerce()
  return (
    <div className="cart-items">
      {cartItems.map((item) => {
        if (item.custom) {
          return (
            <article className="cart-item" key={item.key}>
              <div className="cart-item__image"><img alt="Hình gợi ý bó hoa theo ý bạn" loading="lazy" src={bouquetPreviewImage} /></div>
              <div className="cart-item__details">
                <div className="cart-item__top"><div><h3>{item.name}</h3><p>{item.style} · {item.palette} · {item.size}</p><p>{item.flowers.join(', ')} · {item.wrapping}</p>{item.message && <p>“{item.message}”</p>}</div><strong>{formatCurrency(item.unitPrice * item.quantity)}</strong></div>
                <div className="cart-item__actions"><div className="cart-item__stepper"><button aria-label="Giảm số lượng bó hoa theo ý bạn" type="button" onClick={() => updateQuantity(item.key, item.quantity - 1)}><Minus aria-hidden="true" /></button><output>{item.quantity}</output><button aria-label="Tăng số lượng bó hoa theo ý bạn" type="button" onClick={() => updateQuantity(item.key, item.quantity + 1)}><Plus aria-hidden="true" /></button></div><button className="cart-item__remove" type="button" onClick={() => removeFromCart(item.key)}>Xóa</button></div>
              </div>
            </article>
          )
        }
        const product = products.find((entry) => entry.id === item.productId)
        if (!product) return null
        const size = product.sizeOptions.find((option) => option.id === item.sizeId)
        const wrapping = product.wrappingOptions?.find((option) => option.id === item.wrappingId)
        return (
          <article className="cart-item" key={item.key}>
            <Link aria-label={`Xem ${product.name}`} to={`/product/${product.slug}`}><img alt={product.images[0].alt} loading="lazy" src={product.images[0].src} /></Link>
            <div className="cart-item__details">
              <div className="cart-item__top"><div><h3>{product.name}</h3><p>{size?.label}{wrapping ? ` · ${wrapping.label}` : ''}</p></div><strong>{formatCurrency(item.unitPrice * item.quantity)}</strong></div>
              <div className="cart-item__actions">
                <div className="cart-item__stepper">
                  <button aria-label={`Giảm số lượng ${product.name}`} type="button" onClick={() => updateQuantity(item.key, item.quantity - 1)}><Minus aria-hidden="true" /></button>
                  <output>{item.quantity}</output>
                  <button aria-label={`Tăng số lượng ${product.name}`} type="button" onClick={() => updateQuantity(item.key, item.quantity + 1)}><Plus aria-hidden="true" /></button>
                </div>
                <button className="cart-item__remove" type="button" onClick={() => removeFromCart(item.key)}>Xóa</button>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

export default CartItems
