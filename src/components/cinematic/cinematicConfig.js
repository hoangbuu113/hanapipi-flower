import { authoredTransitionProgress } from './transitionTimeline.js'
// Equal settled viewing distance for Chapters 1–3; handoffs have independent travel.
const chapterDwellTravel = 120
const revealTravel = 179.55 // 119.7svh x 1.5; settled viewing travel stays unchanged.
const paintTravel = 215.46 // 143.64svh x 1.5; local effect phase ratios stay unchanged.
const curtainTravel = 430.92 // 287.28svh x 1.5; independent of page descent.
const finalDwellTravel = 85.9
const desktopTravel = chapterDwellTravel * 3 + revealTravel + paintTravel + curtainTravel + finalDwellTravel
export const SCROLL = { desktop: 100 + desktopTravel, mobile: 100 + desktopTravel * 480 / 560, desktopTravel }
const frame = (maxWidth, maxHeight, extra = {}) => ({ maxWidth, maxHeight, mobileHeight: '54svh', mobileWidth: '98vw', shortHeight: '46svh', scale: 1, x: 50, y: 50, objectFit: 'contain', objectPosition: '50% 50%', ...extra })
export const PALETTES = [
  {
    "base": "#d7d3cc",
    "light": "#f9f8f6",
    "accent": "#c77c38",
    "shadow": "#afb0aa",
    "textAccent": "#7c5139"
  },
  {
    "base": "#cecbce",
    "light": "#fbfbfc",
    "accent": "#c28581",
    "shadow": "#978783",
    "textAccent": "#7a5555"
  },
  {
    "base": "#cecbc9",
    "light": "#eeeeef",
    "accent": "#7e0912",
    "shadow": "#b0a79d",
    "textAccent": "#60262b"
  },
  {
    "base": "#ddd5cd",
    "light": "#fcfcfc",
    "accent": "#d88c85",
    "shadow": "#b5a395",
    "textAccent": "#825757"
  }
]
export const CHAPTERS = [
{ key:'one',side:'left',src:'/media/hanapipi/chapters/chapter-01-new.png',aspect:2400/1792,palette:PALETTES[0],frame:frame('100vw','126svh')},
{ key:'two',side:'right',src:'/media/hanapipi/chapters/chapter-02-new.png',aspect:2400/1792,palette:PALETTES[1],frame:frame('92vw','120svh',{y:49})},
{ key:'three',side:'left',src:'/media/hanapipi/chapters/chapter-03-new.png',aspect:2400/1792,palette:PALETTES[2],frame:frame('90vw','116svh',{y:47})},
{ key:'four',side:'center',src:'/media/hanapipi/chapters/chapter-04-new.png',aspect:2400/1792,palette:PALETTES[3],frame:frame('112vw','141svh',{mobileHeight:'79.5svh',shortHeight:'74svh',mobileWidth:'108vw',mobileY:47})},
]
// Version only cinematic media URLs so repaired pixels replace cached files.
export const CHAPTER_MEDIA_VERSION = '20261006-2'
// Desktop panoramas extend only the room; original central bouquet pixels remain authoritative.
CHAPTERS.forEach((chapter, i) => {
  const prefix = '/media/hanapipi/chapters/chapter-0' + (i + 1) + (i >= 2 ? '-panorama-v2-' : '-panorama-')
  chapter.src += '?v=' + CHAPTER_MEDIA_VERSION
  chapter.panorama = { srcSet: prefix + '2688.webp?v=' + CHAPTER_MEDIA_VERSION + ' 2688w, ' + prefix + '5376.webp?v=' + CHAPTER_MEDIA_VERSION + ' 5376w' }
})
// Transition centers are derived from three equal settled viewing sections.
export const CHAPTER_STARTS = [
  0,
  (chapterDwellTravel + revealTravel / 2) / desktopTravel,
  (chapterDwellTravel * 2 + revealTravel + paintTravel / 2) / desktopTravel,
  (chapterDwellTravel * 3 + revealTravel + paintTravel + curtainTravel / 2) / desktopTravel,
]
export function chapterAtProgress(progress) {
  const p = Math.min(1, Math.max(0, progress))
  let chapter = 0
  for (let i = 1; i < CHAPTER_STARTS.length; i++) {
    if (p < CHAPTER_STARTS[i]) break
    chapter = i
  }
  return chapter
}

// Normalize each handoff against the same total so viewing and effect distances stay separate.
export const CHAPTER_DISSOLVE = revealTravel / desktopTravel
export const CHAPTER_PAINT_SPAN = paintTravel / desktopTravel
export const CHAPTER_CURTAIN_SPAN = curtainTravel / desktopTravel
const smooth = t => t < 1e-9 ? 0 : t > 1 - 1e-9 ? 1 : t * t * (3 - 2 * t)
export function chapterTransitionAtProgress(progress) {
  const p = Math.min(1, Math.max(0, progress))
  for (let i = 1; i < CHAPTER_STARTS.length; i++) {
    const span = i === 3 ? CHAPTER_CURTAIN_SPAN : i === 2 ? CHAPTER_PAINT_SPAN : CHAPTER_DISSOLVE
    const start = CHAPTER_STARTS[i] - span / 2
    const t = (p - start) / span
    if (t > 0 && t < 1) {
      return { from: i - 1, to: i, mix: authoredTransitionProgress(t, i), activeChapter: p < CHAPTER_STARTS[i] ? i - 1 : i,
        copyOut: 1 - smooth(Math.min(1, t * 2)), copyIn: smooth(Math.max(0, t * 2 - 1)) }
    }
  }
  const chapter = chapterAtProgress(p)
  return { from: chapter, to: chapter, mix: 1, activeChapter: chapter, copyOut: 1, copyIn: 1 }
}
