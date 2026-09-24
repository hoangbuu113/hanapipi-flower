import { ArrowRight, ArrowUpRight } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Container from '../components/Container'
import EditorialVideo from '../components/EditorialVideo'
import ProductCard from '../components/ProductCard'
import SectionHeading from '../components/SectionHeading'
import { editorialMedia } from '../data/editorialMedia'
import {
  homeImages,
  occasions,
  socialMoments,
  testimonials,
} from '../data/home'
import { fetchShopCatalogue } from '../services/catalogueClient'
import './HomePage.css'

function HomePage() {
  const heroRef = useRef(null)
  const [newsletterEmail, setNewsletterEmail] = useState('')
  const [newsletterError, setNewsletterError] = useState('')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [products, setProducts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadIndex, setReloadIndex] = useState(0)

  useEffect(() => {
    const hero = heroRef.current
    if (!hero) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const desktopViewport = window.matchMedia('(min-width: 720px)')
    const finePointer = window.matchMedia(
      '(hover: hover) and (pointer: fine) and (min-width: 1080px)',
    )
    let frameId = 0
    let scrollEnabled = false
    let pointerEnabled = false
    let scrollDirty = false
    let currentX = 0
    let currentY = 0
    let targetX = 0
    let targetY = 0

    const setMotion = (name, value) => hero.style.setProperty(name, value)

    const resetMotion = () => {
      currentX = 0
      currentY = 0
      targetX = 0
      targetY = 0
      setMotion('--hero-pointer-x', '0px')
      setMotion('--hero-pointer-y', '0px')
      setMotion('--hero-media-scroll-y', '0px')
      setMotion('--hero-media-scale', '1')
      setMotion('--hero-copy-y', '0px')
    }

    const updateMotion = () => {
      frameId = 0

      if (scrollEnabled && scrollDirty) {
        scrollDirty = false
        const bounds = hero.getBoundingClientRect()
        const progress = Math.min(1, Math.max(0, -bounds.top / (bounds.height * 0.7)))
        setMotion('--hero-media-scroll-y', `${-progress * 8}px`)
        setMotion('--hero-media-scale', `${1 + progress * 0.035}`)
        setMotion('--hero-copy-y', `${progress * 24}px`)
      }

      if (pointerEnabled || currentX !== 0 || currentY !== 0) {
        currentX += (targetX - currentX) * 0.09
        currentY += (targetY - currentY) * 0.09
        setMotion('--hero-pointer-x', `${currentX}px`)
        setMotion('--hero-pointer-y', `${currentY}px`)
      }

      if (
        Math.abs(targetX - currentX) > 0.03 ||
        Math.abs(targetY - currentY) > 0.03
      ) {
        frameId = window.requestAnimationFrame(updateMotion)
      }
    }

    const scheduleMotion = () => {
      if (!frameId) frameId = window.requestAnimationFrame(updateMotion)
    }

    const handleScroll = () => {
      scrollDirty = true
      scheduleMotion()
    }

    const handlePointerMove = (event) => {
      const bounds = hero.getBoundingClientRect()
      const horizontal = (event.clientX - bounds.left) / bounds.width - 0.5
      const vertical = (event.clientY - bounds.top) / bounds.height - 0.5
      targetX = Math.max(-1, Math.min(1, horizontal)) * 4
      targetY = Math.max(-1, Math.min(1, vertical)) * 3
      scheduleMotion()
    }

    const handlePointerLeave = () => {
      targetX = 0
      targetY = 0
      scheduleMotion()
    }

    const syncMotion = () => {
      const canAnimate = !reducedMotion.matches
      const nextScrollEnabled = canAnimate && desktopViewport.matches
      const nextPointerEnabled = canAnimate && finePointer.matches

      if (nextScrollEnabled !== scrollEnabled) {
        scrollEnabled = nextScrollEnabled
        if (scrollEnabled) {
          window.addEventListener('scroll', handleScroll, { passive: true })
          scrollDirty = true
          scheduleMotion()
        } else {
          window.removeEventListener('scroll', handleScroll)
          setMotion('--hero-media-scroll-y', '0px')
          setMotion('--hero-media-scale', '1')
          setMotion('--hero-copy-y', '0px')
        }
      }

      if (nextPointerEnabled !== pointerEnabled) {
        pointerEnabled = nextPointerEnabled
        if (pointerEnabled) {
          hero.addEventListener('pointermove', handlePointerMove, { passive: true })
          hero.addEventListener('pointerleave', handlePointerLeave)
        } else {
          hero.removeEventListener('pointermove', handlePointerMove)
          hero.removeEventListener('pointerleave', handlePointerLeave)
          targetX = 0
          targetY = 0
          scheduleMotion()
        }
      }

      if (!canAnimate) {
        if (frameId) window.cancelAnimationFrame(frameId)
        frameId = 0
        resetMotion()
      }
    }

    reducedMotion.addEventListener('change', syncMotion)
    desktopViewport.addEventListener('change', syncMotion)
    finePointer.addEventListener('change', syncMotion)
    syncMotion()

    return () => {
      reducedMotion.removeEventListener('change', syncMotion)
      desktopViewport.removeEventListener('change', syncMotion)
      finePointer.removeEventListener('change', syncMotion)
      window.removeEventListener('scroll', handleScroll)
      hero.removeEventListener('pointermove', handlePointerMove)
      hero.removeEventListener('pointerleave', handlePointerLeave)
      if (frameId) window.cancelAnimationFrame(frameId)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let isMounted = true

    fetchShopCatalogue({ signal: controller.signal })
      .then((result) => {
        if (!isMounted) return
        if (result.ok && Array.isArray(result.data)) {
          setProducts(result.data)
          setError(null)
        } else {
          setError(result.error ?? { code: 'API_ERROR', message: 'Đã có lỗi xảy ra khi tải danh mục.' })
        }
      })
      .catch((err) => {
        if (!isMounted || err?.name === 'AbortError') return
        setError({ code: 'CLIENT_ERROR', message: 'Đã có lỗi xảy ra khi tải danh mục.' })
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false)
        }
      })

    return () => {
      isMounted = false
      controller.abort()
    }
  }, [reloadIndex])

  function handleRetry() {
    setIsLoading(true)
    setError(null)
    setReloadIndex((current) => current + 1)
  }

  const bestSellers = useMemo(() => {
    return products.filter((product) => product.isBestSeller)
  }, [products])

  function handleNewsletterSubmit(event) {
    event.preventDefault()

    if (!/^\S+@\S+\.\S+$/.test(newsletterEmail.trim())) {
      setNewsletterError('Vui lòng nhập địa chỉ email hợp lệ.')
      setIsSubscribed(false)
      return
    }

    setNewsletterError('')
    setIsSubscribed(true)
  }

  return (
    <main className="home-page">
      <section className="home-hero" ref={heroRef} aria-labelledby="hero-title">
        <Container className="home-hero__grid">
          <div className="home-hero__copy">
            <p className="eyebrow">Hoa cho những điều khó nói</p>
            <h1 id="hero-title">Một bó hoa, một điều muốn nói.</h1>
            <p className="home-hero__description">
              Những thiết kế hoa tươi được chọn kỹ cho những dịp đáng nhớ.
            </p>
            <div className="home-hero__actions">
              <Link className="button button--primary" to="/shop">
                Khám phá bộ sưu tập
                <ArrowRight aria-hidden="true" />
              </Link>
              <Link className="home-link" to="/#best-sellers">
                Xem những bó hoa được yêu thích
                <ArrowUpRight aria-hidden="true" />
              </Link>
            </div>
          </div>

          <figure className="home-hero__media">
            <img
              alt="Bó hoa hồng phấn và kem trong bình gốm dưới nắng sớm"
              fetchPriority="high"
              loading="eager"
              src={homeImages.hero}
            />
            <figcaption>Được hái tươi và bó tay mỗi ngày.</figcaption>
          </figure>
        </Container>
      </section>

      <section className="home-section home-section--occasions" id="occasions">
        <Container>
          <SectionHeading
            eyebrow="Chọn theo cảm xúc"
            title="Hoa cho từng dịp"
            description="Mỗi bó hoa là một cách dịu dàng để ở bên người bạn thương."
          />
          <div className="occasion-grid">
            {occasions.map((occasion) => (
              <Link
                className="occasion-tile"
                key={occasion.label}
                to={`/shop?occasion=${encodeURIComponent(occasion.label)}`}
              >
                <img
                  alt={occasion.alt}
                  loading="lazy"
                  src={occasion.image}
                  style={{ objectPosition: occasion.position }}
                />
                <span>{occasion.label}</span>
                <ArrowUpRight aria-hidden="true" />
              </Link>
            ))}
          </div>
        </Container>
      </section>

      <section className="home-section" id="best-sellers">
        <Container>
          <div className="home-section__heading-row">
            <SectionHeading
              eyebrow="Những lựa chọn được yêu mến"
              title="Được yêu thích nhất"
              description="Những sắc hoa luôn vừa vặn cho một lời chúc thật đẹp."
            />
            <Link className="home-link home-section__link" to="/shop">
              Xem tất cả bó hoa
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </div>

          {isLoading && products.length === 0 ? (
            <div className="home-best-sellers-loading" role="status" aria-live="polite">
              <p>Đang chuẩn bị những bó hoa được yêu thích...</p>
            </div>
          ) : error && products.length === 0 ? (
            <div className="home-best-sellers-error" role="alert">
              <p>Không thể tải danh sách hoa được yêu thích.</p>
              <span className="home-error-message">{error.message || 'Đã có lỗi xảy ra khi tải danh mục.'}</span>
              <button className="button button--secondary" type="button" onClick={handleRetry}>
                Thử lại
              </button>
            </div>
          ) : bestSellers.length > 0 ? (
            <div className="product-grid">
              {bestSellers.map((product, index) => (
                <ProductCard key={product.id} priority={index < 2} product={product} />
              ))}
            </div>
          ) : null}
        </Container>
      </section>

      <section className="home-section home-seasonal" id="seasonal">
        <Container className="home-seasonal__grid">
          <figure className="home-seasonal__media">
            <img
              alt="Bó hoa xanh lam và trắng với nơ xanh đặt trên nền cỏ"
              loading="lazy"
              src={homeImages.seasonal}
            />
            <figcaption>Bộ sưu tập xanh dịu · Theo mùa</figcaption>
          </figure>
          <div className="home-seasonal__copy">
            <p className="eyebrow">Từ những gì đang nở</p>
            <h2>Sắc hoa của mùa này</h2>
            <p>
              Những cành hoa tươi được chọn theo nhịp mùa, với sắc độ nhẹ và kết cấu tự
              nhiên để mỗi bó hoa luôn có cảm giác riêng.
            </p>
            <Link className="button button--secondary" to="/shop">
              Khám phá bộ sưu tập
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </Container>
      </section>

      <section className="home-section home-craft" id="craft">
        <Container className="home-craft__grid">
          <div className="home-craft__copy">
            <SectionHeading
              eyebrow="Từ đôi tay người thợ"
              title="Được chọn kỹ, bó bằng sự tinh tế."
              description="Chúng tôi để sắc hoa, tỷ lệ và khoảng thở tự nhiên dẫn dắt từng thiết kế."
            />
            <dl className="trust-list">
              <div>
                <dt>Hoa theo mùa</dt>
                <dd>Chọn từ những cành đẹp nhất trong ngày.</dd>
              </div>
              <div>
                <dt>Bó thủ công</dt>
                <dd>Cân bằng sắc độ, texture và dáng hoa.</dd>
              </div>
              <div>
                <dt>Giao đến chỉn chu</dt>
                <dd>Để niềm vui còn nguyên khi tới tay người nhận.</dd>
              </div>
            </dl>
          </div>
          <figure className="home-craft__media">
            <EditorialVideo media={editorialMedia.craftStory} />
            <figcaption>Một thiết kế nhiều lớp đang được hoàn thiện tại bàn hoa.</figcaption>
          </figure>
        </Container>
      </section>

      <section className="home-section home-testimonials" aria-labelledby="testimonial-title">
        <Container>
          <div className="home-testimonials__intro">
            <p className="eyebrow">Từ những người đã gửi hoa</p>
            <h2 id="testimonial-title">Những lời gửi lại</h2>
          </div>
          <div className="testimonial-list">
            {testimonials.map((testimonial) => (
              <figure className="testimonial" key={testimonial.author}>
                <blockquote>“{testimonial.quote}”</blockquote>
                <figcaption>
                  <strong>{testimonial.author}</strong>
                  <span>{testimonial.location}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </Container>
      </section>

      <section className="home-section home-social" id="social" aria-labelledby="social-title">
        <Container>
          <div className="home-section__heading-row">
            <SectionHeading
              eyebrow="Từ những dịp đáng nhớ"
              title="Những khoảnh khắc cùng hoa"
            />
            <a
              className="home-link home-section__link"
              href="https://www.instagram.com/tiem_hoa_hanapipi/"
              rel="noopener noreferrer"
              target="_blank"
            >
              Theo dõi Hanapipi Flower
              <ArrowUpRight aria-hidden="true" />
            </a>
          </div>
          <div className="social-mosaic">
            {socialMoments.map((moment) => (
              <figure className="social-mosaic__item" key={moment.caption}>
                {moment.editorialMediaKey ? (
                  <EditorialVideo media={editorialMedia[moment.editorialMediaKey]} />
                ) : (
                  <img
                    alt={moment.alt}
                    loading="lazy"
                    src={moment.image}
                    style={{ objectPosition: moment.position }}
                  />
                )}
                <figcaption>{moment.caption}</figcaption>
              </figure>
            ))}
          </div>
        </Container>
      </section>

      <section className="home-newsletter" id="newsletter" aria-labelledby="newsletter-title">
        <Container className="home-newsletter__inner">
          <div>
            <p className="eyebrow">Nhắc nhớ thật dịu dàng</p>
            <h2 id="newsletter-title">Đừng bỏ lỡ những dịp quan trọng.</h2>
            <p>Nhận gợi ý hoa theo mùa và lời nhắc cho những ngày đáng nhớ.</p>
          </div>
          <form className="newsletter-form" noValidate onSubmit={handleNewsletterSubmit}>
            <label className="sr-only" htmlFor="newsletter-email">
              Địa chỉ email
            </label>
            <input
              aria-describedby={newsletterError ? 'newsletter-error' : isSubscribed ? 'newsletter-success' : undefined}
              aria-invalid={Boolean(newsletterError)}
              id="newsletter-email"
              name="email"
              placeholder="Email của bạn"
              required
              type="email"
              value={newsletterEmail}
              onChange={(event) => {
                setNewsletterEmail(event.target.value)
                setNewsletterError('')
                setIsSubscribed(false)
              }}
            />
            <button className="button button--primary" type="submit">
              Nhận cập nhật
              <ArrowRight aria-hidden="true" />
            </button>
            {newsletterError && (
              <p className="newsletter-form__feedback newsletter-form__feedback--error" id="newsletter-error" role="alert">
                {newsletterError}
              </p>
            )}
            {isSubscribed && (
              <p className="newsletter-form__feedback" id="newsletter-success" role="status">
                Cảm ơn bạn đã đăng ký nhận cập nhật.
              </p>
            )}
          </form>
        </Container>
      </section>
    </main>
  )
}

export default HomePage
