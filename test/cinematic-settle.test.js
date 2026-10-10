import assert from 'node:assert/strict'
import test from 'node:test'
import { register } from 'node:module'
register('./cart-component-loader.js', import.meta.url)
const React = await import('react')
const { act, create } = await import('react-test-renderer')
const ScrollFrameSequence = (await import('../src/components/cinematic/ScrollFrameSequence.jsx')).default
const { prewarmReverseVideo } = await import('../src/components/cinematic/videoSequence.js')

async function harness(frame, mobile = false, channelMode = false) {
  const saved = new Map(), rafs = new Map(), timers = new Map(), events = new Map(), requests = [], revoked = []
  let id = 0, renderer, currentTime = 0, pendingSeek = false
  const listeners = new Set(); let snapshot = { sequenceProgress: frame / 480, transitionProgress: channelMode ? 0 : 1 }
  const channel = { getSnapshot: () => snapshot, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) } }
  const displayScrollRef = channelMode ? { current: channel } : undefined
  const install = (key, value) => { saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }) }
  const stage = { dataset: {}, closest: () => ({}) }
  const image = { hidden: true, removeAttribute() { delete this.src }, async decode() {} }
  const video = { readyState: 0, seeking: false, get currentTime() { return currentTime }, set currentTime(value) { currentTime = value; pendingSeek = true; this.seeking = true }, style: {}, canPlayType: () => 'probably',
    addEventListener(n, f) { events.set(n, f) }, removeEventListener(n) { events.delete(n) }, removeAttribute() { delete this.src },
    load() { if (this.src) { this.readyState = 2; events.get('loadeddata')?.() } },
  }
  install('IS_REACT_ACT_ENVIRONMENT', true)
  install('window', { innerWidth: mobile ? 390 : 3840, innerHeight: mobile ? 844 : 2160, devicePixelRatio: mobile ? 3 : 1,
    location: { search: '' }, matchMedia: () => ({ matches: mobile }), addEventListener() {}, removeEventListener() {} })
  install('navigator', { maxTouchPoints: mobile ? 5 : 0 })
  install('HTMLVideoElement', class {})
  install('requestAnimationFrame', cb => { rafs.set(++id, cb); return id })
  install('cancelAnimationFrame', n => rafs.delete(n))
  install('setTimeout', (cb, ms) => { timers.set(++id, { cb, ms }); return id })
  install('clearTimeout', n => timers.delete(n))
  install('fetch', (url, options) => new Promise(resolve => requests.push({ url, options, resolve })))
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL
  URL.createObjectURL = () => 'blob:test-master'
  URL.revokeObjectURL = url => revoked.push(url)
  const flush = async () => { for (let n = 0; n < 5; n++) { for (const [key, cb] of [...rafs]) { rafs.delete(key); cb(performance.now()) } if (pendingSeek) { pendingSeek = false; video.seeking = false; events.get('seeked')?.() } } }
  const tickSettle = async () => { for (const [key, timer] of [...timers]) if (timer.ms === 160) { timers.delete(key); timer.cb() } await Promise.resolve() }
  const render = async (next, transitionProgress = channelMode ? 0 : 1) => { await act(async () => { const element = React.createElement(ScrollFrameSequence, { sequenceProgress: next / 480, transitionProgress, displayScrollRef }); if (renderer) renderer.update(element); else renderer = create(element, { createNodeMock: el => el.type === 'video' ? video : el.type === 'img' ? image : stage }); await Promise.resolve() }); await act(async () => { await flush() }) }
  const emit = async (next, transitionProgress) => { snapshot = { sequenceProgress: next / 480, transitionProgress }; await act(async () => { listeners.forEach(fn => fn(snapshot)); await flush() }) }
  const close = async () => { await act(async () => renderer?.unmount()); URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; for (const [key, desc] of saved) { if (desc) Object.defineProperty(globalThis, key, desc); else delete globalThis[key] } }
  try { await render(frame) } catch (error) { await close(); throw error }
  return { stage, image, video, timers, rafs, requests, revoked, render, emit, tickSettle, close }
}

test('synthetic idle retains RIFE; real idle requests the mapped4K master and cleanup revokes it', async () => {
  const h = await harness(289)
  try {
    await h.tickSettle()
    assert.equal(h.requests.length, 0)
    assert.equal(h.stage.dataset.settle, 'rife-midpoint')
    assert.equal(h.image.hidden, true)
    await h.render(288); await h.tickSettle()
    assert.equal(h.requests.length, 1)
    assert.equal(h.requests[0].url, '/media/hutflower/scroll-sequence/frame_00181.jpg')
    h.requests[0].resolve({ ok: true, blob: async () => new Blob(['master']) })
    await act(async () => { await Promise.resolve() })
    assert.equal(h.image.hidden, false)
    assert.equal(h.stage.dataset.settle, '181')
  } finally { await h.close() }
  assert.equal(h.image.hidden, true)
  assert.deepEqual(h.revoked, ['blob:test-master'])
  assert.equal(h.timers.size + h.rafs.size, 0)
})

test('movement aborts stale master requests and mobile never fetches a4K settle', async () => {
  const h = await harness(288)
  try {
    await h.tickSettle(); assert.equal(h.requests.length, 1)
    await h.render(289)
    assert.equal(h.requests[0].options.signal.aborted, true)
    h.requests[0].resolve({ ok: true, blob: async () => new Blob(['old']) })
    await act(async () => { await Promise.resolve() })
    assert.equal(h.image.hidden, true)
    assert.equal(h.stage.dataset.settle, 'rife-midpoint')
  } finally { await h.close() }
  const phone = await harness(288, true)
  try { await phone.tickSettle(); assert.equal(phone.requests.length, 0); assert.equal(phone.image.hidden, true); assert.equal(phone.stage.dataset.tier, '1080p') } finally { await phone.close() }
})


test('master channel entering RIFE at unchanged frame0 still supplies the full-quality4K settle', async () => {
 const h = await harness(0, false, true)
 try {
  await h.tickSettle(); assert.equal(h.requests.length,0)
  await h.emit(0,1); await h.tickSettle(); assert.equal(h.requests.length,1)
  assert.match(h.requests[0].url,/frame_00001\.jpg$/)
  h.requests[0].resolve({ok:true,blob:async()=>new Blob(['frame0'])})
  await act(async()=>{await Promise.resolve()});assert.equal(h.image.hidden,false)
  await h.emit(0,1);await h.tickSettle();assert.equal(h.requests.length,1,'same target does not refetch or postpone')
  await h.emit(0,.8);assert.equal(h.image.hidden,true)
 } finally { await h.close() }
 assert.equal(h.timers.size+h.rafs.size,0)
})

test('reverse prewarm at held frame0 is idempotent, preserves the buffer on reversal, and handles skipped handoff', () => {
 let preload = 'metadata', writes = 0
 const video = { src: 'accepted-reverse.mp4', currentTime: 0, load() { assert.fail('preload must not reload or reset the decoder') },
  get preload() { return preload }, set preload(value) { preload=value; writes++ } }
 for (const phase of [0,.4,.74]) prewarmReverseVideo(video, phase, 0)
 assert.equal(writes,0)
 prewarmReverseVideo(video,.75,0);assert.equal(preload,'auto')
 for (const phase of [.8,.9,1,.9,.5,0]) prewarmReverseVideo(video,phase,0)
 assert.equal(writes,1);assert.equal(video.src,'accepted-reverse.mp4');assert.equal(video.currentTime,0)
 preload='metadata';prewarmReverseVideo(video,0,.01);assert.equal(preload,'auto');assert.equal(writes,2)
 prewarmReverseVideo(null,1,1)
})
