import assert from 'node:assert/strict'
import test from 'node:test'
import { register } from 'node:module'
import { SEQUENCE_SCROLL } from '../src/components/cinematic/sequenceConfig.js'
register('./cart-component-loader.js', import.meta.url)
const React = await import('react')
const { act, create } = await import('react-test-renderer')
const Sequence = (await import('../src/components/cinematic/ScrollFrameSequence.jsx')).default
const useScroll = (await import('../src/components/cinematic/useChapterScroll.js')).default

for (const mobile of [false, true]) {
  test((mobile ? 'mobile' : 'desktop') + ' one master displayed scroll drives chapter, handoff and Engine B targets', async () => {
    const saved = new Map(), rafs = new Map(), timers = new Map(), events = new Map()
    const install = (key, value) => { saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }) }
    const ch = mobile ? SEQUENCE_SCROLL.chapterMobile : SEQUENCE_SCROLL.chapterDesktop
    const tr = mobile ? SEQUENCE_SCROLL.smokeMobile : SEQUENCE_SCROLL.smokeDesktop
    const sq = mobile ? SEQUENCE_SCROLL.sequenceMobile : SEQUENCE_SCROLL.sequenceDesktop
    let distance = ch, reads = 0, id = 1, renderer, time = 0, displayed, channelRef, unsubscribe, commits = 0, displayFrames = 0
    const region = { getBoundingClientRect() { reads++; return { top: -distance * 10, height: (100 + ch + tr + sq) * 10 } } }
    const stage = { dataset: {} }, image = { hidden: true, removeAttribute() {} }, videos = []
    const video = () => {
      const listeners = new Map()
      const node = { readyState: 0, paused: true, seeking: false, currentTime: 0, style: {}, canPlayType: () => 'probably',
        pause() { this.paused = true }, play: async () => {}, loads: 0, load() { this.loads++ }, removeAttribute() {},
        requestVideoFrameCallback: () => ++id, cancelVideoFrameCallback() {},
        addEventListener: (n, cb) => listeners.set(n, cb), removeEventListener: n => listeners.delete(n), listeners }
      videos.push(node); return node
    }
    install('IS_REACT_ACT_ENVIRONMENT', true)
    install('performance', new Proxy(globalThis.performance, { get(target, key) { if (key === 'now') return () => time; const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value } }))
    install('window', { innerWidth: mobile ? 390 : 3840, innerHeight: 1000, devicePixelRatio: 1, location: { search: '' },
      matchMedia: query => ({ matches: mobile && query === '(max-width: 900px)' }),
      requestAnimationFrame: cb => { rafs.set(++id, cb); return id }, cancelAnimationFrame: key => rafs.delete(key),
      addEventListener(n, cb) { if (!events.has(n)) events.set(n, new Set()); events.get(n).add(cb) }, removeEventListener(n, cb) { events.get(n)?.delete(cb); if (!events.get(n)?.size) events.delete(n) } })
    install('navigator', { maxTouchPoints: 0 })
    install('ResizeObserver', class { observe() {} disconnect() {} })
    install('HTMLVideoElement', class { requestVideoFrameCallback() {} })
    install('requestAnimationFrame', cb => { rafs.set(++id, cb); return id })
    install('cancelAnimationFrame', key => rafs.delete(key))
    install('setTimeout', cb => { timers.set(++id, cb); return id })
    install('clearTimeout', key => timers.delete(key))
    function Page() {
      const ref = React.useRef(region), shared = React.useRef(null)
      const state = useScroll(ref, false, shared)
      React.useLayoutEffect(() => { displayed = state; channelRef = shared; commits++ }, [state, shared])
      return React.createElement(Sequence, { displayScrollRef: shared, sequenceProgress: state.sequenceProgress, transitionProgress: state.transitionProgress })
    }
    const flush = async () => act(async () => { displayFrames++; time += 1000 / 75; for (const [key, cb] of [...rafs]) { rafs.delete(key); cb(time) } })
    const settle = async () => { for (let n = 0; n < 80 && rafs.size; n++) await flush(); assert.equal(rafs.size, 0, 'master and idle decoder sleep') }
    const input = async positions => act(async () => { for (const value of positions) { distance = value; for (const cb of events.get('scroll')) cb() } })
    try {
      await act(async () => { renderer = create(React.createElement(Page), { createNodeMock: el => el.type === 'video' ? video() : el.type === 'img' ? image : stage }); await Promise.resolve() })
      assert.equal(videos.length, 2)
      assert.equal(events.get('scroll').size, 1, 'video has no independent native scroll listener')
      unsubscribe = channelRef.current.subscribe(state => {
        if (state.transitionProgress < 1) assert.equal(stage.dataset.target, '1', 'frame zero locked to the displayed handoff')
      })
      const initialReads = reads, initialPending = rafs.size, initialCommits = commits
      await input(Array.from({ length: 300 }, (_, n) => ch + tr * n / 300))
      assert.equal(reads, initialReads); assert.equal(commits, initialCommits); assert.equal(rafs.size, initialPending + 1)
      await flush(); assert.equal(reads, initialReads + 1); assert.equal(commits, initialCommits + 1); assert.equal(stage.dataset.target, '1')
      await settle(); assert.equal(reads, initialReads + 1, 'catch-up reuses sampled geometry')
      await input([ch + tr]); await settle(); assert.equal(stage.dataset.target, '1')
      await input([ch + tr + sq * .8, ch + tr + sq * .4, ch + tr + sq * .1]); await flush()
      if (!mobile) assert.ok(displayed.sequenceProgress > 0 && displayed.sequenceProgress < .1, 'video and chapters share intermediate displayed positions')
      await settle(); assert.equal(stage.dataset.target, '49'); assert.ok(Math.abs(displayed.sequenceProgress - .1) < 1e-9)
      await input([ch + tr - .01]); await settle(); assert.equal(stage.dataset.target, '1')
      assert.ok(commits - initialCommits <= displayFrames, 'at most one changed state commit per master frame')
      assert.ok(videos.every(node => node.loads === 1), 'smoothing never reinstalls the video source')
      console.log(JSON.stringify({ scope: 'shared master component harness, not actual page/browser trace', mobile, nativeScrollListeners: events.get('scroll').size, layoutReads: reads, displayFrames, phaseCommits: commits }))
      await input([ch + tr + sq])
    } finally {
      unsubscribe?.()
      if (renderer) await act(async () => renderer.unmount())
      if (channelRef) assert.equal(channelRef.current, null)
      assert.equal(rafs.size + timers.size + events.size, 0)
      for (const node of videos) assert.equal(node.listeners.size, 0)
      for (const [key, desc] of saved) { if (desc) Object.defineProperty(globalThis, key, desc); else delete globalThis[key] }
    }
  })
}
