import { useEffect, useRef, useState } from 'react'
import './EditorialVideo.css'

function EditorialVideo({ className = '', media }) {
  const mediaRef = useRef(null)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const [shouldLoad, setShouldLoad] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches)

    updatePreference()
    mediaQuery.addEventListener('change', updatePreference)
    return () => mediaQuery.removeEventListener('change', updatePreference)
  }, [])

  useEffect(() => {
    if (prefersReducedMotion) {
      return undefined
    }

    const element = mediaRef.current
    if (!element) return undefined

    if (!('IntersectionObserver' in window)) {
      const frame = window.requestAnimationFrame(() => setShouldLoad(true))
      return () => window.cancelAnimationFrame(frame)
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setShouldLoad(true)
        observer.disconnect()
      },
      { rootMargin: '320px 0px' },
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [prefersReducedMotion])

  const classes = `editorial-video ${className}`.trim()
  const style = { objectPosition: media.position }

  if (prefersReducedMotion) {
    return (
      <img
        alt=""
        aria-hidden="true"
        className={classes}
        data-editorial-fallback="true"
        draggable="false"
        src={media.poster}
        style={style}
      />
    )
  }

  return (
    <video
      ref={mediaRef}
      aria-hidden="true"
      autoPlay
      className={classes}
      data-editorial-video="true"
      data-source-attached={shouldLoad && !prefersReducedMotion ? 'true' : 'false'}
      loop
      muted
      playsInline
      poster={media.poster}
      preload="none"
      src={shouldLoad && !prefersReducedMotion ? media.source : undefined}
      style={style}
      tabIndex={-1}
    />
  )
}

export default EditorialVideo
