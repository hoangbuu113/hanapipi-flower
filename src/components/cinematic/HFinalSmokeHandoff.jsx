import { cinematicTelemetry } from './cinematicTelemetry.js'
import { memo, useEffect, useLayoutEffect, useRef } from 'react'
import { followSmokeChannel } from './smokeRendererUtils.js'
import { createHFinalFrameStore, hFinalCover, hFinalFrameAt, H_FINAL_TIMELINE } from './hFinalSmoke.js'
export default memo(function HFinalSmokeHandoff({ displayScrollRef, settings, debug = false, onReady, onFailure, onDiagnostics }) {
  const host = useRef(null), canvas = useRef(null), runtime = useRef(null), mobilePolicy = useRef(settings.mobile)
  useLayoutEffect(() => { mobilePolicy.current = settings.mobile; runtime.current?.setMobile(settings.mobile) }, [settings.mobile])
  useEffect(() => {
    const element = canvas.current, container = host.current, ctx = element.getContext('2d', { alpha: true })
    if (!ctx) { onFailure(); return undefined }
    let disposed = false, state = { progress: 0, visible: false }, lastIndex = -1, capability = null, lastVisible = null, targetIndex = -1
    const diagnostics = { transport: 'PNG_SEQUENCE', nativeDuration: H_FINAL_TIMELINE.duration, drawn: [], skipped: 0, maxDrawMs: 0 }
    const publishDiagnostics = () => { if (debug) onDiagnostics?.({ ...diagnostics, preload: store.getStats(), nativeFrame: lastIndex + 1 }) }
    function draw(force = false) {
      const index = hFinalFrameAt(state.virtualTime ?? state.progress * H_FINAL_TIMELINE.duration)
      if (lastVisible !== state.visible) container.style.visibility = state.visible ? 'visible' : 'hidden'
      container.dataset.renderer = 'h-final-png-sequence'
      if (targetIndex !== index) { container.dataset.targetFrame = String(index + 1); targetIndex = index }
      const requestedIndex = cinematicTelemetry ? hFinalFrameAt((state.requestedProgress ?? state.progress) * H_FINAL_TIMELINE.duration) : index
      cinematicTelemetry?.smokeFrame(requestedIndex + 1, Boolean(store.get(requestedIndex)), lastIndex + 1)
      const wasVisible = lastVisible; lastVisible = state.visible
      // Keep the reverse neighborhood hot; release decoded buffers only well
      // inside RIFE. Encoded PNGs and native timing remain unchanged.
      store.setDormant(state.sequenceProgress > .15)
      if (!state.visible) {
        if (wasVisible !== false) { ctx.clearRect(0, 0, 960, 540); lastIndex = -1; store.hold(-1) }
        publishDiagnostics(); return
      }
      const image = store.get(index)
      if (image && (force || index !== lastIndex)) {
        const start = performance.now()
        ctx.clearRect(0, 0, 960, 540); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(image, 0, 0)
        if (index !== lastIndex) {
          const previous = diagnostics.drawn.at(-1)
          if (previous !== undefined) diagnostics.skipped += Math.max(0, Math.abs(index - previous) - 1)
          diagnostics.drawn.push(index)
          if (diagnostics.drawn.length > 12000) diagnostics.drawn.shift()
        }
        diagnostics.maxDrawMs = Math.max(diagnostics.maxDrawMs, performance.now() - start)
        cinematicTelemetry?.record('draw', index + 1, performance.now() - start)
        cinematicTelemetry?.smokeFrame(requestedIndex + 1, Boolean(store.get(requestedIndex)), index + 1)
        lastIndex = index; container.dataset.nativeFrame = String(index + 1); store.hold(index)
      }
      publishDiagnostics()
    }
    const store = createHFinalFrameStore({ mobile: mobilePolicy.current,
      onReady: value => { if (!disposed) { capability = value; onReady(value) } },
      onError: error => { if (!disposed) { diagnostics.error = error.message; publishDiagnostics(); onFailure() } },
      // A newly decoded latest target can release a gate through the master
      // scheduler, including while native scroll is stopped. No renderer clock.
      onChange: () => { if (!disposed) { publishDiagnostics(); if (capability) onReady(capability) } },
    })
    runtime.current = store
    if (import.meta.env?.DEV) window.__CINEMATIC_PERF__?.registerSmokeStore(store)
    function resize() {
      const rect = container.getBoundingClientRect(), fit = hFinalCover(Math.max(1, rect.width), Math.max(1, rect.height))
      Object.assign(element.style, { width: `${fit.width}px`, height: `${fit.height}px`, left: `${fit.left}px`, top: `${fit.top}px` })
      diagnostics.viewport = { width: rect.width, height: rect.height, bufferWidth: 960, bufferHeight: 540, fit }; draw(true)
    }
    const observer = new ResizeObserver(resize); observer.observe(container); resize()
    const stop = followSmokeChannel(displayScrollRef.current, next => { state = next; draw() })
    void store.load()
    return () => { disposed = true; stop(); observer.disconnect(); store.dispose(); runtime.current = null; onReady({ ready: false }); ctx.clearRect(0, 0, 960, 540) }
  }, [displayScrollRef, debug, onReady, onFailure, onDiagnostics])
  return <div ref={host} className="lab-hfinal-smoke" aria-hidden="true"><canvas ref={canvas} width="960" height="540" /></div>
})
