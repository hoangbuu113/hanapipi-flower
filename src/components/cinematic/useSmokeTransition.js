import { telemetrySmokeFrameAt } from './smokeTelemetryMapping.js'
import { SMOKE_TRANSITION_TIMING } from './smokeTransitionConfig.js'
import { cinematicTelemetry } from './cinematicTelemetry.js'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { createSmokeScrub } from './smokeScrub.js'
export function smokeViewChanged(previous, next) {
  return !previous || ['chapterProgress', 'phase', 'scene', 'locked', 'prewarm', 'failed']
    .some(key => previous[key] !== next[key])
}
export function useSmokeTransition({ enabled, displayScrollRef, renderSectionsOnly = false }) {
  const controller = useRef(null), channelRef = useRef(null), renderer = useRef(false), frame0 = useRef(false)
  const [view, setView] = useState(null)
  useLayoutEffect(() => {
    if (!enabled) return undefined
    const source = displayScrollRef.current
    const runtime = createSmokeScrub({ requestUpdate: () => source?.refresh() })
    controller.current = runtime; channelRef.current = runtime
    if (import.meta.env?.DEV) window.__CINEMATIC_PERF__?.registerController(runtime)
    runtime.setReady('renderer', renderer.current); runtime.setReady('video', frame0.current)
    let rendered = null
    const params = new URLSearchParams(window.location?.search || '')
    const detailed = import.meta.env?.DEV && (params.has('debug') || params.get('smokeDebug') === '1')
    const stopView = runtime.subscribe(next => {
      if (cinematicTelemetry) {
        const requested = telemetrySmokeFrameAt(next.requestedProgress)
        const required = ['decode-cover', 'frame0', 'swap-plate'].includes(next.gated) ? SMOKE_TRANSITION_TIMING.safeSwapFrame : requested
        cinematicTelemetry.observe(next, requested, required)
      }
      if (!renderSectionsOnly || detailed || smokeViewChanged(rendered, next)) { rendered = next; setView(next) }
    })
    const stopSource = source?.subscribe(state => runtime.observe(state))
    if (source?.getSnapshot()) runtime.observe(source.getSnapshot())
    return () => { stopSource?.(); stopView(); runtime.dispose(); controller.current = null; channelRef.current = null }
  }, [enabled, displayScrollRef, renderSectionsOnly])
  const rendererReady = useCallback(capability => { renderer.current = capability; controller.current?.setReady('renderer', capability) }, [])
  const rendererFailed = useCallback(() => { renderer.current = false; controller.current?.fail() }, [])
  const frame0Ready = useCallback(value => { frame0.current = value; controller.current?.setReady('video', value) }, [])
  return { view, channelRef, rendererReady, rendererFailed, frame0Ready }
}
