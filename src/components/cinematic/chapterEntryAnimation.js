import { HEADLINE_REVEAL, headlineRevealTiming } from './headlineGraphemes.js'

export const CHAPTER_ENTRY = { frameDuration: 1150, labelDelay: 220, headlineOffset: 240 }

// Called only by the chapter entry gate. Static path geometry remains untouched.
export function chapterEntryAnimations(container) {
  const letters = Array.from(container.querySelectorAll('.lab-headline-grapheme'))
  const timing = headlineRevealTiming(letters.length)
  const fade = (node, delay, duration, travel, holdForFont = false) => ({ node, delay, duration, holdForFont,
    frames: [{ opacity: 0, transform: 'translateY(' + travel + 'px)' }, { opacity: 1, transform: 'translateY(0)' }] })
  return [
    ...Array.from(container.querySelectorAll('.lab-frame-stroke')).map(node => ({ node, delay: 0, duration: CHAPTER_ENTRY.frameDuration,
      frames: [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }] })),
    fade(container.querySelector('.lab-kicker'), CHAPTER_ENTRY.labelDelay, 360, 18),
    fade(container.querySelector('.lab-title-brand'), CHAPTER_ENTRY.labelDelay, 360, 18),
    ...letters.map((node, index) => fade(node, CHAPTER_ENTRY.headlineOffset + HEADLINE_REVEAL.start + index * HEADLINE_REVEAL.interval,
      HEADLINE_REVEAL.duration, HEADLINE_REVEAL.travel, true)),
    fade(container.querySelector('.lab-cta'), CHAPTER_ENTRY.headlineOffset + timing.ctaDelay, 360, 8, true),
  ].filter(({ node }) => node)
}
