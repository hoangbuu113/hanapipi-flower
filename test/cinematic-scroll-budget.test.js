import { authoredTransitionProgress } from '../src/components/cinematic/transitionTimeline.js'
import assert from 'node:assert/strict'
import test from 'node:test'
import { register } from 'node:module'
import { SCROLL, CHAPTER_STARTS, CHAPTER_DISSOLVE, CHAPTER_PAINT_SPAN, CHAPTER_CURTAIN_SPAN, chapterTransitionAtProgress } from '../src/components/cinematic/cinematicConfig.js'
import { SEQUENCE_SCROLL, TOTAL_SCROLL, SEQUENCE_TIMELINE } from '../src/components/cinematic/sequenceConfig.js'
import { scrollPhasesAt, pageDescentAt } from '../src/components/cinematic/pageDescent.js'

const spans = [CHAPTER_DISSOLVE, CHAPTER_PAINT_SPAN, CHAPTER_CURTAIN_SPAN]
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, actual + ' != ' + expected)
const oldDesktop = [119.7, 143.64, 287.28]
// Copy envelopes are retained; the authored art playhead now uses the retiming map.
const golden = [[.1, .028, .896, 0], [.25, .15625, .5, 0], [.5, .5, 0, 0], [.75, .84375, 0, .5], [.9, .972, 0, .896]]
for (const mobile of [false, true]) {
  const label = mobile ? 'mobile' : 'desktop'
  const scale = mobile ? 480 / 560 : 1
  const ch = mobile ? SEQUENCE_SCROLL.chapterMobile : SEQUENCE_SCROLL.chapterDesktop
  const tr = mobile ? SEQUENCE_SCROLL.smokeMobile : SEQUENCE_SCROLL.smokeDesktop
  const sq = mobile ? SEQUENCE_SCROLL.sequenceMobile : SEQUENCE_SCROLL.sequenceDesktop
  test(label + ' extends each actual effect by 50%, preserves reading holds and retimed phase boundaries', () => {
    for (const [index, span] of spans.entries()) {
      const previous = oldDesktop[index] * scale, current = span * ch
      close(current / previous, 1.5)
      const start = (CHAPTER_STARTS[index + 1] - span / 2) * ch
      const priorEnd = index ? (CHAPTER_STARTS[index] + spans[index - 1] / 2) * ch : 0
      close(start - priorEnd, 120 * scale)
      for (const [t, , copyOut, copyIn] of golden) {
        const distance = start + current * t
        const forward = chapterTransitionAtProgress(scrollPhasesAt(distance, ch, tr, sq).chapterProgress)
        assert.deepEqual([forward.from, forward.to], [index, index + 1])
        close(forward.mix, authoredTransitionProgress(t, index + 1)); close(forward.copyOut, copyOut); close(forward.copyIn, copyIn)
        assert.deepEqual(chapterTransitionAtProgress(distance / ch), forward, 'same state when approaching from reverse')
      }
    }
    const lastEnd = (CHAPTER_STARTS[3] + spans[2] / 2) * ch
    close(ch - lastEnd, 85.9 * scale)
    close(ch, (996.52 + oldDesktop.reduce((sum, n) => sum + n * .5, 0)) * scale)
    close(SCROLL.desktopTravel * scale, ch)
  })
  test(label + ' gives the same ten-second RIFE48 source 20% more travel after full-stage lock', () => {
    close(sq / (mobile ? 650 : 750), 1.2)
    assert.equal(tr, mobile ? 480 : 600, 'handoff runway is independent')
    close(TOTAL_SCROLL[label], 100 + ch + tr + sq)
    assert.deepEqual(SEQUENCE_TIMELINE, { fps: 48, frameCount: 480, duration: 10, kind: 'rife48' })
    for (const d of [0, tr * .5, tr - .001, tr]) {
      const state = scrollPhasesAt(ch + d, ch, tr, sq)
      assert.equal(state.sequenceProgress, 0)
      assert.equal(pageDescentAt(state.transitionProgress, mobile).locked, d === tr)
    }
    for (const p of [0, .1, .5, .9, 1, .9, .5, .1, 0]) {
      const state = scrollPhasesAt(ch + tr + sq * p, ch, tr, sq)
      close(state.sequenceProgress, p)
      assert.equal(state.transitionProgress, 1)
    }
    close(scrollPhasesAt(ch + tr + sq - 1, ch, tr, sq).sequenceProgress, 1 - 1 / sq)
    assert.equal(scrollPhasesAt(ch + tr + sq + 1, ch, tr, sq).sequenceProgress, 1)
  })
}

