import { lazy, Suspense, useCallback, useEffect, useMemo, useRef } from 'react'
import { followSmokeChannel } from './smokeRendererUtils.js'
import { H_FINAL_TIMELINE } from './hFinalSmoke.js'
import { SMOKE_TRANSITION_TIMING } from './smokeTransitionConfig.js'
const Renderer = lazy(() => import('./HFinalSmokeHandoff.jsx'))
export default function SmokeTransition({ active, mobile, channelRef, debug = false, onReady, onFailure }) {
  const settings = useMemo(() => ({ mobile }), [mobile])
  const output = useRef(null), measured = useRef(null), latest = useRef(null)
  const renderDebug = useCallback(() => {
    if (!debug || !output.current || !latest.current) return
    const s = latest.current, data = measured.current, preload = data?.preload
    const stage = output.current.closest('.lab-stage')?.querySelector('.scroll-frame-sequence-stage')
    output.current.textContent = `SCROLL target=${s.targetPosition?.toFixed(0) || '-'} display=${s.displayedPosition?.toFixed(0) || '-'} gap=${s.gap?.toFixed(0) || '0'}px\nH-FINAL SCROLL · ${s.phase} · gate=${s.gated || '-'}\nrunway=${s.smokeStart?.toFixed(0) || '-'}..${s.smokeEnd?.toFixed(0) || '-'}px · target=${s.requestedProgress.toFixed(4)} display=${s.progress.toFixed(4)}\nvirtual=${s.virtualTime.toFixed(6)}s · N${data?.nativeFrame || s.nativeFrame}/88 · swap=${SMOKE_TRANSITION_TIMING.swap.toFixed(6)} reveal=${SMOKE_TRANSITION_TIMING.reveal.toFixed(6)}\nscene=${s.scene === 'chapter' ? 'Chapter04' : s.sequenceProgress > 0 ? 'RIFE scrub' : 'RIFE0'} · progress=${s.sequenceProgress.toFixed(5)} frame=${stage?.dataset.presented || '-'} ready0=${s.frame0Ready}\nPNG ${preload?.fetched || 0}/88 · decoded=${preload?.decoded || 0} · ready=${preload?.ready || false} · draws=${data?.drawn.length || 0} · maxDraw=${data?.maxDrawMs.toFixed(1) || '-'}ms`
  }, [debug])
  const diagnostics = useCallback(data => { measured.current = data; renderDebug() }, [renderDebug])
  useEffect(() => active ? followSmokeChannel(channelRef.current, state => { latest.current = state; renderDebug() }) : undefined, [active, channelRef, renderDebug])
  function download() {
    const data = { userAgent: navigator.userAgent, viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      timing: { duration: H_FINAL_TIMELINE.duration, swap: H_FINAL_TIMELINE.safeSwapPTS, reveal: H_FINAL_TIMELINE.revealPTS }, state: latest.current, renderer: measured.current }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = 'hfinal-cinema-qa.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  if (!active) return null
  return <>
    <Suspense fallback={null}><Renderer displayScrollRef={channelRef} settings={settings} debug={debug} onReady={onReady} onFailure={onFailure} onDiagnostics={diagnostics} /></Suspense>
    {debug && <div className="lab-smoke-debug"><output ref={output} aria-hidden="true" /><button type="button" onClick={download}>Tải QA H-final</button></div>}
  </>
}
