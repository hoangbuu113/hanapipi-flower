import { H_FINAL_TIMELINE, hFinalFrameAt } from './hFinalSmoke.js'
// First exactly clear frame, measured over the delivered RIFE frame0. Retain
// every visible native frame and all 88 archival PNGs/timestamps.
export const EFFECTIVE_SMOKE_END_FRAME = 80
export const EFFECTIVE_SMOKE_END_PROGRESS = H_FINAL_TIMELINE.frames[EFFECTIVE_SMOKE_END_FRAME - 1].pts / H_FINAL_TIMELINE.duration
const effectiveDuration = H_FINAL_TIMELINE.frames[EFFECTIVE_SMOKE_END_FRAME - 1].pts
export const SMOKE_TRANSITION_TIMING = Object.freeze({
  frames: EFFECTIVE_SMOKE_END_FRAME, duration: effectiveDuration, nativeDuration: H_FINAL_TIMELINE.duration,
  safeSwapFrame: H_FINAL_TIMELINE.safeSwapFrame, safeSwapPTS: H_FINAL_TIMELINE.safeSwapPTS,
  swap: H_FINAL_TIMELINE.safeSwapPTS / effectiveDuration,
  revealFrame: H_FINAL_TIMELINE.revealFrame, revealPTS: H_FINAL_TIMELINE.revealPTS,
  reveal: H_FINAL_TIMELINE.revealPTS / effectiveDuration,
  visibleStart: 0, visibleEnd: 1, minCoverage: .98,
})
export function smokePhaseAt(progress) {
  const frame = hFinalFrameAt(progress * effectiveDuration) + 1
  return frame < 22 ? 'SMOKE_ENTER' : frame < 30 ? 'SMOKE_BUILD'
    : frame < 34 ? 'SMOKE_BLOOM' : frame < H_FINAL_TIMELINE.revealFrame ? 'SMOKE_FULL'
      : frame < 69 ? 'SMOKE_CLEAR' : frame < 80 ? 'SMOKE_RESIDUAL' : 'SMOKE_SETTLE'
}
// Measured full-frame mean alpha, NOT a promise that every pixel is opaque.
export function smokeCoverageAt(progress) {
  return H_FINAL_TIMELINE.frames[hFinalFrameAt(progress * effectiveDuration)].meanAlpha
}
