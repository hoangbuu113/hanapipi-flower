import { H_FINAL_TIMELINE } from './hFinalSmokeTimeline.js'
export { H_FINAL_TIMELINE }
export const MOBILE_SMOKE_WINDOW = 24
export function hFinalFrameAt(time, timeline = H_FINAL_TIMELINE) {
  let lo = 0, hi = timeline.frames.length
  while (lo + 1 < hi) {
    const mid = (lo + hi) >>> 1
    if (timeline.frames[mid].pts <= time + 1e-9) lo = mid
    else hi = mid
  }
  return lo
}
export function hFinalCover(width, height) {
  const scale = Math.max(width / 960, height / 540)
  return { width: 960 * scale, height: 540 * scale, left: (width - 960 * scale) / 2, top: (height - 540 * scale) / 2 }
}
export function hFinalWindow(index, direction = 1, count = 88) {
  const start = Math.max(0, Math.min(count - MOBILE_SMOKE_WINDOW, direction < 0 ? index - MOBILE_SMOKE_WINDOW + 4 : index - 3))
  return Array.from({ length: Math.min(MOBILE_SMOKE_WINDOW, count) }, (_, i) => start + i)
}
// Encoded PNGs preload once. Active desktop retains all decoded frames; mobile retains
// a 24-frame window plus the last drawn frame. There is no playback clock here.
export function createHFinalFrameStore({ mobile = false, timeline = H_FINAL_TIMELINE,
  fetchFrame = (url, options) => fetch(url, options), decodeFrame = blob => createImageBitmap(blob),
  now = () => performance.now(), onReady = () => {}, onChange = () => {}, onError = () => {}, timeout = 15000 } = {}) {
  const abort = new AbortController(), blobs = [], images = new Map(), inFlight = new Set()
  const stats = { total: timeline.frames.length, fetched: 0, decoded: 0, decodeCount: 0, failures: [], ready: false, preloadMs: null, peakDecoded: 0, encodedBytes: 0, mobile }
  const started = now()
  let dormant = false, disposed = false, failed = false, ready = false, loading = false, anchor = 0, direction = 1, held = -1
  let wanted = new Set(mobile ? hFinalWindow(0, 1, stats.total) : timeline.frames.map((_, i) => i))
  const notify = () => { stats.decoded = images.size; stats.decodedMemoryEstimate = images.size * 960 * 540 * 4; stats.peakDecoded = Math.max(stats.peakDecoded, images.size); onChange({ ...stats }) }
  const fail = error => { if (disposed || failed) return; failed = true; abort.abort(); stats.failures.push(error.message || String(error)); notify(); onError(error) }
  const evict = () => { for (const [i, image] of images) if (!wanted.has(i) && i !== held) { image.close(); images.delete(i) } }
  const checkReady = () => {
    if (!ready && stats.fetched === stats.total && [...wanted].every(i => images.has(i))) {
      ready = stats.ready = true; stats.preloadMs = now() - started; clearTimeout(deadline)
      onReady({ ready: true, canPresent: progress => canPresent(hFinalFrameAt(progress * timeline.duration)) })
    }
  }
  async function decode(i) {
    inFlight.add(i)
    try {
      const image = await decodeFrame(blobs[i])
      if (disposed || failed || (!wanted.has(i) && i !== held)) { image.close(); return }
      if (image.width !== 960 || image.height !== 540) { image.close(); throw new Error(`H-final frame ${i + 1} dimensions`) }
      images.set(i, image); stats.decodeCount++; evict(); notify(); checkReady()
    } catch (error) { fail(error) }
    finally { inFlight.delete(i); pump() }
  }
  function pump() {
    if (disposed || failed || stats.fetched !== stats.total) return
    if (dormant || images.size >= wanted.size && [...wanted].every(i => images.has(i))) return
    const neighbors = [...wanted].filter(i => i !== anchor && !images.has(i) && !inFlight.has(i)).sort((a, b) => Math.abs(a - anchor) - Math.abs(b - anchor) || direction * (b - a))
    for (const i of [anchor, ...neighbors]) if (inFlight.size < 4 && blobs[i] && !images.has(i) && !inFlight.has(i)) void decode(i)
  }
  function request(index) {
    if (dormant) setDormant(false)
    if (index === anchor) return
    if (index !== anchor) direction = index < anchor ? -1 : 1
    anchor = index
    if (mobile) wanted = new Set(hFinalWindow(index, direction, stats.total))
    evict(); pump()
  }
  function setDormant(value) {
    if (dormant === value || disposed) return
    dormant = value; stats.dormant = value
    if (value) held = -1
    wanted = new Set(value ? [] : mobile ? hFinalWindow(anchor, direction, stats.total) : timeline.frames.map((_, i) => i))
    evict(); notify(); pump()
  }
  function canPresent(index) { if (disposed || failed) return false; request(index); return images.has(index) }
  const deadline = setTimeout(() => fail(new Error('H-final preload timeout')), timeout)
  return {
    async load() {
      if (loading || disposed) return
      loading = true; let cursor = 0
      try {
        await Promise.all(Array.from({ length: 4 }, async () => {
          while (!disposed && !failed && cursor < stats.total) {
            const i = cursor++, response = await fetchFrame(timeline.base + timeline.frames[i].file, { signal: abort.signal })
            if (!response.ok) throw new Error(`H-final frame ${i + 1}: HTTP ${response.status}`)
            const blob = await response.blob()
            if (disposed || failed) return
            blobs[i] = blob; stats.fetched++; stats.encodedBytes += blob.size; notify()
          }
        }))
        pump()
      } catch (error) { fail(error) }
    },
    get: index => images.get(index), canPresent, setDormant,
    hold(index) { if (held !== index) { held = index; if (mobile) evict() } },
    setMobile(value) { if (mobile === value) return; mobile = value; stats.mobile = value; wanted = new Set(dormant ? [] : value ? hFinalWindow(anchor, direction, stats.total) : timeline.frames.map((_, i) => i)); evict(); notify(); pump() },
    getStats: () => ({ ...stats, decoded: images.size, decodedMemoryEstimate: images.size * 960 * 540 * 4 }),
    dispose() { disposed = true; clearTimeout(deadline); abort.abort(); for (const image of images.values()) image.close(); images.clear(); blobs.length = 0 },
  }
}
