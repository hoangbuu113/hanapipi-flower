import { lazy, Profiler, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import ChapterWorld from '../components/cinematic/ChapterWorld'
import ChapterHero from '../components/cinematic/ChapterHero'
import { CHAPTERS, chapterTransitionAtProgress } from '../components/cinematic/cinematicConfig'
import { mixPaletteColor } from '../components/cinematic/chapterPalette'
import ChapterImages from '../components/cinematic/ChapterImages'
import ChapterFrame from '../components/cinematic/ChapterFrame'
import { chapterEntryAnimations } from '../components/cinematic/chapterEntryAnimation.js'
import { advanceCopyGate, copyChoreography } from '../components/cinematic/chapterCopyGate.js'
import HeadlineText from '../components/cinematic/HeadlineText.jsx'
import { holdHeadlineForFonts, preloadHeadlineFonts } from '../components/cinematic/headlineGraphemes.js'
import useChapterScroll from '../components/cinematic/useChapterScroll'
import { TOTAL_SCROLL } from '../components/cinematic/sequenceConfig'
import { startCinematicTelemetry } from '../components/cinematic/cinematicTelemetry.js'
import SmokeTransition from '../components/cinematic/SmokeTransition.jsx'
import { scheduleSmokePreload } from '../components/cinematic/smokePreload.js'
import { useSmokeTransition } from '../components/cinematic/useSmokeTransition.js'
import ScrollFrameSequence from '../components/cinematic/ScrollFrameSequence'
import '../components/cinematic/cinematic.css'
import '../components/cinematic/cinematic-page.css'

const PerfDebug = import.meta.env?.DEV ? lazy(() => import('../components/cinematic/CinematicPerfDebug.jsx')) : null

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])
  return matches
}

// Reuse static copy/header elements; per-frame progress only touches their containers.
const chapterCopyContent = [
<div key="chapter-copy-1" className="lab-copy-content"><ChapterFrame /><p className="lab-kicker">Chương 01 <span /> Lời mở đầu</p>
            <h1 aria-label="HutFlower Một bó hoa, một điều muốn nói."><span className="lab-title-brand" aria-hidden="true">HutFlower</span><span><HeadlineText text="Một bó hoa," /><br /><HeadlineText text="một điều muốn nói." /></span></h1></div>,
<div key="chapter-copy-2" className="lab-copy-content"><ChapterFrame /><p className="lab-kicker">Chương 02 <span /> Điều chưa nói</p>
            <h2 aria-label="Khó nói, để hoa nói thay."><HeadlineText text="Khó nói," /><br /><HeadlineText text="để hoa" /><br /><HeadlineText as="em" text="nói thay." /></h2></div>,
<div key="chapter-copy-3" className="lab-copy-content"><ChapterFrame /><p className="lab-kicker">Chương 03 <span /> Một chút dịu dàng</p>
            <h2 aria-label="Mỗi ngày, vẫn đáng có hoa."><HeadlineText text="Mỗi ngày," /><br /><HeadlineText text="vẫn đáng" /><br /><HeadlineText as="em" text="có hoa." /></h2></div>,
<div key="chapter-copy-4" className="lab-copy-content"><ChapterFrame /><p className="lab-kicker">Chương 04 <span /> Dành cho bạn</p>
            <h2 aria-label="Để hoa kể tiếp câu chuyện của bạn."><HeadlineText text="Để hoa kể tiếp" /><br /><HeadlineText as="em" text="câu chuyện của bạn." /></h2>
            <a className="lab-cta" href="/shop">Khám phá hoa <span aria-hidden="true">↗</span></a></div>
]
const headerContent = <header className="lab-header">
            <a className="lab-brand" href="/" aria-label="HutFlower — Trang chủ">HutFlower</a>
            <span className="lab-edition">Một câu chuyện bằng hoa</span>
            <a className="lab-header-link" href="/shop">Bộ sưu tập <span aria-hidden="true">↗</span></a>
          </header>

