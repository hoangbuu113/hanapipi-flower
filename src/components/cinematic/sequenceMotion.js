import { SEQUENCE_TIMELINE, SEQUENCE_TIMING } from './sequenceConfig.js'
import { positionAtProgress } from './sequenceTimeline.js'
import { createVideoScrubber, sequenceFrameAt } from './videoSequence.js'


const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
export const sequencePositionTime = positionAtProgress
export const directionTimeAt = (frame, direction, timeline = SEQUENCE_TIMELINE) => ((direction === 'reverse' ? timeline.frameCount - 1 - frame : frame) + .5) / timeline.fps
export const directionFrameAt = (time, direction, timeline = SEQUENCE_TIMELINE) => {
  const encoded = clamp(Math.round(time * timeline.fps), 0, timeline.frameCount - 1)
  return direction === 'reverse' ? timeline.frameCount - 1 - encoded : encoded
}
export const advancePlayhead = (current, target, elapsed, response = 90) => response <= 0 ? target : current + (target - current) * (1 - Math.exp(-elapsed / response))

// Experiment A uses the same decoder as the baseline, rounding only at delivery.
export function createFloatingScrubber(video, {
  timeline = SEQUENCE_TIMELINE,
  requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame,
  now = () => performance.now(), response = 90, onMotion = () => {}, ...dependencies
} = {}) {
  const scrubber = createVideoScrubber(video, { timeline, requestFrame, cancelFrame, now, ...dependencies })
  let target = 0, position = 0, raf = 0, previous = 0, disposed = false
  function tick(at) {
    raf = 0
    position = advancePlayhead(position, target, Math.min(64, previous ? at - previous : 16.67), response)
    previous = at
    if (Math.abs(target - position) < .0005) position = target
    scrubber.setTarget(sequenceFrameAt(position / timeline.duration, timeline))
    onMotion({ position, target, direction: target >= position ? 'forward' : 'reverse' })
    if (position !== target && !disposed) raf = requestFrame(tick)
    else previous = 0
  }
  return {
    setProgress(progress) { target = sequencePositionTime(progress, timeline); if (!raf && !disposed) raf = requestFrame(tick) },
    reset: () => scrubber.reset(),
    dispose() { disposed = true; cancelFrame(raf); scrubber.dispose() },
  }
}