register('./cart-component-loader.js', import.meta.url)
const React = await import('react')
const { act, create } = await import('react-test-renderer')
const useChapterScroll = (await import('../src/components/cinematic/useChapterScroll.js')).default
for (const mobile of [false, true]) {
  test((mobile ? 'mobile' : 'desktop') + ' near-native effects stop with input, reverse immediately, and do not replay skipped chapters', async () => {
    const saved = { window: globalThis.window, observer: globalThis.ResizeObserver, act: globalThis.IS_REACT_ACT_ENVIRONMENT }
    const events = new Map(), rafs = new Map()
    const ch = mobile ? SEQUENCE_SCROLL.chapterMobile : SEQUENCE_SCROLL.chapterDesktop
    const tr = mobile ? SEQUENCE_SCROLL.smokeMobile : SEQUENCE_SCROLL.smokeDesktop
    const sq = mobile ? SEQUENCE_SCROLL.sequenceMobile : SEQUENCE_SCROLL.sequenceDesktop
    let distance = 0, state, renderer, frameId = 0
    const region = { current: { getBoundingClientRect: () => ({ top: -distance * 10, height: (100 + ch + tr + sq) * 10 }) } }
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    globalThis.window = { innerHeight: 1000, matchMedia: query => ({ matches: query === '(pointer: coarse)' || mobile }),
      addEventListener: (type, cb) => events.set(type, cb), removeEventListener: type => events.delete(type),
      requestAnimationFrame: cb => { rafs.set(++frameId, cb); return frameId }, cancelAnimationFrame: id => rafs.delete(id) }
    globalThis.ResizeObserver = class { observe() {} disconnect() {} }
    function Probe() { const value = useChapterScroll(region, false); React.useLayoutEffect(() => { state = value }, [value]); return null }
    const move = async value => {
      distance = value
      await act(async () => {
        events.get('scroll')()
        assert.equal(rafs.size, 1)
        for (const [id, cb] of [...rafs]) { rafs.delete(id); cb() }
      })
    }
    try {
      await act(async () => { renderer = create(React.createElement(Probe)) })
      for (let i = 0; i < spans.length; i++) {
        const start = (CHAPTER_STARTS[i + 1] - spans[i] / 2) * ch
        for (const p of [.01, .25, .75, .5, .2, .8, .999]) {
          await move(start + spans[i] * ch * p)
          close(state.chapterProgress, distance / ch)
          assert.equal(rafs.size, 0, 'no catch-up RAF while an effect is active')
          const stopped = state
          await move(distance)
          for (const key of ['chapterProgress', 'transitionProgress', 'sequenceProgress', 'totalProgress']) assert.equal(state[key], stopped[key], 'no change after input stops')
        }
        await move(start + spans[i] * ch + .01)
        assert.equal(rafs.size, 0, 'no final catch-up or snap')
      }
      await move(0)
      close(state.chapterProgress, 0)
      assert.equal(rafs.size, 0, 'large reverse skips effects rather than replaying them')
      await move(10)
      assert.equal(rafs.size, 0, 'no reading-section inertia after a displayed sample')
      await move((CHAPTER_STARTS[1] - spans[0] * .25) * ch)
      assert.equal(rafs.size, 0, 'effect entry does not create an autonomous loop')
      close(state.chapterProgress, distance / ch)
    } finally {
      if (renderer) await act(async () => renderer.unmount())
      assert.equal(events.size, 0); assert.equal(rafs.size, 0)
      globalThis.window = saved.window; globalThis.ResizeObserver = saved.observer; globalThis.IS_REACT_ACT_ENVIRONMENT = saved.act
    }
  })
}


test('chapter hook coalesces input and resize, reads layout once and publishes latest reversal', async () => {
  const saved = { window: globalThis.window, observer: globalThis.ResizeObserver, act: globalThis.IS_REACT_ACT_ENVIRONMENT }
  const events = new Map(), rafs = new Map()
  let distance = 100, state, renderer, reads = 0, commits = 0, frameId = 0, resizeCallback, disconnected = false
  const ch = SEQUENCE_SCROLL.chapterDesktop, total = ch + SEQUENCE_SCROLL.smokeDesktop + SEQUENCE_SCROLL.sequenceDesktop
  const region = { current: { getBoundingClientRect: () => { reads++; return { top: -distance * 10, height: (100 + total) * 10 } } } }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  globalThis.window = { innerHeight: 1000, matchMedia: query => ({ matches: query === '(pointer: coarse)' }),
    addEventListener: (type, cb) => events.set(type, cb), removeEventListener: type => events.delete(type),
    requestAnimationFrame: cb => { rafs.set(frameId, cb); return frameId++ }, cancelAnimationFrame: id => rafs.delete(id) }
  globalThis.ResizeObserver = class { constructor(cb) { resizeCallback = cb } observe() {} disconnect() { disconnected = true } }
  function Probe() { const value = useChapterScroll(region, false); React.useLayoutEffect(() => { state = value; commits++ }, [value]); return null }
  const flush = async () => act(async () => { for (const [id, cb] of [...rafs]) { rafs.delete(id); cb() } })
  try {
    await act(async () => { renderer = create(React.createElement(Probe)) })
    close(state.chapterProgress, 100 / ch)
    const initialCommits = commits, initialReads = reads
    await act(async () => {
      for (let i = 0; i < 300; i++) { distance = i < 200 ? 200 + i : 499 - i; events.get('scroll')() }
      events.get('resize')(); resizeCallback()
    })
    assert.equal(rafs.size, 1); assert.equal(reads, initialReads); assert.equal(commits, initialCommits)
    await flush()
    close(state.chapterProgress, 200 / ch)
    assert.equal(reads, initialReads + 1); assert.equal(commits, initialCommits + 1); assert.equal(rafs.size, 0)
    const stopped = state
    await act(async () => { events.get('scroll')() }); await flush()
    assert.equal(state, stopped, 'same native sample retains state identity')
    assert.equal(commits, initialCommits + 1)
    await act(async () => { distance = 0; events.get('scroll')() }); await flush()
    close(state.chapterProgress, 0); assert.equal(rafs.size, 0)
    await act(async () => { events.get('scroll')() }); assert.equal(rafs.size, 1)
  } finally {
    if (renderer) await act(async () => renderer.unmount())
    assert.equal(rafs.size, 0); assert.equal(events.size, 0); assert.equal(disconnected, true)
    globalThis.window = saved.window; globalThis.ResizeObserver = saved.observer; globalThis.IS_REACT_ACT_ENVIRONMENT = saved.act
  }
})
