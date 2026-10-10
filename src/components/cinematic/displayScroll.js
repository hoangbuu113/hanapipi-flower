import { createScrollFrameGate } from './scrollFrame.js'
export const DISPLAY_RESPONSES = [0, 150, 250, 350, 500]
export const ENGINE_RESPONSES = [0, 20, 60]
export function displayResponse({ mobile = false, touch = false, dev = false, search = '' } = {}) {
  if (mobile || touch) return 0
  const candidate = Number(new URLSearchParams(search).get('smooth'))
  return dev && new URLSearchParams(search).has('smooth') && DISPLAY_RESPONSES.includes(candidate) ? candidate : 150
}
// Response is the exponential time constant; a smooth tail bounds catch-up to2x response.
export function advanceDisplayScroll(current, target, elapsed, response) {
  return response <= 0 ? target : current + (target - current) * -Math.expm1(-Math.max(0, elapsed) / response)
}
// Keep the authored response for ordinary input. A large backlog needs a
// stronger continuous response; otherwise every new wheel restarts the tail.
export function catchupResponse(response, gap) {
  const t = Math.max(0, Math.min(1, (Math.abs(gap) - 240) / 960))
  return response / (1 + 5 * t * t * (3 - 2 * t))
}
const tailEnvelope = (age, response) => {
  const t = Math.max(0, Math.min(1, (age - response) / response))
  return 1 - t * t * (3 - 2 * t)
}
export function createDisplayScroll({ initial, readTarget, publish, now = () => performance.now(), requestFrame, cancelFrame }) {
  let position = initial.position, sample = initial, dirty = false, snap = false, disposed = false
  let previous = now(), inputAt = previous
  const gate = createScrollFrameGate(at => {
    if (disposed) return
    const time = Number.isFinite(at) ? at : now()
    const resampled = dirty
    if (dirty) { sample = readTarget(); dirty = false }
    const effectiveResponse = catchupResponse(sample.response, sample.position - position)
    let next = snap ? sample.position : advanceDisplayScroll(position, sample.position, time - previous, effectiveResponse)
    if (!snap && sample.response > 0) {
      const before = tailEnvelope(previous - inputAt, sample.response)
      const after = tailEnvelope(time - inputAt, sample.response)
      // Taper the remaining error continuously, rather than snapping a large
      // exponential tail at the catch-up deadline. New input restarts the tail.
      next = sample.position + (next - sample.position) * (before > 0 ? after / before : 0)
    }
    previous = time; snap = false
    const settled = Math.abs(sample.position - next) <= .25 || time - inputAt >= sample.response * 2
    const value = settled ? sample.position : next
    if (resampled || value !== position) { position = value; publish(position, { ...sample, effectiveResponse }) }
    if (!settled) gate.schedule()
  }, { requestFrame, cancelFrame })
  return {
    schedule() { if (disposed) return; dirty = true; inputAt = now(); if (position === sample.position) previous = inputAt; gate.schedule() },
    resize() { if (disposed) return; snap = true; this.schedule() },
    dispose() { disposed = true; gate.dispose() },
    getState: () => ({ position, target: sample.position, response: sample.response }),
  }
}
