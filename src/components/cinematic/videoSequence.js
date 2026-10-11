import { SEQUENCE_TIMELINE, SEQUENCE_VIDEOS } from './sequenceConfig.js'
import { frameAtProgress, frameAtTime } from './sequenceTimeline.js'

export const sequenceFrameAt = frameAtProgress
export const sequenceTimeAt = (frame, timeline = SEQUENCE_TIMELINE) => frame / timeline.fps

export function needsMasterSettle(source, { width, height, dpr = 1, mobile = false }) {
  return !mobile && Math.max(width, height * 16 / 9) * dpr > source.width * 1.05
}

export async function selectSequenceVideo({ mobile, capabilities, canPlay = () => true, sources = SEQUENCE_VIDEOS, timeline = SEQUENCE_TIMELINE }) {
  const candidates = mobile ? [sources[0]] : [...sources].reverse()
  for (const source of candidates) {
    if (!canPlay(source.codec)) continue
    if (!capabilities?.decodingInfo) return source
    try {
      const result = await capabilities.decodingInfo({ type: 'file', video: {
        contentType: `video/mp4; codecs="${source.codec}"`, width: source.width,
        height: source.height, bitrate: source.bitrate, framerate: timeline.fps,
      } })
      if (result.supported && result.smooth) return source
    } catch {
      // Older browsers may expose decodingInfo without accepting file configs.
      return source
    }
  }
  return sources[0]
}

// One in-flight seek and one numeric target; no queue and no idle RAF loop.
// A presentation callback can run before seeked: wait for both before seeking again.
export function createVideoScrubber(video, {
  timeline = SEQUENCE_TIMELINE,
  requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame,
  delay = setTimeout, cancelDelay = clearTimeout, now = () => performance.now(),
  onPresent = () => {}, onError = () => {},
} = {}) {
  let desired = 0, requested = -1, presented = -1
  let busy = false, confirmed = false, disposed = false
  let raf = 0, callback = 0, watchdog = 0, started = 0
  const hasPresentationCallback = typeof video.requestVideoFrameCallback === 'function'

  const schedule = () => {
    if (!disposed && !raf) raf = requestFrame(flush)
  }
  const finish = () => {
    if (!busy || !confirmed || video.seeking) return
    busy = false
    cancelDelay(watchdog)
    watchdog = 0
    onPresent(presented, now() - started)
    if (desired !== presented) schedule()
  }
  const acknowledge = mediaTime => {
    presented = frameAtTime(mediaTime, timeline)
    if (busy) {
      confirmed = presented === requested
      if (confirmed) finish()
      else arm()
    } else {
      cancelDelay(watchdog)
      watchdog = 0
      onPresent(presented, 0)
      if (desired !== presented) schedule()
    }
  }
  const arm = () => {
    if (hasPresentationCallback && !callback && !disposed) {
      callback = video.requestVideoFrameCallback((_, metadata) => {
        callback = 0
        if (!disposed) acknowledge(metadata.mediaTime)
      })
    }
  }
  const fallback = () => {
    if (disposed || video.seeking || video.readyState < 2) return
    if (callback) video.cancelVideoFrameCallback(callback)
    callback = 0
    acknowledge(video.currentTime)
  }
  const scheduleFallback = () => {
    cancelFrame(raf)
    raf = requestFrame(() => { raf = 0; fallback() })
  }
  function flush() {
    raf = 0
    if (disposed || busy || video.readyState < 2 || desired === presented) return
    busy = true
    confirmed = false
    requested = desired
    started = now()
    arm()
    try {
      video.currentTime = sequenceTimeAt(requested, timeline)
      watchdog = delay(() => {
        watchdog = 0
        // Some browsers suppress rVFC for hidden paused video. Do not deadlock.
        if (!video.seeking) scheduleFallback()
        else onError('Video seek has not completed')
      }, 1500)
    } catch (error) {
      busy = false
      onError(error.message)
    }
  }
  const loaded = () => {
    arm()
    if (!hasPresentationCallback) scheduleFallback()
    else if (presented < 0) {
      cancelDelay(watchdog)
      // Initial frame may precede loadeddata in older browsers.
      watchdog = delay(() => {
        watchdog = 0
        if (presented < 0 && !busy) scheduleFallback()
      }, 250)
    }
  }
  const seeked = () => {
    if (hasPresentationCallback) { finish(); if (busy && !confirmed) arm() }
    else scheduleFallback()
  }
  video.addEventListener('loadeddata', loaded)
  video.addEventListener('seeked', seeked)
  arm()
  if (video.readyState >= 2) loaded()
  return {
    setTarget(frame) { if (disposed || desired === frame) return; desired = frame; schedule() },
    reset() {
      cancelFrame(raf)
      cancelDelay(watchdog)
      if (callback) video.cancelVideoFrameCallback(callback)
      raf = callback = watchdog = 0
      requested = presented = -1
      busy = confirmed = false
      arm()
    },
    dispose() {
      disposed = true
      cancelFrame(raf)
      cancelDelay(watchdog)
      if (callback) video.cancelVideoFrameCallback(callback)
      video.removeEventListener('loadeddata', loaded)
      video.removeEventListener('seeked', seeked)
    },
    getState: () => ({ desired, requested, presented, busy }),
  }
}

export function prewarmReverseVideo(video, transitionProgress, sequenceProgress) {
  if (video && video.preload !== 'auto' && (transitionProgress >= .75 || sequenceProgress > 0)) video.preload = 'auto'
}
