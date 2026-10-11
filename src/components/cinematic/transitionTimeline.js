const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
const cubic = t => t * t * (3 - 2 * t)
const quintic = t => t ** 3 * (t * (6 * t - 15) + 10)

// Integrated cosine acceleration: gentle ends, broad constant middle velocity.
export function cinematicEase(value, edge = .18) {
  const t = clamp(value)
  if (t === 0 || t === 1) return t
  if (t > 1 - edge) return 1 - cinematicEase(1 - t, edge)
  if (t < edge) return (t / 2 - edge * Math.sin(Math.PI * t / edge) / (2 * Math.PI)) / (1 - edge)
  return (t - edge / 2) / (1 - edge)
}
function inverse(value, easing) {
  if (value <= 0 || value >= 1) return clamp(value)
  let lo = 0, hi = 1
  for (let n = 0; n < 32; n++) { const mid = (lo + hi) / 2; if (easing(mid) < value) lo = mid; else hi = mid }
  return (lo + hi) / 2
}
export const TRANSITION_TIMELINES = [
  { closeEnd: .46, openStart: .54, authoredClose: .44, authoredOpen: .56 },
  { closeEnd: .47, openStart: .53, authoredClose: .45, authoredOpen: .55 },
  { closeEnd: .45, openStart: .55, authoredClose: .42, authoredOpen: .58 },
]
// Warp time, not artwork. Cancel the old nested phase ease while retaining every
// authored geometry/material sample, closed-cover exchange and photo swap.
export function authoredTransitionProgress(value, incomingChapter) {
  const t = clamp(value), phase = TRANSITION_TIMELINES[incomingChapter - 1]
  if (!phase) return t
  if (t === 0 || t === 1) return t
  const easing = incomingChapter === 1 ? quintic : cubic
  if (t < phase.closeEnd) return phase.authoredClose * inverse(cinematicEase(t / phase.closeEnd), easing)
  if (t > phase.openStart) return phase.authoredOpen + (1 - phase.authoredOpen) * inverse(cinematicEase((t - phase.openStart) / (1 - phase.openStart)), easing)
  // Existing pigment easing already supplies gentle color endpoints under cover.
  return phase.authoredClose + (phase.authoredOpen - phase.authoredClose) * ((t - phase.closeEnd) / (phase.openStart - phase.closeEnd))
}
