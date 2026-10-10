export let cinematicTelemetry = null
export const TELEMETRY_SCHEMAS = {
  sample: ['gapMs', 'scrollY', 'masterProgress', 'smokeRequested', 'smokeProgress', 'phase', 'requestedFrame', 'availableFrame', 'drawnFrame', 'visible', 'opacity', 'rifeTarget', 'rifePresented', 'forwardTime', 'forwardSeeking', 'forwardReady', 'forwardNetwork', 'reverseTime', 'reverseSeeking', 'reverseReady', 'reverseNetwork'],
  decode: ['frame', 'elapsedMs', 'retained'], draw: ['frame', 'elapsedMs'], gate: ['requestedProgress', 'displayProgress', 'reason'],
  host: ['visible', 'opacity'], media: ['direction', 'event', 'time', 'ready', 'network'], watchdog: ['direction', 'requestedFrame'], recovery: ['direction', 'completedFrame', 'latestTarget'], longtask: ['startPerformanceMs', 'durationMs'], memory: ['usedJSHeapBytes'],
}
export function createTelemetryBuffer({ capacity = 4096, now = () => performance.now() } = {}) {
  const rows = new Array(capacity)
  let cursor = 0, count = 0, dropped = 0, active = false, started = 0, ended = 0
  return {
    start() { if (!active && !count) { started = now(); active = true } },
    stop() { if (active) ended = now(); active = false },
    get active() { return active },
    record(kind, ...values) { if (!active) return; rows[cursor] = [Math.round((now() - started) * 10) / 10, kind, ...values]; cursor = (cursor + 1) % capacity; if (count < capacity) count++; else dropped++ },
    export() { return { schema: TELEMETRY_SCHEMAS, capacity, dropped, startPerformanceMs: started, durationMs: count ? (ended || now()) - started : 0, records: Array.from({ length: count }, (_, i) => rows[(cursor - count + i + capacity) % capacity]) } },
  }
}
export function startCinematicTelemetry() {
  if (typeof window === 'undefined' || new URLSearchParams(window.location.search).get('cinematicTelemetry') !== '1') return undefined
  const buffer = createTelemetryBuffer(), phaseCodes = { CHAPTER: 0, SMOKE_PRE_COVER: 1, SMOKE_POST_COVER: 2, SMOKE_REVEAL: 3, RIFE: 4 }
  let state = {}, requested = -1, available = -1, drawn = -1, last = 0, raf = 0, started = 0, lastInput = 0, lastPosition = -1, lastStyle = 0, lastMemory = 0, finished = false
  const gaps = { 33: 0, 50: 0, 100: 0, 250: 0 }, videoStops = [], metadata = { viewport: [innerWidth, innerHeight, devicePixelRatio], deviceMemory: navigator.deviceMemory ?? null, hardwareConcurrency: navigator.hardwareConcurrency ?? null, longtaskSupported: false, thermalAvailable: false }
  const box = document.createElement('div'), status = document.createElement('span')
  box.style.cssText = 'position:fixed;bottom:10px;left:10px;z-index:9999;display:flex;gap:6px;align-items:center;max-width:calc(100vw - 20px);padding:8px;background:#fff;color:#333;font:12px sans-serif;border:1px solid #aaa'
  status.textContent = 'QA: waiting for smoke'; box.append(status)
  function snapshot() { buffer.stop(); finished = true; status.textContent = 'QA: captured'; return { version: 1, metadata, phaseCodes, gapCounts: gaps, ...buffer.export(), limits: ['rAF is not display presentation', 'async decode elapsed is not CPU time', 'thermal/GPU pressure not directly observable', 'media events are passive; no seek/play override'] } }
  function button(label, action) { const b = document.createElement('button'); b.textContent = label; b.type = 'button'; b.onclick = action; box.append(b) }
  button('Copy JSON', async () => { const text = JSON.stringify(snapshot()); try { await navigator.clipboard.writeText(text); status.textContent = 'QA: copied' } catch { const area = document.createElement('textarea'); area.value = text; area.style.cssText = 'position:fixed;inset:15%;z-index:10000'; area.setAttribute('aria-label', 'Telemetry JSON — select and copy'); box.append(area); area.select(); button('Close JSON', () => area.remove()) } })
  button('Download JSON', () => { const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot())], { type: 'application/json' })), a = document.createElement('a'); a.href = url; a.download = 'cinematic-phone-telemetry.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) })
  document.body.append(box)
  cinematicTelemetry = {
    record: (...args) => buffer.record(...args),
    smokeFrame(req, ready, current) { requested = req; available = ready ? req : -1; drawn = current },
    observe(next) { state = next; if (!finished && !buffer.active && (next.chapterProgress >= .96 || next.requestedProgress > 0)) { buffer.start(); started = performance.now(); lastInput = started; status.textContent = 'QA: recording' } },
  }
  let observer
  try { observer = new PerformanceObserver(list => { for (const e of list.getEntries()) if (buffer.active) buffer.record('longtask', e.startTime, e.duration) }); observer.observe({ type: 'longtask' }); metadata.longtaskSupported = true } catch { /* Safari may not expose longtask */ }
  let videos = [], sequence = null, host = null, visible = 0, opacity = 0
  function tick(at) {
    if (buffer.active) {
      if (!videos.length) { videos = [...document.querySelectorAll('.scroll-frame-sequence-stage video')]; for (const video of videos) for (const event of ['seeking', 'waiting', 'stalled', 'seeked', 'playing', 'error']) { const listener = () => buffer.record('media', video.dataset.direction === 'reverse' ? 1 : 0, event, video.currentTime, video.readyState, video.networkState); video.addEventListener(event, listener); videoStops.push(() => video.removeEventListener(event, listener)) } }
      sequence ||= document.querySelector('.scroll-frame-sequence-stage'); host ||= document.querySelector('.lab-hfinal-smoke')
      if (at - lastStyle > 500 && host) { const style = getComputedStyle(host); visible = style.visibility === 'visible' ? 1 : 0; opacity = Number(style.opacity); buffer.record('host', visible, opacity); lastStyle = at }
      const gap = last ? at - last : 0; for (const threshold of [33, 50, 100, 250]) if (gap >= threshold) gaps[threshold]++
      const videoValues = videos.flatMap(v => [v.currentTime, v.seeking ? 1 : 0, v.readyState, v.networkState]); while (videoValues.length < 8) videoValues.push(-1)
      buffer.record('sample', gap, scrollY, state.totalProgress ?? -1, state.requestedProgress ?? 0, state.progress ?? 0, phaseCodes[state.phase] ?? -1, requested, available, drawn, visible, opacity, Number(sequence?.dataset.target ?? -1), Number(sequence?.dataset.presented ?? -1), ...videoValues)
      if (at - lastMemory > 1000 && performance.memory) { buffer.record('memory', performance.memory.usedJSHeapSize); lastMemory = at }
      if (state.targetPosition !== lastPosition) { lastPosition = state.targetPosition; lastInput = at }
      if (at - started > 45000 || state.sequenceProgress > .08 || state.phase === 'RIFE' && at - lastInput > 2500) snapshot()
    }
    last = buffer.active ? at : 0
    if (!finished) raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
  return () => { cancelAnimationFrame(raf); observer?.disconnect(); videoStops.forEach(stop => stop()); buffer.stop(); cinematicTelemetry = null; box.remove() }
}
