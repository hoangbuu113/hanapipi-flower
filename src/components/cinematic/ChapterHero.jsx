import { useEffect, useRef, useState } from 'react'
import { PANORAMA_MEDIA } from './chapterMedia.js'
import { photoEdgeMask } from './chapterScene.js'
export default function ChapterHero({ chapter }) {
  const [failed, setFailed] = useState(false)
  const [decoded, setDecoded] = useState(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  // Keep layout/source selection intact, but do not submit a visible lazy decode
  // to the compositor while the controlled preparation is still running.
  const prepareIncomingPhoto = async event => {
    const image = event.currentTarget, source = image.currentSrc
    try { await image.decode?.() } catch { /* A loaded image may still be paintable. */ }
    if (mounted.current && image.currentSrc === source) setDecoded(true)
  }
  const frame = chapter.frame
  return <div className={'chapter-hero chapter-hero--' + chapter.key} style={{ '--subject-mask': photoEdgeMask, '--mobile-hero-width': frame.mobileWidth, '--mobile-hero-height': frame.mobileHeight, '--short-hero-height': frame.shortHeight ?? '46svh', '--mobile-hero-y': (frame.mobileY ?? 31) + '%', '--hero-width': frame.maxWidth, '--hero-height': frame.maxHeight, '--hero-x': frame.x + '%', '--hero-y': frame.y + '%', '--hero-aspect': chapter.aspect, '--hero-scale': frame.scale }}>
    {!failed ? <div className="chapter-photo"><picture>{chapter.panorama && <source media={PANORAMA_MEDIA} srcSet={chapter.panorama.srcSet} sizes={chapter.key === 'four' ? 'min(max(112vw, 336svh), 397.6svh)' : 'max(106vw, 312svh)'} />}<img src={chapter.src} alt="" decoding="async" fetchPriority={chapter.key === 'one' ? 'high' : 'auto'} onLoad={prepareIncomingPhoto} onError={() => setFailed(true)} style={{ visibility: decoded ? 'visible' : 'hidden', objectFit: frame.objectFit, objectPosition: frame.objectPosition }} /></picture></div> : <span className="chapter-image-error">Hình ảnh hoa đang tạm thời không khả dụng.</span>}
  </div>
}
