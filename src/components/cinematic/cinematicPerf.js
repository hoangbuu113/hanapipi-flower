
const quantile = (values, p) => {
  const a = values.slice().sort((x, y) => x - y)
  return a.length ? a[Math.min(a.length - 1, Math.floor((a.length - 1) * p))] : 0
}
export function createCinematicPerf(win, stage, now = () => performance.now()) {
  const rows = { input: [], cancel: [], scroll: [], target: [], writes: [], media: [], presented: [], raf: [], memory: [], marks: [], longTasks: [], stalls: [], decoded: [], video: [], work: [], react: [] }
  const push = (name, row) => { const a = rows[name]; a.push({ t: now(), ...row }); if (a.length > 12000) a.splice(0, a.length - 12000) }
  const events = new WeakMap(), retained = new Set(), lastRaf = new Map(), lastPresented = new Map()
  let controller, engine = {}, scroll = {}, disposed = false, smokeStore, videoEngine, touchY = null
  const owner = () => { const s = controller?.getSnapshot(); return !s ? 'chapter' : s.gated || s.visible ? 'smoke' : s.phase === 'RIFE' ? 'RIFE' : 'chapter' }
  const stats = () => ({ decoded: retained.size, retained: retained.size, estimatedBytes: retained.size * 960 * 540 * 4, mounted: Boolean(stage()?.querySelector('.lab-hfinal-smoke')) })
  const api = {
    work(name, value = {}) { push('work', { name, owner: owner(), ...value }) },
    react(id, phase, actualDuration, startTime, commitTime) { push('react', { id, phase, actualDuration, startTime, commitTime, owner: owner() }) },
    rows, owner, registerEngine(value) { videoEngine = value }, decoded(value) { push('decoded', value) }, registerController(value) { controller = value }, registerSmokeStore(value) { smokeStore = value },
    // Explicit DEV-only counterfactual, never automatic production policy.
    boundSmokeForComparison() { smokeStore?.setMobile(true); api.mark('counterfactual-bounded-smoke') },
    mark(name) { push('marks', { name, owner: owner(), memory: stats(), smoke: controller?.getSnapshot() }) },
    scroll(position, sample) { scroll = { native: win.scrollY, target: sample.position, displayed: position, gap: Math.abs(sample.position - position), targetProgress: sample.position / sample.travel, displayedProgress: position / sample.travel, response: sample.response, effectiveResponse: sample.effectiveResponse ?? sample.response, travel: sample.travel }; push('scroll', scroll) },
    target(progress, frame, fps) { push('target', { progress, frame, desiredTime: frame / fps, owner: owner() }) },
    engine(value) { engine = { ...value } },
    present(frame) { push('presented', { frame, target: videoEngine?.getState?.().target ?? engine.target, owner: owner() }); lastPresented.set(owner(), { t: now(), frame }) },
    raf(name, at, queuedAt, workMs) { const previous = lastRaf.get(name); push('raf', { name, interval: previous === undefined ? null : at - previous, continuous: previous !== undefined && queuedAt - previous < 20, queueMs: Math.max(0, at - queuedAt), workMs }); lastRaf.set(name, at) },
    cancelIntent(event, reason) { push('cancel', { event: event.type, cancelable: event.cancelable, owner: owner(), kind: 'intent', reason }) },
    snapshot() { return { userAgent: win.navigator.userAgent, viewport: { width: win.innerWidth, height: win.innerHeight, dpr: win.devicePixelRatio }, rows: Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.slice()])), engine: videoEngine?.getState?.() || { ...engine }, scroll: { ...scroll }, memory: stats(), smoke: controller?.getSnapshot(), videos: [...stage()?.querySelectorAll('video') || []].map(v => ({ direction: v.dataset.direction, currentTime: v.currentTime, readyState: v.readyState, networkState: v.networkState, seeking: v.seeking, paused: v.paused, src: v.currentSrc })) } },
    display() {
      const at = now(), recent = name => rows[name].filter(r => r.t >= at - 1000)
      const wheel = recent('input').filter(r => r.event === 'wheel'), video = [...stage()?.querySelectorAll('video') || []][engine.active === 'reverse' ? 1 : 0]
      const raf = recent('raf').filter(r => r.continuous).map(r => r.interval), memory = stats(), cancels = rows.cancel.filter(r => r.kind === 'call')
      return `INPUT wheel/s=${wheel.length} avg=${(wheel.reduce((sum, r) => sum + Math.abs(r.normalizedDelta), 0) / (wheel.length || 1)).toFixed(0)} max=${Math.max(0, ...wheel.map(r => Math.abs(r.normalizedDelta))).toFixed(0)} owner=${owner()}\nSCROLL target=${(scroll.target || 0).toFixed(0)} display=${(scroll.displayed || 0).toFixed(0)} gap=${(scroll.gap || 0).toFixed(0)}px response=${scroll.response ?? '-'}ms\nRIFE target=${(engine.target || 0).toFixed(3)} current=${video?.currentTime.toFixed(3) || '-'} desired/s=${recent('target').length} writes/s=${recent('writes').length} seek/seeked=${recent('media').filter(r => r.event === 'seeking').length}/${recent('media').filter(r => r.event === 'seeked').length} ready=${video?.readyState ?? '-'} seeking=${video?.seeking ?? '-'}\nH-FINAL decoded/retained=${memory.decoded}/${memory.retained} RGBA≈${(memory.estimatedBytes / 1048576).toFixed(1)}MiB mounted=${memory.mounted}\nRAF active p95=${quantile(raf, .95).toFixed(1)} worst=${Math.max(0, ...raf).toFixed(1)}ms\nCANCEL attempts=${rows.cancel.filter(r => r.kind === 'intent').length} true calls=${cancels.filter(r => r.cancelable).length} false calls=${cancels.filter(r => !r.cancelable).length} false skipped=${rows.cancel.filter(r => r.kind === 'intent' && !r.cancelable).length - cancels.filter(r => !r.cancelable).length}`
    },
  }
  const input = event => {
    if (!stage()) return
    const rect = stage().getBoundingClientRect(); if (rect.top > 1 || rect.bottom < win.innerHeight - 1) return
    let delta = event.deltaY || 0
    if (event.type === 'touchstart') touchY = event.touches[0]?.clientY ?? null
    if (event.type === 'touchmove') { const y = event.touches[0]?.clientY; delta = touchY === null ? 0 : touchY - y; touchY = y }
    const normalizedDelta = event.deltaMode === 1 ? delta * 16 : event.deltaMode === 2 ? delta * win.innerHeight : delta
    const row = { event: event.type, delta, normalizedDelta, deltaMode: event.deltaMode || 0, cancelable: event.cancelable, owner: owner(), prevented: false }; push('input', row); events.set(event, rows.input.at(-1))
  }
  const inputTypes = ['wheel', 'touchstart', 'touchmove', 'touchend', 'keydown']
  inputTypes.forEach(type => win.addEventListener(type, input, { capture: true, passive: true }))
  const prevent = win.Event.prototype.preventDefault
  function observedPrevent() { if (events.has(this)) { push('cancel', { event: this.type, cancelable: this.cancelable, owner: owner(), kind: 'call' }); events.get(this).prevented = this.cancelable } return prevent.call(this) }
  win.Event.prototype.preventDefault = observedPrevent
  const descriptor = Object.getOwnPropertyDescriptor(win.HTMLMediaElement.prototype, 'currentTime')
  const write = function(value) { if (this.closest('.lab-stage')) push('writes', { video: this.dataset.direction || (this === stage()?.querySelector('video') ? 'forward' : 'reverse'), desired: value, before: descriptor.get.call(this), whileSeeking: this.seeking, readyState: this.readyState, owner: owner() }); return descriptor.set.call(this, value) }
  Object.defineProperty(win.HTMLMediaElement.prototype, 'currentTime', { ...descriptor, set: write })
  const decode = win.createImageBitmap, close = win.ImageBitmap.prototype.close
  async function observedDecode(...args) { const image = await decode.apply(win, args); if (!disposed && image.width === 960 && image.height === 540) { retained.add(image); push('memory', stats()) } return image }
  function observedClose() { if (retained.delete(this)) push('memory', stats()); return close.call(this) }
  win.createImageBitmap = observedDecode; win.ImageBitmap.prototype.close = observedClose
  const mediaTypes = ['seeking', 'seeked', 'waiting', 'stalled', 'loadeddata', 'canplay', 'playing', 'timeupdate', 'error']
  const media = event => { const v = event.target; if (v.tagName !== 'VIDEO' || !v.closest('.lab-stage')) return; push('media', { event: event.type, video: v === stage()?.querySelector('video') ? 'forward' : 'reverse', currentTime: v.currentTime, readyState: v.readyState, networkState: v.networkState, paused: v.paused, seeking: v.seeking, error: v.error?.message }) }
  mediaTypes.forEach(type => win.document.addEventListener(type, media, true))
  const stallState = new Map()
  const timer = win.setInterval(() => {
    push('memory', stats())
    const detail = videoEngine?.getState?.()
    for (const [index, v] of [...stage()?.querySelectorAll('video') || []].entries()) {
      const direction = index ? 'reverse' : 'forward', active = engine.active === direction && owner() === 'RIFE'
      const mediaTime = direction === 'reverse' ? 10 - v.currentTime - 1 / 48 : v.currentTime
      const previous = stallState.get(v), presented = lastPresented.get('RIFE')
      push('video', { direction, active, currentTime: v.currentTime, desiredTime: engine.target, presented: presented?.frame, readyState: v.readyState, networkState: v.networkState, seeking: v.seeking, paused: v.paused, lastAppliedTime: rows.writes.findLast(row => row.video === direction)?.desired, pending: detail?.pending, seek: detail?.seeks?.[direction], gap: scroll.gap })
      const mismatch = Math.abs((engine.target || 0) - mediaTime) > .10 || (presented && Math.abs((engine.target || 0) - presented.frame / 48) > .10)
      const current = { time: v.currentTime, frame: presented?.frame, stillSince: previous?.stillSince ?? now(), start: previous?.start }
      if (!previous || previous.frame !== current.frame || (!v.requestVideoFrameCallback && previous.time !== current.time) || !active || !mismatch) {
        if (current.start !== undefined) push('stalls', { event: 'end', video: direction, start: current.start, duration: now() - current.start, currentTime: v.currentTime, desiredTime: engine.target, readyState: v.readyState, seeking: v.seeking, gap: scroll.gap })
        current.stillSince = now(); current.start = undefined
      } else if (now() - current.stillSince >= 250 && current.start === undefined) { current.start = current.stillSince; push('stalls', { event: 'start', video: direction, start: current.start, desiredTime: engine.target, currentTime: v.currentTime, readyState: v.readyState, seeking: v.seeking, gap: scroll.gap }) }
      stallState.set(v, current)
    }
  }, 100)
  let observer
  try { observer = new win.PerformanceObserver(list => list.getEntries().forEach(e => push('longTasks', { start: e.startTime, duration: e.duration, owner: owner() }))); observer.observe({ type: 'longtask', buffered: false }) } catch { /* unsupported browser */ }
  api.dispose = () => {
    disposed = true; win.clearInterval(timer); observer?.disconnect(); inputTypes.forEach(type => win.removeEventListener(type, input, true)); mediaTypes.forEach(type => win.document.removeEventListener(type, media, true))
    if (win.Event.prototype.preventDefault === observedPrevent) win.Event.prototype.preventDefault = prevent
    if (Object.getOwnPropertyDescriptor(win.HTMLMediaElement.prototype, 'currentTime').set === write) Object.defineProperty(win.HTMLMediaElement.prototype, 'currentTime', descriptor)
    if (win.createImageBitmap === observedDecode) win.createImageBitmap = decode
    if (win.ImageBitmap.prototype.close === observedClose) win.ImageBitmap.prototype.close = close
    retained.clear(); if (win.__CINEMATIC_PERF__ === api) delete win.__CINEMATIC_PERF__
  }
  win.__CINEMATIC_PERF__ = api; api.mark('mount'); return api
}
