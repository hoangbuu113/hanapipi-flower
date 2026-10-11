const vietnameseSegmenter = typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter('vi', { granularity: 'grapheme' }) : null

export function segmentVietnameseGraphemes(text, segmenter = vietnameseSegmenter) {
  if (segmenter) return [...segmenter.segment(text)].map(({ segment }) => segment)
  // Vietnamese-only fallback: keep a letter and all its combining accents together.
  // Preserve the original Unicode spelling rather than normalizing the copy.
  return text.match(/\P{Mark}\p{Mark}*|\p{Mark}+/gu) ?? []
}

export const HEADLINE_REVEAL = { start: 140, interval: 42, duration: 220, travel: 5, trailing: 100 }

export function headlineRevealTiming(visibleGraphemeCount) {
  const { start, interval, duration, trailing } = HEADLINE_REVEAL
  const end = visibleGraphemeCount ? start + (visibleGraphemeCount - 1) * interval + duration : start
  return { end, ctaDelay: end + trailing }
}

// Request only the display faces; unrelated page fonts cannot delay copy.
export function preloadHeadlineFonts(fonts, faces) {
  return Promise.all(faces.map(face => Promise.resolve(fonts?.load?.(face, 'Mỗi ngày, vẫn đáng có hoa.')).catch(() => [])))
}
export function holdHeadlineForFonts(animations, fonts, isCurrent, { faces = [], timeoutMs = 500, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (!fonts || (faces.length ? faces.every(face => fonts.check?.(face, 'Mỗi ngày, vẫn đáng có hoa.')) : fonts.status !== 'loading')) return () => {}
  const heldAt = performance.now()
  let disposed = false, timer
  animations.forEach(animation => { animation.pause(); animation.currentTime = 0 })
  const resume = () => {
    if (disposed) return
    disposed = true; clearTimer(timer)
    if (!isCurrent()) return
    const resumeTime = Math.min(HEADLINE_REVEAL.start, performance.now() - heldAt)
    animations.forEach(animation => {
      if (animation.playState !== 'paused') return
      animation.currentTime = resumeTime; animation.play()
    })
  }
  timer = setTimer(resume, timeoutMs)
  void (faces.length ? preloadHeadlineFonts(fonts, faces) : Promise.resolve(fonts.ready)).then(resume, resume)
  return () => { disposed = true; clearTimer(timer) }
}
