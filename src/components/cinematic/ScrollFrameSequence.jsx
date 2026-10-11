import { useEffect, useRef, memo } from 'react'
import { getFrameUrl, SEQUENCE_VIDEOS, SEQUENCE_TIMELINE, LEGACY_SEQUENCE_TIMELINE, LEGACY_SEQUENCE_VIDEOS, SEQUENCE_TIMING } from './sequenceConfig.js'
import { masterSampleAt } from './sequenceTimeline.js'
import { ENGINE_RESPONSES } from './displayScroll.js'
import { createVideoScrubber, needsMasterSettle, selectSequenceVideo, sequenceFrameAt, prewarmReverseVideo } from './videoSequence.js'

import { createFloatingScrubber, createSequentialPlayer } from './sequenceMotion.js'

export default memo(function ScrollFrameSequence({
  sequenceProgress = 0, transitionProgress = 0, debug = false, onReady, onFrame0Ready, displayScrollRef, revealFromStart = false,
}) {
  const legacy = import.meta.env?.DEV && new URLSearchParams(window.location.search).get('temporal') === 'legacy'
  const timeline = legacy ? LEGACY_SEQUENCE_TIMELINE : SEQUENCE_TIMELINE
  const sources = legacy ? LEGACY_SEQUENCE_VIDEOS : SEQUENCE_VIDEOS
  const stageRef = useRef(null)
  const videoRef = useRef(null)
  const reverseRef = useRef(null)
  const experiment = import.meta.env?.DEV ? new URLSearchParams(window.location.search).get('motion') : null
  const sequential = experiment !== 'baseline' && experiment !== 'floating' &&
    typeof HTMLVideoElement !== 'undefined' && 'requestVideoFrameCallback' in HTMLVideoElement.prototype
  const floating = experiment === 'floating'
  const settleRef = useRef(null)
  const runtimeRef = useRef(null)
  const targetRef = useRef(sequenceFrameAt(sequenceProgress, timeline))
  const transitionProgressRef = useRef(transitionProgress)
  const isVisible = revealFromStart || transitionProgress >= .40 || sequenceProgress > 0

  useEffect(() => {
    const video = videoRef.current, reverse = reverseRef.current, stage = stageRef.current, image = settleRef.current
    let disposed = false, source = null, presented = -1, timer = 0
    let request = null, objectUrl = null, revision = 0, settledFrame = -1, lastProgress = NaN
    const viewport = () => ({ width: window.innerWidth, height: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
      mobile: window.matchMedia('(max-width: 900px)').matches ||
        (navigator.maxTouchPoints > 0 && window.matchMedia('(pointer: coarse)').matches),
    })
    const clearSettle = () => {
      if (!timer && !request && !objectUrl && settledFrame < 0 && stage.dataset.settle === 'none') return
      revision++
      clearTimeout(timer)
      timer = 0
      request?.abort()
      request = null
      image.hidden = true
      image.removeAttribute('src')
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      objectUrl = null
      settledFrame = -1
      stage.dataset.settle = 'none'
    }
    const settle = async () => {
      timer = 0
      const frame = targetRef.current
      const sample = masterSampleAt(frame, timeline)
      if (sample.synthetic) return
      if (!source || presented !== frame || settledFrame === frame ||
        transitionProgressRef.current < .999 || !needsMasterSettle(source, viewport())) return
      const token = revision, abort = new AbortController()
      request = abort
      try {
        const response = await fetch(getFrameUrl(sample.masterIndex), { signal: abort.signal })
        if (!response.ok) throw new Error(`Settle image HTTP ${response.status}`)
        const blob = await response.blob()
        if (disposed || abort.signal.aborted || revision !== token) return
        objectUrl = URL.createObjectURL(blob)
        image.src = objectUrl
        await image.decode()
        if (disposed || abort.signal.aborted || revision !== token || targetRef.current !== frame) return
        settledFrame = frame
        image.hidden = false
        stage.dataset.settle = String(sample.masterIndex + 1)
      } catch (error) {
        if (!disposed && revision === token) {
          clearSettle()
          if (error.name !== 'AbortError') stage.dataset.settleError = error.message
        }
      } finally {
        if (request === abort) request = null
      }
    }
    const scheduleSettle = () => {
      // Damping can update progress without changing the displayed frame.
      // Those updates must not postpone an already scheduled settle.
      if (masterSampleAt(targetRef.current, timeline).synthetic) {
        if (source && needsMasterSettle(source, viewport())) stage.dataset.settle = 'rife-midpoint'
        return
      }
      if (timer || request || settledFrame === targetRef.current) return
      timer = setTimeout(settle, 160)
    }
    const params = new URLSearchParams(window.location.search)
    const diagnostics = state => {
      if (import.meta.env?.DEV) window.__CINEMATIC_PERF__?.engine(state)
      if (!debug) return
      stage.dataset.virtual = state.position.toFixed(5)
      stage.dataset.direction = state.active || state.direction
      stage.dataset.rate = String(state.rate || 0)
      stage.dataset.swaps = String(state.swaps || 0)
      stage.dataset.corrections = String(state.corrections || 0)
    }
    const candidateResponse = Number(params.get('engineResponse'))
    const engineResponse = import.meta.env?.DEV && params.has('engineResponse') && ENGINE_RESPONSES.includes(candidateResponse) ? candidateResponse : 60
    stage.dataset.engineResponse = String(engineResponse)
    const dependencies = {
      timeline,
      onDecoded: import.meta.env?.DEV && params.get('perfDebug') === '1' ? sample => window.__CINEMATIC_PERF__?.decoded(sample) : undefined,
      requestFrame: fn => { if (!import.meta.env?.DEV || !window.__CINEMATIC_PERF__) return requestAnimationFrame(fn); const queued = performance.now(); return requestAnimationFrame(at => { const started = performance.now(); fn(at); if (import.meta.env?.DEV) window.__CINEMATIC_PERF__?.raf('rife', at, queued, performance.now() - started) }) },
      onPresent(frame, latency) {
        if (disposed) return
        presented = frame
        onFrame0Ready?.(frame === 0)
        if (import.meta.env?.DEV) window.__CINEMATIC_PERF__?.present(frame)
        stage.dataset.presented = String(frame + 1)
        stage.dataset.seekMs = latency.toFixed(1)
        if (frame === targetRef.current) {
          stage.dataset.ready = 'true'
          if (!ready) { ready = true; onReady?.(true) }
          scheduleSettle()
        }
      },
      onError(message) { stage.dataset.error = message },
      response: engineResponse,
      driftSeconds: import.meta.env?.DEV ? Math.max(SEQUENCE_TIMING.driftSeconds, Math.min(4 / 30, (Number(params.get('drift')) || 2) / 30)) : SEQUENCE_TIMING.driftSeconds,
      onMotion: diagnostics,
      onDirection(direction, latency) {
        video.style.opacity = direction === 'forward' ? '1' : '0'
        reverse.style.opacity = direction === 'reverse' ? '1' : '0'
        stage.dataset.switchMs = String(latency)
      },
    }
    const scrubber = sequential ? createSequentialPlayer({ forward: video, reverse }, dependencies)
      : floating ? createFloatingScrubber(video, dependencies) : createVideoScrubber(video, dependencies)
    if (import.meta.env?.DEV) window.__CINEMATIC_PERF__?.registerEngine(scrubber)
    let ready = false
    const installSource = candidate => {
      const selected = import.meta.env?.DEV ? sources.find(v => v.tier === params.get('tier')) || candidate : candidate
      if (disposed) return
      clearSettle()
      scrubber.reset()
      presented = -1
      ready = false
      stage.dataset.ready = 'false'
      onReady?.(false)
      onFrame0Ready?.(false)
      source = selected
      stage.dataset.tier = selected.tier
      stage.dataset.temporal = timeline.kind
      stage.dataset.fps = String(timeline.fps)
      const gop = import.meta.env?.DEV && legacy && [15, 30].includes(Number(params.get('gop'))) ? Number(params.get('gop')) : 1
      const height = selected.height
      video.src = sequential && gop !== 1 ? `/bench/sequence-${height}-forward-gop${gop}.mp4` : selected.src
      video.load()
      if (sequential) { reverse.preload = transitionProgressRef.current >= .75 || lastProgress > 0 ? 'auto' : 'metadata'; reverse.src = gop === 1 ? selected.reverseSrc : `/bench/sequence-${height}-reverse-gop${gop}.mp4`; reverse.load() }
    }
    const failed = () => {
      if (source?.tier === '1440p') installSource(sources[0])
      else stage.dataset.error = 'Scrub video could not load'
    }
    video.addEventListener('error', failed)
    reverse?.addEventListener('error', failed)
    // Tier remains stable for this visit, including active scrubbing and resize.
    // Resize only revisits the physical-resolution settle policy; no video reset.
    const resize = () => { clearSettle(); scheduleSettle() }
    window.addEventListener('resize', resize)
    runtimeRef.current = {
      update(progress) {
        // Promote ahead of RIFE even while the logical target holds frame 0.
        if (sequential) prewarmReverseVideo(reverse, transitionProgressRef.current, progress)
        if (progress === lastProgress) return
        lastProgress = progress
        const frame = sequenceFrameAt(progress, timeline)
        if (import.meta.env?.DEV) { window.__CINEMATIC_PERF__?.target(progress, frame, timeline.fps) }
        const changedFrame = frame !== targetRef.current
        if (changedFrame) clearSettle()
        targetRef.current = frame
        if (changedFrame || !stage.dataset.target) {
        stage.dataset.target = String(frame + 1)
        const sample = masterSampleAt(frame, timeline)
        stage.dataset.sourceTime = String(sample.sourceTime)
        stage.dataset.master = String(sample.masterIndex + 1)
        stage.dataset.synthetic = String(sample.synthetic)
        }
        if (sequential || floating) scrubber.setProgress(progress)
        else scrubber.setTarget(frame)
        if (presented === frame) scheduleSettle()
      },
      hideSettle: clearSettle,
      scheduleSettle,
    }
    // One upstream displayed position drives chapters, handoff and video target.
    // Decoder/playback callbacks remain owned by Engine B.
    const channel = displayScrollRef?.current
    const follow = state => {
      const previousTransition = transitionProgressRef.current
      transitionProgressRef.current = state.transitionProgress
      runtimeRef.current.update(state.sequenceProgress)
      if (state.transitionProgress < .999) clearSettle()
      else if (previousTransition < .999 && presented === targetRef.current) scheduleSettle()
    }
    const unsubscribe = channel?.subscribe(follow)
    if (channel) follow(channel.getSnapshot())
    else runtimeRef.current.update(targetRef.current / timeline.fps / timeline.duration)
    void selectSequenceVideo({ mobile: viewport().mobile, capabilities: navigator.mediaCapabilities, sources, timeline,
      canPlay: codec => Boolean(video.canPlayType(`video/mp4; codecs="${codec}"`)),
    }).then(installSource)
    return () => {
      disposed = true
      onFrame0Ready?.(false)
      clearSettle()
      scrubber.dispose()
      unsubscribe?.()
      if (reverse) { reverse.removeAttribute('src'); reverse.load() }
      runtimeRef.current = null
      window.removeEventListener('resize', resize)
      video.removeEventListener('error', failed)
      reverse?.removeEventListener('error', failed)
      video.removeAttribute('src')
      video.load()
    }
  }, [onReady, onFrame0Ready, sequential, floating, debug, timeline, sources, legacy, displayScrollRef])

  useEffect(() => {
    if (displayScrollRef?.current) return
    transitionProgressRef.current = transitionProgress
    if (!displayScrollRef?.current) runtimeRef.current?.update(sequenceProgress)
    if (transitionProgress < .999) runtimeRef.current?.hideSettle()
    else runtimeRef.current?.scheduleSettle()
  }, [sequenceProgress, transitionProgress, displayScrollRef])

  return <div ref={stageRef} className="scroll-frame-sequence-stage" aria-hidden="true"
    style={{ position: 'absolute', inset: 0, zIndex: 2, opacity: isVisible ? 1 : 0,
      pointerEvents: 'none', visibility: isVisible ? 'visible' : 'hidden' }}>
    <video ref={videoRef} data-direction="forward" className="scroll-frame-sequence-video" muted playsInline preload="auto"
      disablePictureInPicture disableRemotePlayback
      style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover', objectPosition: 'center' }} />
    {sequential && <video ref={reverseRef} data-direction="reverse" muted playsInline preload="metadata"
      disablePictureInPicture disableRemotePlayback
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', opacity: 0 }} />}
    <img ref={settleRef} className="scroll-frame-sequence-settle" hidden alt="" decoding="async"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }} />
    {debug && <div style={{ position: 'absolute', bottom: 60, left: 20, background: 'rgba(20,18,16,.82)',
      color: '#fff', fontFamily: 'monospace', fontSize: 11, padding: '8px 12px', borderRadius: 6, lineHeight: 1.5 }}>
      <div>TRANSITION: {(transitionProgress * 100).toFixed(1)}%</div>
      <div>SEQUENCE: {(sequenceProgress * 100).toFixed(1)}%</div>
      <div>FRAME: {sequenceFrameAt(sequenceProgress, timeline) + 1} / {timeline.frameCount}</div>
    </div>}
  </div>
})
