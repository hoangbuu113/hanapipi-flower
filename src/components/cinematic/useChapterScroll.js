import { useLayoutEffect, useState } from 'react'
import { SEQUENCE_SCROLL } from './sequenceConfig.js'
import { scrollPhasesAt } from './scrollPhases.js'
import { createDisplayScroll, displayResponse } from './displayScroll.js'

// React renders chapter art. The channel remains authoritative for every smoke
// and RIFE sample; unchanged chapter art need not reconcile the entire page.
export function chapterViewChanged(previous, next) {
  return !previous || previous.chapterProgress !== next.chapterProgress ||
    Boolean(previous.transitionProgress) !== Boolean(next.transitionProgress) ||
    (previous.transitionProgress === 1) !== (next.transitionProgress === 1) ||
    Boolean(previous.sequenceProgress) !== Boolean(next.sequenceProgress)
}
function createScrollState(chapterProgress, transitionProgress, sequenceProgress, totalProgress) {
  return {
    chapterProgress,
    transitionProgress,
    smokeProgress: transitionProgress,
    sequenceProgress,
    totalProgress,
    valueOf() {
      return this.chapterProgress
    },
    toString() {
      return String(this.chapterProgress)
    },
  }
}

function calculatePhases(totalProgress, totalTravel, innerHeight) {
  const isMobile = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 900px)').matches
  const chBudget = isMobile ? SEQUENCE_SCROLL.chapterMobile : SEQUENCE_SCROLL.chapterDesktop
  const trBudget = isMobile ? SEQUENCE_SCROLL.smokeMobile : SEQUENCE_SCROLL.smokeDesktop
  const sqBudget = isMobile ? SEQUENCE_SCROLL.sequenceMobile : SEQUENCE_SCROLL.sequenceDesktop
  const sumBudget = chBudget + trBudget + sqBudget

  // Test environment or legacy container without extended travel:
  if (totalTravel <= chBudget * (innerHeight / 100) * 1.08) {
    return createScrollState(totalProgress, 0, 0, totalProgress)
  }

  const phases = scrollPhasesAt(totalProgress * sumBudget, chBudget, trBudget, sqBudget)
  return { ...createScrollState(phases.chapterProgress, phases.transitionProgress, phases.sequenceProgress, totalProgress),
    smokeStart: chBudget * innerHeight / 100, smokeEnd: (chBudget + trBudget) * innerHeight / 100 }
}

export default function useChapterScroll(region, reducedMotion, displayRef, renderSectionsOnly = false) {
  const [scrollState, setScrollState] = useState(() => createScrollState(0, 0, 0, 0))

  useLayoutEffect(() => {
    if (reducedMotion || !region.current) return undefined

    let snapshot = null, view = null, frames
    const listeners = new Set()
    const channel = { refresh: () => frames?.schedule(), getSnapshot: () => snapshot, subscribe(callback) { listeners.add(callback); return () => listeners.delete(callback) } }
    if (displayRef) displayRef.current = channel
    const readTarget = () => {
      const bounds = region.current.getBoundingClientRect(), travel = Math.max(0, bounds.height - window.innerHeight)
      const mobile = Boolean(window.matchMedia?.('(max-width: 900px)').matches)
      const touch = Boolean(window.matchMedia?.('(pointer: coarse)').matches)
      return { position: Math.min(travel, Math.max(0, -bounds.top)), travel, height: window.innerHeight,
        response: displayResponse({ mobile, touch, dev: Boolean(import.meta.env?.DEV), search: window.location?.search || '' }) }
    }
    const publish = (position, sample) => {
      if (import.meta.env?.DEV) window.__CINEMATIC_PERF__?.scroll(position, sample)
      const progress = sample.travel > 0 ? position / sample.travel : 0
      const next = { ...calculatePhases(progress, sample.travel, sample.height),
        targetPosition: sample.position, displayedPosition: position, gap: sample.position - position }
      if (snapshot && snapshot.chapterProgress === next.chapterProgress && snapshot.transitionProgress === next.transitionProgress &&
        snapshot.sequenceProgress === next.sequenceProgress && snapshot.totalProgress === next.totalProgress && snapshot.smokeStart === next.smokeStart && snapshot.smokeEnd === next.smokeEnd && snapshot.targetPosition === next.targetPosition) {
        for (const listener of listeners) listener(snapshot)
        return
      }
      snapshot = next
      if (!renderSectionsOnly || chapterViewChanged(view, next)) { view = next; setScrollState(next) }
      for (const listener of listeners) listener(next)
    }
    const initial = readTarget()
    publish(initial.position, initial)
    frames = createDisplayScroll({ initial, readTarget, publish,
      requestFrame: callback => { if (!import.meta.env?.DEV || !window.__CINEMATIC_PERF__) return window.requestAnimationFrame(callback); const queued = performance.now(); return window.requestAnimationFrame(at => { const started = performance.now(); callback(at); if (import.meta.env?.DEV) window.__CINEMATIC_PERF__?.raf('master', at, queued, performance.now() - started) }) }, cancelFrame: id => window.cancelAnimationFrame(id) })
    const resize = () => frames.resize()
    const observer = new ResizeObserver(resize)
    observer.observe(region.current)
    window.addEventListener('scroll', frames.schedule, { passive: true })
    window.addEventListener('resize', resize)
    return () => {
      frames.dispose(); listeners.clear(); observer.disconnect()
      if (displayRef?.current === channel) displayRef.current = null
      window.removeEventListener('scroll', frames.schedule)
      window.removeEventListener('resize', resize)
    }
  }, [region, reducedMotion, displayRef, renderSectionsOnly])

  return scrollState
}