// Only one visible decoder. A reversal freezes the outgoing frame, confirms the
// same master index in the incoming video, then swaps the two layers atomically.
export function createSequentialPlayer(videos, {
  timeline = SEQUENCE_TIMELINE,
  requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame,
  now = () => performance.now(), response = 60, driftSeconds = SEQUENCE_TIMING.driftSeconds,
  delay = setTimeout, cancelDelay = clearTimeout,
  idleMs = 120, correctionMs = 220, onPresent = () => {},
  onDirection = () => {}, onMotion = () => {}, onError = () => {}, onDecoded,
} = {}) {
  let target = 0, position = 0, active = 'forward', intent = 'forward', presented = -1
  let pending = null, raf = 0, previous = 0, lastInput = -Infinity
  let lastCorrection = -Infinity, swaps = 0, corrections = 0, disposed = false
  const state = Object.fromEntries(Object.entries(videos).map(([direction, video]) => [direction,
    { video, frame: -1, callback: 0, seek: null, playPending: false }]))
  function schedule() { if (!disposed && !raf) raf = requestFrame(tick) }
  function pauseAll() { for (const s of Object.values(state)) s.video.pause() }
  function emit(s, direction, latency = 0) {
    if (direction !== active) return
    presented = s.frame
    onPresent(presented, latency)
  }
  function finish(s, direction) {
    if (!s.seek || !s.seek.confirmed || s.video.seeking) return
    const seek = s.seek
    cancelDelay(seek.timer)
    s.seek = null
    if (pending?.direction === direction && pending.frame === s.frame && intent === direction) {
      active = direction
      pending = null
      swaps++
      onDirection(active, now() - seek.started)
    }
    emit(s, direction, now() - seek.started)
    schedule()
  }
  function arm(s, direction) {
    if (disposed || s.callback) return
    if (!s.video.requestVideoFrameCallback) { onError('Sequential motion requires video presentation callbacks'); return }
    s.callback = s.video.requestVideoFrameCallback((_, metadata) => {
      s.callback = 0
      if (disposed) return
      s.frame = directionFrameAt(metadata.mediaTime, direction, timeline)
      if (onDecoded) onDecoded({ direction, frame: s.frame, mediaTime: metadata.mediaTime, requested: s.seek?.frame ?? null, nativeSeeking: s.video.seeking, readyState: s.video.readyState })
      if (s.seek) { s.seek.confirmed = s.frame === s.seek.frame; finish(s, direction) }
      else emit(s, direction)
      if (s.seek || (!s.video.paused && direction === active)) arm(s, direction)
    })
  }
  function seek(s, direction, frame) {
    if (s.seek || s.video.seeking || s.video.readyState < 2) return false
    s.video.pause()
    s.seek = { frame, confirmed: false, timedOut: false, started: now(), timer: delay(() => {
      if (disposed) return
      // Keep ownership until native completion; latest target remains numeric.
      s.seek.timedOut = true
      onError('Motion synchronization timed out; outgoing frame retained')
    }, 1500) }
    arm(s, direction)
    try { s.video.currentTime = directionTimeAt(frame, direction, timeline) }
    catch (error) { cancelDelay(s.seek.timer); s.seek = null; onError(error.message) }
    return true
  }
  function play(s, direction, rate) {
    if (s.seek || s.video.readyState < 2 || s.playPending) return
    s.video.playbackRate = rate
    arm(s, direction)
    if (s.video.paused) {
      s.playPending = true
      Promise.resolve(s.video.play()).catch(error => { if (!disposed && error.name !== 'AbortError') onError(error.message) })
        .finally(() => { s.playPending = false; if (disposed) s.video.pause() })
    }
  }
  function tick(at) {
    raf = 0
    if (disposed) return
    const elapsed = Math.min(64, previous ? at - previous : 16.67)
    previous = at
    const old = position
    const idle = now() - lastInput >= idleMs
    position = idle || Math.abs(target - position) > SEQUENCE_TIMING.jumpSeconds ? target : advancePlayhead(position, target, elapsed, response)
    const velocity = (position - old) * 1000 / elapsed
    const desired = sequenceFrameAt(target / timeline.duration, timeline)
    const s = state[active]
    // Retain the last input direction while synchronization is in flight. A
    // snapped virtual playhead must not cancel a reversal on the next RAF.
    const wanted = intent
    // Discard a stale switch if scroll immediately reverses back.
    if (pending && pending.direction !== wanted) pending = null
    if ((!idle || pending) && wanted !== active && presented >= 0) {
      pauseAll()
      if (!pending) pending = { direction: wanted, frame: presented }
      const incoming = state[wanted]
      if (!incoming.seek) {
        if (incoming.frame === pending.frame) { active = wanted; pending = null; swaps++; onDirection(active, 0); emit(incoming, wanted) }
        else {
          // Seeking an unobserved initial frame to itself may produce no rVFC.
          // Confirm a neighboring frame behind the outgoing layer first.
          const frame = incoming.frame < 0 ? (pending.frame === timeline.frameCount - 1 ? timeline.frameCount - 2 : pending.frame + 1) : pending.frame
          seek(incoming, wanted, frame)
        }
      }
    } else if (!pending) {
      if (idle) {
        pauseAll()
        if (s.frame !== desired && !s.seek) seek(s, active, desired)
      } else if (s.frame < 0) seek(s, active, desired)
      else if (!s.seek) {
        const actual = s.frame / timeline.fps
        const error = position - actual
        const signed = active === 'forward' ? error : -error
        // A flick seeks once near the newest playhead; ordinary motion decodes sequentially.
        if (Math.abs(error) > driftSeconds && (now() - lastCorrection >= correctionMs || Math.abs(error) > SEQUENCE_TIMING.jumpSeconds)) {
          corrections++; lastCorrection = now()
          seek(s, active, sequenceFrameAt(position / timeline.duration, timeline))
        } else if (signed < -SEQUENCE_TIMING.leadSeconds || (active === 'forward' ? s.frame >= desired : s.frame <= desired)) s.video.pause()
        else play(s, active, clamp(Math.abs(velocity) + Math.max(0, signed) * 8, .1, 6))
      }
    }
    onMotion({ position, target, active, rate: state[active].video.playbackRate, swaps, corrections, pending: Boolean(pending) })
    const pendingCanProgress = pending && !state[pending.direction].seek?.timedOut
    if (!idle || pendingCanProgress || Object.values(state).some(s => s.seek && !s.seek.timedOut)) schedule()
    else previous = 0
  }
  for (const [direction, s] of Object.entries(state)) {
    s.loaded = () => { arm(s, direction); schedule() }
    s.endedSeek = () => { finish(s, direction); if (s.seek) arm(s, direction) }
    s.video.addEventListener('loadeddata', s.loaded)
    s.video.addEventListener('seeked', s.endedSeek)
    if (s.video.readyState >= 2) s.loaded()
  }
  onDirection(active, 0)
  return {
    setProgress(progress) { const value = sequencePositionTime(progress, timeline); if (value !== target) { intent = value > target ? 'forward' : 'reverse'; target = value; lastInput = now(); schedule() } },
    reset() { pauseAll(); for (const s of Object.values(state)) { if (s.callback) s.video.cancelVideoFrameCallback(s.callback); s.callback = 0; s.frame = -1; if (s.seek) cancelDelay(s.seek.timer); s.seek = null } pending = null; presented = -1; active = intent = 'forward'; onDirection(active, 0); schedule() },
    dispose() { disposed = true; pauseAll(); cancelFrame(raf); for (const s of Object.values(state)) { if (s.callback) s.video.cancelVideoFrameCallback(s.callback); if (s.seek) cancelDelay(s.seek.timer); s.video.removeEventListener('loadeddata', s.loaded); s.video.removeEventListener('seeked', s.endedSeek) } },
    getState: () => ({ target, position, active, presented, pending, swaps, corrections,
      seeks: Object.fromEntries(Object.entries(state).map(([direction, s]) => [direction, { frame: s.frame, requested: s.seek?.frame ?? null, confirmed: s.seek?.confirmed ?? false, timedOut: s.seek?.timedOut ?? false, age: s.seek ? now() - s.seek.started : 0, nativeSeeking: s.video.seeking }])) }),
  }
}
