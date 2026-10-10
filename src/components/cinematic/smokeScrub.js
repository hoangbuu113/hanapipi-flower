import { SMOKE_TRANSITION_TIMING as timing } from './smokeTransitionConfig.js'
import { hFinalFrameAt } from './hFinalSmoke.js'
const clamp = value => Math.max(0, Math.min(1, value || 0))
// Only the upstream displayed-position channel advances this coordinator.
// Availability asks that same scheduler for one update; no clock or input owner.
export function createSmokeScrub({ requestUpdate = () => {} } = {}) {
  let raw = {}, scene = 'chapter', progress = 0, frame0 = false, renderer = false, failed = false, disposed = false
  const listeners = new Set()
  let state = snapshot('')
  function snapshot(gated) {
    const phase = progress === 0 ? 'CHAPTER' : progress === 1 ? 'RIFE'
      : progress < timing.swap ? 'SMOKE_PRE_COVER' : progress < timing.reveal ? 'SMOKE_POST_COVER' : 'SMOKE_REVEAL'
    return { ...raw, phase, scene, progress, smokeProgress: progress, transitionProgress: progress,
      virtualTime: progress * timing.duration, nativeFrame: hFinalFrameAt(progress * timing.duration) + 1,
      requestedProgress: clamp(raw.smokeProgress ?? raw.transitionProgress),
      chapterProgress: gated || progress > 0 ? 1 : raw.chapterProgress || 0,
      sequenceProgress: !gated && progress === 1 && scene === 'sequence' ? raw.sequenceProgress || 0 : 0,
      visible: !failed && progress > 0 && progress < 1, locked: Boolean(gated) || progress < 1,
      covered: progress >= timing.swap, revealing: progress >= timing.reveal,
      gated, frame0Ready: frame0, rendererReady: Boolean(renderer?.ready ?? renderer), failed,
      prewarm: (raw.chapterProgress || 0) >= .85 }
  }
  const available = p => failed || Boolean(renderer?.ready ?? renderer) && (!renderer?.canPresent || renderer.canPresent(p * timing.duration / timing.nativeDuration))
  return {
    getSnapshot: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    observe(next) {
      if (disposed) return
      raw = next
      const target = clamp(raw.smokeProgress ?? raw.transitionProgress)
      const desiredScene = target >= timing.swap ? 'sequence' : 'chapter'
      let gated = ''
      if (desiredScene !== scene) {
        // Present the calibrated cover plate even when one native sample jumps
        // over the whole runway. The next master sample goes to latest target.
        if (!available(timing.swap)) gated = 'decode-cover'
        else {
          progress = timing.swap
          if (desiredScene === 'sequence' && !frame0) gated = 'frame0'
          else { scene = desiredScene; gated = 'swap-plate'; requestUpdate() }
        }
      } else if (target === 0 || target === 1 || available(target)) progress = target
      else gated = 'decode-target'
      state = snapshot(gated)
      for (const fn of listeners) fn(state)
    },
    setReady(kind, value) {
      if (disposed) return
      const changed = kind === 'video' ? frame0 !== Boolean(value) : renderer !== value
      if (kind === 'video') frame0 = Boolean(value)
      else renderer = value
      if (changed || state.gated) requestUpdate()
    },
    fail() { if (disposed) return; failed = true; requestUpdate() },
    dispose() { disposed = true; listeners.clear() },
  }
}
