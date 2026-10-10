import { mixPaletteColor } from './chapterPalette.js'
const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t) }
// One authored, dragged brush body, encoded once. Scroll changes its size only.
// The broad central body contains the viewport at 500%; no droplets or rays.
const brush = 'M118 454 C172 384 229 409 263 343 C289 292 350 321 376 269 C401 224 461 276 515 242 C556 214 578 297 639 285 C687 276 659 355 735 363 C785 369 799 420 877 441 C842 460 877 485 811 507 C773 520 825 564 742 576 C692 582 721 636 647 639 C591 642 625 709 559 712 C501 715 481 664 423 704 C384 731 357 647 310 652 C267 657 304 595 233 579 C191 568 229 528 158 519 C189 499  90 480 118 454Z'
export const paintBrushMask = 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" preserveAspectRatio="none"><path fill="white" d="' + brush + '"/></svg>') + '")'
// Reuse the original bouquet-calibrated blush/coral, carmine and wine tokens.
// The accepted ribbon surface stays intact; each material follows authored progress.
export const PAINT_PALETTES = [
  ['#f4d3ce', '#e9a8b7', '#cb8e9e', '#f5ebe0'],
  ['#edb9ad', '#dc8793', '#bc687e', '#f3e6db'],
  ['#c2586b', '#a72d48', '#7c213b', '#efe3d8'],
  ['#ab3d52', '#8b2138', '#64182e', '#f1e7dc'],
]
const paletteStops = [0, .25, .5, 1]
// Base arrives slightly earlier; dark pigment and fine accents follow later.
const layerLeads = [.025, 0, -.025, -.04]
export function paintPaletteAt(progress) {
  const mix = clamp(progress)
  if (mix === 0) return PAINT_PALETTES[0]
  if (mix === 1) return PAINT_PALETTES.at(-1)
  return layerLeads.map((lead, layer) => {
    const t = clamp(mix + lead * 4 * mix * (1 - mix))
    let index = 0
    while (index < paletteStops.length - 2 && t > paletteStops[index + 1]) index++
    const local = ease((t - paletteStops[index]) / (paletteStops[index + 1] - paletteStops[index]))
    return mixPaletteColor(PAINT_PALETTES[index][layer], PAINT_PALETTES[index + 1][layer], local)
  })
}
export function paintReveal(progress) {
  const mix = clamp(progress), scene = mix < .5 ? 0 : 1
  const opening = mix > .55, covered = mix >= .45 && mix <= .55
  const phase = covered ? 1 : ease(opening ? (mix - .55) / .45 : mix / .45)
  const size = (phase * 500).toFixed(4) + '%'
  return {
    scene, opening, covered, phase, colors: paintPaletteAt(mix),
    mask: covered ? 'none' : opening ? 'linear-gradient(white, white), ' + paintBrushMask : paintBrushMask,
    maskSize: covered ? '100% 100%' : opening ? '100% 100%, ' + size + ' ' + size : size + ' ' + size,
    maskComposite: opening ? 'subtract' : 'add',
    drag: opening ? phase : -.12 * (1 - phase),
  }
}
