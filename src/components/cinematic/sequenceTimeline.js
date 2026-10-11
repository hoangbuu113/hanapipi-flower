import { SEQUENCE_TIMELINE } from './sequenceConfig.js'
import { REAL_MASTER_INDICES } from './sequenceSourceMap.js'

const clamp = (n, max) => Math.max(0, Math.min(max, n || 0))
export const frameAtTime = (time, timeline = SEQUENCE_TIMELINE) => Math.round(clamp(time * timeline.fps, timeline.frameCount - 1))
export const positionAtProgress = (progress, timeline = SEQUENCE_TIMELINE) => Math.min(clamp(progress, 1) * timeline.duration, (timeline.frameCount - 1) / timeline.fps)
export const frameAtProgress = (progress, timeline = SEQUENCE_TIMELINE) => frameAtTime(positionAtProgress(progress, timeline), timeline)

// Exact real samples alternate with RIFE midpoints; the final output holds the
// last real sample. Never replace a synthetic idle pose with a different 4K pose.
export function masterSampleAt(frame, timeline = SEQUENCE_TIMELINE) {
  const clamped = Math.round(clamp(frame, timeline.frameCount - 1))
  if (timeline.kind === 'legacy') return { frame: clamped, sourceTime: clamped / timeline.fps, masterIndex: clamped, synthetic: false }
  const uniqueIndex = Math.min(REAL_MASTER_INDICES.length - 1, Math.round(clamped / 2))
  const terminalHold = clamped === timeline.frameCount - 1
  return { frame: clamped, sourceTime: Math.min(clamped / timeline.fps, (REAL_MASTER_INDICES.length - 1) / 24),
    uniqueIndex, masterIndex: REAL_MASTER_INDICES[uniqueIndex], synthetic: clamped % 2 === 1 && !terminalHold }
}
