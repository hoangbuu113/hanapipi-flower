import { mixPaletteColor } from './chapterPalette.js'

export const PHOTO_EDGE = { horizontal: .04, top: .03, bottom: .02 }
export const photoEdgeMask = [
  'linear-gradient(to right, transparent, black ' + PHOTO_EDGE.horizontal * 100 + '%, black ' + (1 - PHOTO_EDGE.horizontal) * 100 + '%, transparent)',
  'linear-gradient(to bottom, transparent, black ' + PHOTO_EDGE.top * 100 + '%, black ' + (1 - PHOTO_EDGE.bottom) * 100 + '%, transparent)',
].join(', ')

function worldColors(chapter) {
  const { light, base, accent } = chapter.palette
  return [mixPaletteColor(light, accent, .025), mixPaletteColor(light, base, .22), mixPaletteColor(light, accent, .035)]
}
export function chapterBackground(chapter) {
  const [top, middle, bottom] = worldColors(chapter)
  return 'linear-gradient(to bottom, ' + top + ', ' + middle + ' 50%, ' + bottom + ')'
}