// Static mobile sections reuse the existing header and footer content.
const reducedChapterChrome = CHAPTERS.map((chapter, index) => <div key={chapter.key} className="lab-reduced-chrome">
  {headerContent}
  <div className="lab-bottom" aria-hidden="true">
    <span className="lab-discovery-label">Cuộn để khám phá</span>
    <span className="lab-scroll-line" />
    <span className="lab-chapter-count">{String(index + 1).padStart(2, '0')} — 04</span>
  </div>
</div>)

export default function CinematicLabPage() {
  useEffect(startCinematicTelemetry, [])
  const scrollRegion = useRef(null)
  const displayScrollRef = useRef(null)
  const copyRegion = useRef(null)
  const copyGate = useRef({ armed: [true, true, true, true], epochs: [0, 0, 0, 0] })
  const copyAnimations = useRef([[], [], [], []])
  const copyFontHolds = useRef([null, null, null, null])
  const headlineFaces = useRef([])
  const [copyLatch, setCopyLatch] = useState({ direction: 1, armed: [true, true, true, true] })
  useEffect(() => {
    const heading = copyRegion.current?.querySelector('h1')
    if (!heading || !document.fonts) return
    const family = getComputedStyle(heading).fontFamily
    headlineFaces.current = [`400 32px ${family}`, `italic 400 32px ${family}`]
    void preloadHeadlineFonts(document.fonts, headlineFaces.current)
  }, [])
  const mobile = useMediaQuery('(max-width: 900px)')
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const scroll = useChapterScroll(scrollRegion, reducedMotion, displayScrollRef, true)
  const chapterProgress = typeof scroll === 'number' ? scroll : scroll.chapterProgress
  const transitionProgress = scroll.transitionProgress || 0
  const sequenceProgress = scroll.sequenceProgress || 0
  const [sequenceEnabled, setSequenceEnabled] = useState(false)
  const [sequenceReady, setSequenceReady] = useState(false)
  const hasSequenceTravel = transitionProgress > 0 || sequenceProgress > 0 || scroll.totalProgress < chapterProgress
  useEffect(() => {
    // Remember lazy media initialization so reverse scroll never reloads the video.
    // oxlint-disable-next-line react/set-state-in-effect
    if (!reducedMotion && chapterProgress >= .85 && hasSequenceTravel) setSequenceEnabled(true)
  }, [chapterProgress, hasSequenceTravel, reducedMotion])
  const [smokePreloaded, setSmokePreloaded] = useState(false)
  useEffect(() => reducedMotion ? undefined : scheduleSmokePreload({ document, window, onStart: () => setSmokePreloaded(true) }), [reducedMotion])
  const smokeEnabled = !reducedMotion
  const takeover = useSmokeTransition({ enabled: smokeEnabled, displayScrollRef, renderSectionsOnly: true })
  const smokeCandidate = smokeEnabled
  const smokeView = takeover.view
  useEffect(() => {
    // Remember prewarming across triggers/reversals; no Canvas/video remount.
    // oxlint-disable-next-line react/set-state-in-effect
    if (smokeCandidate && smokeView?.prewarm && hasSequenceTravel && !reducedMotion) setSequenceEnabled(true)
  }, [smokeCandidate, smokeView?.prewarm, hasSequenceTravel, reducedMotion])
  const descent = { chapterY: 0, sequenceY: 0, chapterCopyOpacity: 1, phase: smokeView?.phase || 'CHAPTER' }
  const visualChapterProgress = smokeCandidate ? smokeView?.chapterProgress ?? chapterProgress : chapterProgress
  const transition = useMemo(() => chapterTransitionAtProgress(visualChapterProgress), [visualChapterProgress])
  const { from, to, mix, activeChapter } = transition
  useEffect(() => {
    if (reducedMotion) copyAnimations.current.flat().forEach(animation => animation.cancel())
    const previousDirection = copyGate.current.direction
    const events = advanceCopyGate(copyGate.current, { from, to, mix, sequence: smokeView?.scene === 'sequence', reducedMotion })
    // Only entry/exit/direction edges refresh this latch, never each grapheme.
    if (events.length || previousDirection !== copyGate.current.direction) setCopyLatch({ direction: copyGate.current.direction, armed: [...copyGate.current.armed] })
    for (const { chapter, entered, epoch } of events) {
      copyFontHolds.current[chapter]?.()
      const container = copyRegion.current?.querySelectorAll?.('.lab-copy')[chapter]
      if (!container) continue
      copyAnimations.current[chapter].forEach(animation => animation.cancel())
      copyAnimations.current[chapter] = []
      container.dataset.copyRevealed = String(entered)
      container.dataset.revealEpoch = String(epoch)
      if (!entered || reducedMotion) continue
      const nodes = chapterEntryAnimations(container)
      copyAnimations.current[chapter] = nodes.map(({ node, frames, delay, duration }) => node.animate(
        frames,
        { duration, delay, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'backwards' }
      ))
      copyFontHolds.current[chapter] = holdHeadlineForFonts(
        copyAnimations.current[chapter].filter((_, index) => nodes[index].holdForFont),
        document.fonts,
        () => container.isConnected && container.dataset.copyRevealed === 'true' && container.dataset.revealEpoch === String(epoch),
        { faces: headlineFaces.current },
      )
    }
  }, [from, to, mix, smokeView?.scene, reducedMotion])
  useEffect(() => () => {
    copyAnimations.current.flat().forEach(animation => animation.cancel())
    copyFontHolds.current.forEach(cancel => cancel?.())
    copyGate.current.armed.fill(true)
  }, [])

  // Local chapter copy yields as the incoming video stage rises.
  const transitionFade = descent.chapterCopyOpacity

  const copyView = copyChoreography({ from, to, mix, direction: copyLatch.direction, armed: copyLatch.armed, reducedMotion })
  const copyOpacity = index => {
    if (reducedMotion) return 1
    const base = copyView.opacity[index]
    return index === 3 ? base * transitionFade : base
  }
  const copyState = index => ({
    hidden: copyOpacity(index) === 0,
    'aria-hidden': !reducedMotion && index !== copyView.activeChapter,
    inert: !reducedMotion && index !== activeChapter,
  })

  // Dev-only debug mode (enabled via ?debug=1 query param or window.__CINEMATIC_DEBUG__)
  const debug = Boolean(import.meta.env?.DEV) && typeof window !== 'undefined' && Boolean(
    (new URLSearchParams(window.location?.search || '')).has('debug') || (new URLSearchParams(window.location?.search || '')).get('smokeDebug') === '1' || window.__CINEMATIC_DEBUG__
  )

  const page = (
    <main
      className={'lab-page film-page' + (reducedMotion ? ' lab-page--reduced' : '')}
      style={{
        '--active-base': mixPaletteColor(CHAPTERS[from].palette.base, CHAPTERS[to].palette.base, mix),
        '--cinematic-scroll-height': (mobile ? TOTAL_SCROLL.mobile : TOTAL_SCROLL.desktop) + 'svh',
      }}
    >
      <div ref={scrollRegion} className="lab-scroll-region">
        <div className="lab-stage" data-smoke-lifecycle={smokeCandidate ? smokeView?.phase || 'CHAPTER' : 'disabled'} data-rife-locked={smokeCandidate && smokeView?.locked || undefined}>
          <div ref={copyRegion} className="lab-outgoing-section" style={reducedMotion ? undefined : { transform: `translate3d(0, ${descent.chapterY}svh, 0)`, visibility: smokeCandidate && smokeView?.scene === 'sequence' ? 'hidden' : 'visible', opacity: smokeCandidate && smokeView?.scene === 'sequence' ? 0 : 1 }}>
          {!reducedMotion && <ChapterImages transition={transition} suspended={smokeCandidate ? smokeView?.scene === 'sequence' : transitionProgress >= .999 && sequenceReady} />}

          <div className="lab-copy lab-copy--one" {...copyState(0)} style={{ opacity: copyOpacity(0), '--copy-base': CHAPTERS[0].palette.base, '--copy-light': CHAPTERS[0].palette.light, '--copy-accent': CHAPTERS[0].palette.textAccent }}>
            {reducedMotion && <><ChapterWorld chapter={CHAPTERS[0]} /><ChapterHero chapter={CHAPTERS[0]} /></>}
            {reducedMotion && mobile && reducedChapterChrome[0]}
            {chapterCopyContent[0]}
          </div>

          <div className="lab-copy lab-copy--two" {...copyState(1)} style={{ opacity: copyOpacity(1), '--copy-base': CHAPTERS[1].palette.base, '--copy-light': CHAPTERS[1].palette.light, '--copy-accent': CHAPTERS[1].palette.textAccent }}>
            {reducedMotion && <><ChapterWorld chapter={CHAPTERS[1]} /><ChapterHero chapter={CHAPTERS[1]} /></>}
            {reducedMotion && mobile && reducedChapterChrome[1]}
            {chapterCopyContent[1]}
          </div>

          <div className="lab-copy lab-copy--three" {...copyState(2)} style={{ opacity: copyOpacity(2), '--copy-base': CHAPTERS[2].palette.base, '--copy-light': CHAPTERS[2].palette.light, '--copy-accent': CHAPTERS[2].palette.textAccent }}>
            {reducedMotion && <><ChapterWorld chapter={CHAPTERS[2]} /><ChapterHero chapter={CHAPTERS[2]} /></>}
            {reducedMotion && mobile && reducedChapterChrome[2]}
            {chapterCopyContent[2]}
          </div>

          <div className="lab-copy lab-copy--four" {...copyState(3)} style={{ opacity: copyOpacity(3), '--copy-base': CHAPTERS[3].palette.base, '--copy-light': CHAPTERS[3].palette.light, '--copy-accent': CHAPTERS[3].palette.textAccent }}>
            {reducedMotion && <><ChapterWorld chapter={CHAPTERS[3]} /><ChapterHero chapter={CHAPTERS[3]} /></>}
            {reducedMotion && mobile && reducedChapterChrome[3]}
            {chapterCopyContent[3]}
          </div>

          <div className="lab-bottom" aria-hidden="true" style={{ opacity: transitionFade }}>
            <span className="lab-discovery-label">Cuộn để khám phá</span>
            <span className="lab-scroll-line" />
            <span className="lab-chapter-count">{String(activeChapter + 1).padStart(2, '0')} — 04</span>
          </div>

          </div>
          {!reducedMotion && sequenceEnabled && (
            <div className="lab-incoming-section" data-handoff-phase={descent.phase} data-ready={sequenceReady}
              style={{ transform: `translate3d(0, ${descent.sequenceY}svh, 0)`, visibility: smokeCandidate && smokeView?.scene !== 'sequence' ? 'hidden' : 'visible', opacity: smokeCandidate && smokeView?.scene !== 'sequence' ? 0 : 1 }}>
              <ScrollFrameSequence displayScrollRef={smokeCandidate ? takeover.channelRef : displayScrollRef} sequenceProgress={smokeCandidate ? smokeView?.sequenceProgress || 0 : sequenceProgress} transitionProgress={smokeCandidate ? smokeView?.transitionProgress || 0 : transitionProgress}
                debug={debug} onReady={setSequenceReady} onFrame0Ready={takeover.frame0Ready} revealFromStart={smokeCandidate} />
            </div>
          )}
          {!reducedMotion && smokeCandidate && (smokePreloaded || sequenceEnabled) && <SmokeTransition active mobile={mobile} channelRef={takeover.channelRef} debug={debug} onReady={takeover.rendererReady} onFailure={takeover.rendererFailed} />}
          {headerContent}
          {PerfDebug && new URLSearchParams(window.location.search).get('perfDebug') === '1' && <Suspense fallback={null}><PerfDebug region={scrollRegion} channelRef={takeover.channelRef} /></Suspense>}

        </div>
      </div>
    </main>
  )
  return import.meta.env?.DEV && new URLSearchParams(window.location.search).get('perfDebug') === '1'
    ? <Profiler id="Cinema" onRender={(id, phase, duration, _base, start, commit) => window.__CINEMATIC_PERF__?.react(id, phase, duration, start, commit)}>{page}</Profiler> : page
}
