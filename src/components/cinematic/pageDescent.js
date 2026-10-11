// Distances in viewport-height units, independent of the ten-second video clock.
export const PAGE_DESCENT_BUDGET = {
  desktop: { hold: 25, travel: 40, entrance: 65, settle: 20 },
  mobile: { hold: 20, travel: 35, entrance: 55, settle: 15 },
}
const clamp = n => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0))
const smooth = n => { const t = clamp(n); return t * t * (3 - 2 * t) }
// A fixed feathered plume clears the center; scaled coverage follows lateral drift.
// Alpha gradients supply the soft perimeter without an animated blur/filter.
export const SMOKE_CLEAR_MASK = 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" preserveAspectRatio="none"><defs><radialGradient id="v" cx="50%" cy="50%" r="64%"><stop offset="0" stop-color="white"/><stop offset=".6" stop-color="white"/><stop offset=".8" stop-color="white" stop-opacity=".65"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient></defs><path d="M402 -240 C660 -265 832 -84 740 125 C893 353 689 425 794 640 C843 889 688 1218 472 1240 C215 1199 128 1012 235 777 C102 574 326 452 196 239 C152 22 232 -142 402 -240Z" fill="url(#v)"/></svg>') + '")'
export const descentBudget = mobile => Object.values(PAGE_DESCENT_BUDGET[mobile ? 'mobile' : 'desktop']).reduce((sum, n) => sum + n, 0)
export function pageDescentAt(progress, mobile = false) {
  const b = PAGE_DESCENT_BUDGET[mobile ? 'mobile' : 'desktop']
  const distance = clamp(progress) * descentBudget(mobile)
  const travel = clamp((distance - b.hold) / b.travel)
  const entrance = clamp((distance - b.hold - b.travel) / b.entrance)
  const settle = clamp((distance - b.hold - b.travel - b.entrance) / b.settle)
  // Keep the two photographic planes and their frame-zero lock unchanged.
  // A full-stage cloud bridges the existing 32svh interval between the planes.
  const chapterY = -(30 * travel + 102 * entrance) || 0
  const entered = smooth((distance - b.hold - b.travel * .15) / (b.travel * .85 + b.entrance * .08))
  const open = smooth((entrance - .42) / .58)
  return {
    distance, chapterY,
    cloudY: Math.max(0, Math.min(100 + chapterY, 100 * (1 - smooth(travel / .65)))),
    cloudScale: .97 + .03 * entered,
    cloudOpen: open,
    smokeMask: 'linear-gradient(white, white), ' + SMOKE_CLEAR_MASK,
    smokeMaskSize: '100% 100%, ' + (500 * open).toFixed(4) + '% 240%',
    sequenceY: 132 + chapterY,
    phase: distance <= b.hold ? 'hold' : entrance === 0 ? 'travel' : entrance < 1 ? 'entrance' : settle < 1 ? 'settle' : 'scrub',
    cloudVisible: travel > 0 && settle < 1,
    // Clear local Chapter 04 UI before the cloud copy enters; photography keeps
    // its accepted translation and never participates in this opacity envelope.
    chapterCopyOpacity: 1 - smooth((travel - .18) / .37),
    // Scroll-only envelopes: copy is readable during entrance, gone before lock.
    introOpacity: smooth((distance - b.hold - b.travel * .65) / (b.travel * .35 + b.entrance * .08)) * (1 - smooth((entrance - .42) / .38)),
    introEyebrowOpacity: smooth((distance - b.hold - b.travel * .55) / (b.travel * .45 + b.entrance * .02)) * (1 - smooth((entrance - .42) / .28)),
    introSupportOpacity: smooth((distance - b.hold - b.travel * .8) / (b.travel * .2 + b.entrance * .14)) * (1 - smooth((entrance - .42) / .28)),
    cloudOpacity: smooth(travel / .08),
    locked: settle === 1,
  }
}
export { scrollPhasesAt } from './scrollPhases.js'
