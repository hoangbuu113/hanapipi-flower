import { mixPaletteColor } from './chapterPalette.js'

const sunflower = [
  ['#fff3cf', '#edbd69', '#bd8247'], ['#ffecd5', '#e6a16e', '#b46f48'],
  ['#ffefc4', '#edbd65', '#b77e43'], ['#ffead8', '#eab18a', '#bb8065'],
  ['#fff0d5', '#efbf89', '#bd855d'], ['#fff2ce', '#e8b966', '#b48a51'],
  ['#ffefd5', '#eeb688', '#b77c55'], ['#fff0d6', '#edc19b', '#ba896e'],
]
const blush = [
  ['#fff0eb', '#e8b5ad', '#bc8c85'], ['#ffe8e7', '#dfaaa8', '#b78187'],
  ['#fff0e3', '#ebc1ad', '#bd948a'], ['#f9e7f0', '#d9b5ca', '#ad8aab'],
  ['#ffe8e9', '#e6b1ba', '#ba8797'], ['#fff1e7', '#eac3b8', '#be9690'],
  ['#fbe7ed', '#dfb0c2', '#b78aa3'], ['#fff0e9', '#edbeb4', '#c0938b'],
]
// Endpoint arrays stay stable for memoized petals during closing and opening.
export function bloomPaletteAt(tone) {
  if (tone <= 0) return sunflower
  if (tone >= 1) return blush
  return sunflower.map((stops, index) => stops.map((color, stop) => mixPaletteColor(color, blush[index][stop], tone)))
}
