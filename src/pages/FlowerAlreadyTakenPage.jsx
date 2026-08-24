import { Link } from 'react-router-dom'
import Container from '../components/Container'
import { getProductBySlug } from '../data/products'
import { personalFlowerMedia } from '../data/personalFlowerMedia'
import './FlowerAlreadyTakenPage.css'

function FlowerAlreadyTakenPage() {
  const product = getProductBySlug('no-watering-flower')
  const image = product.images[0]

  return (
    <main className="flower-taken-page">
      <Container>
        <div className="flower-taken-page__layout">
          <figure className="flower-taken-page__media">
            <img
              alt="Bông Hoa Không Cần Tưới, phiên bản chỉ để ngắm"
              src={image.src}
              style={{ objectFit: image.fit ?? 'cover', objectPosition: image.position }}
            />
          </figure>
          <div className="flower-taken-page__content">
            <p className="eyebrow">Plot twist nhẹ</p>
            <h1>Bông hoa này có chủ rồi.</h1>
            <p className="flower-taken-page__lead">
              Bạn có gu đó. Nhưng rất tiếc, mẫu này không bán, không restock và cũng không có mã giảm giá nào cứu được đâu.
            </p>
            <p className="flower-taken-page__supporting">
              Giỏ hàng xin phép từ chối. Chủ shop giữ bông hoa này kỹ lắm.
            </p>
            <span className="flower-taken-page__label">Vô giá · Chỉ để ngắm</span>
            <div className="flower-taken-page__actions">
              <Link className="button button--primary" to="/shop">Thôi, xem hoa bán thật</Link>
              <Link className="button button--secondary" to="/product/no-watering-flower">Quay lại ngắm thêm</Link>
            </div>
            <small>Cảm ơn bạn đã ghé qua cú lừa có chủ đích.</small>
          </div>
        </div>

        <section className="personal-flower-gallery" aria-labelledby="personal-gallery-title">
          <header>
            <p className="eyebrow">Bộ sưu tập riêng tư</p>
            <h2 id="personal-gallery-title">Một vài khoảnh khắc của bông hoa vô giá.</h2>
            <p>Chỉ được phép ngắm thôi nha. Chủ shop kiểm kê kỹ lắm.</p>
          </header>
          <div className="personal-flower-gallery__grid">
            {personalFlowerMedia.map((mediaItem, index) => (
              <figure
                className={`personal-flower-gallery__item personal-flower-gallery__item--${mediaItem.type} personal-flower-gallery__item--${index + 1}`}
                key={`${mediaItem.type}:${mediaItem.src}`}
              >
                {mediaItem.type === 'video' ? (
                  <video
                    aria-label={mediaItem.alt}
                    controls
                    muted
                    playsInline
                    poster={mediaItem.poster}
                    preload="none"
                    src={mediaItem.src}
                  />
                ) : (
                  <img
                    alt={mediaItem.alt}
                    loading="lazy"
                    src={mediaItem.src}
                    style={{ objectFit: mediaItem.fit ?? 'cover', objectPosition: mediaItem.position }}
                  />
                )}
                <figcaption>{mediaItem.caption}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      </Container>
    </main>
  )
}

export default FlowerAlreadyTakenPage
