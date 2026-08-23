import { Link } from 'react-router-dom'
import Container from '../components/Container'
import ProductCard from '../components/ProductCard'
import { useCommerce } from '../context/commerceStore'
import { products } from '../data/products'
import './DiscoveryPages.css'

function WishlistPage() {
  const { wishlistIds } = useCommerce()
  const wishlistProducts = products.filter((product) => wishlistIds.includes(product.id))
  return <main className="discovery-page"><Container>
    <header className="discovery-intro"><p className="eyebrow">Dành cho một dịp đặc biệt</p><h1>Những bó hoa bạn đã lưu</h1></header>
    {wishlistProducts.length ? <section aria-labelledby="wishlist-products-title"><h2 className="sr-only" id="wishlist-products-title">Danh sách hoa đã lưu</h2><div className="discovery-grid">{wishlistProducts.map((product, index) => <ProductCard key={product.id} priority={index < 3} product={product} />)}</div></section> : <div className="discovery-empty"><h2>Chưa có bó hoa nào được lưu.</h2><p>Lưu lại những thiết kế bạn muốn quay lại sau.</p><Link className="button button--secondary" to="/shop">Khám phá bộ sưu tập</Link></div>}
  </Container></main>
}
export default WishlistPage
