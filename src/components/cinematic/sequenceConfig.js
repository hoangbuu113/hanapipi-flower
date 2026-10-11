import { SCROLL } from './cinematicConfig.js'

export const MASTER_FRAME_COUNT = 300
export const SEQUENCE_FRAME_COUNT = 480
export const SEQUENCE_FPS = 48
export const SEQUENCE_DURATION = 10
export const SEQUENCE_TIMELINE = { fps: SEQUENCE_FPS, frameCount: SEQUENCE_FRAME_COUNT, duration: SEQUENCE_DURATION, kind: 'rife48' }
export const LEGACY_SEQUENCE_TIMELINE = { fps: 30, frameCount: MASTER_FRAME_COUNT, duration: SEQUENCE_DURATION, kind: 'legacy' }
// Preserve physical tolerances previously expressed in 30fps frame units.
export const SEQUENCE_TIMING = { driftSeconds: 2 / 30, jumpSeconds: 12 / 30, leadSeconds: .5 / 30 }
export const SEQUENCE_FRAME_DIR = '/media/hutflower/scroll-sequence/'
export const SEQUENCE_FRAME_PREFIX = 'frame_'
export const SEQUENCE_FRAME_EXT = '.jpg'
export const SEQUENCE_FRAME_PAD = 5 // '00001'
export const SEQUENCE_ASPECT = 3840 / 2160 // 16:9 = 1.77777778

// Scroll travel budgets (in svh)
// Smoke is part of the displayed scroll timeline, independent of native PTS duration.
export const SMOKE_SCROLL_BUDGET_DESKTOP = 600
export const SMOKE_SCROLL_BUDGET_MOBILE = 480
// The same ten-second source event, independent of temporal sampling.
export const SEQUENCE_SCROLL = {
  chapterDesktop: SCROLL.desktopTravel, // 1271.83
  smokeDesktop: SMOKE_SCROLL_BUDGET_DESKTOP,
  sequenceDesktop: 900,                 // 750svh x 1.2, same ten-second source
  chapterMobile: SCROLL.mobile - 100,   // 1090.14
  smokeMobile: SMOKE_SCROLL_BUDGET_MOBILE,
  sequenceMobile: 780, // 650svh x 1.2
}

export const TOTAL_SCROLL = {
  desktop: 100 + SEQUENCE_SCROLL.chapterDesktop + SEQUENCE_SCROLL.smokeDesktop + SEQUENCE_SCROLL.sequenceDesktop,
  mobile: 100 + SEQUENCE_SCROLL.chapterMobile + SEQUENCE_SCROLL.smokeMobile + SEQUENCE_SCROLL.sequenceMobile,
}

export function getFrameUrl(index) {
  const clamped = Math.max(0, Math.min(MASTER_FRAME_COUNT - 1, index))
  const num = String(clamped + 1).padStart(SEQUENCE_FRAME_PAD, '0')
  return `${SEQUENCE_FRAME_DIR}${SEQUENCE_FRAME_PREFIX}${num}${SEQUENCE_FRAME_EXT}`
}



// Legacy all-I development reference; never loaded alongside the active pair.
export const LEGACY_SEQUENCE_VIDEOS = [
  { tier: '1080p', width: 1920, height: 1080, bitrate: 49364012, codec: 'avc1.640028', src: '/media/hutflower/scroll-sequence-video/sequence-1080p.mp4', reverseSrc: '/media/hutflower/scroll-sequence-video/sequence-1080p-reverse.mp4' },
  { tier: '1440p', width: 2560, height: 1440, bitrate: 69971343, codec: 'avc1.640032', src: '/media/hutflower/scroll-sequence-video/sequence-1440p.mp4', reverseSrc: '/media/hutflower/scroll-sequence-video/sequence-1440p-reverse.mp4' },
]

export const SEQUENCE_VIDEOS = [
  { tier: '1080p', width: 1920, height: 1080, bitrate: 58124556, codec: 'avc1.64002a', src: '/media/hutflower/scroll-sequence-video/sequence-rife48-1080p-gop4.mp4', reverseSrc: '/media/hutflower/scroll-sequence-video/sequence-rife48-1080p-gop4-reverse.mp4' },
  { tier: '1440p', width: 2560, height: 1440, bitrate: 84307358, codec: 'avc1.640033', src: '/media/hutflower/scroll-sequence-video/sequence-rife48-1440p-gop4.mp4', reverseSrc: '/media/hutflower/scroll-sequence-video/sequence-rife48-1440p-gop4-reverse.mp4' },
]
