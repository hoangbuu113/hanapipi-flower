// Experimental placement data only. No catalogue, cart or backend integration.
import roseA from '../assets/bouquet-lab/raster/rose-pink-a.webp'
import roseB from '../assets/bouquet-lab/raster/rose-pink-b.webp'
import roseC from '../assets/bouquet-lab/raster/rose-pink-c.webp'
import tulipA from '../assets/bouquet-lab/raster/tulip-white-a.webp'
import tulipB from '../assets/bouquet-lab/raster/tulip-white-b.webp'
import baby from '../assets/bouquet-lab/raster/baby-breath.webp'
import eucalyptusA from '../assets/bouquet-lab/raster/eucalyptus-a.webp'
import eucalyptusB from '../assets/bouquet-lab/raster/eucalyptus-b.webp'
import pearl from '../assets/bouquet-lab/raster/pearl-spray.webp'
import wrapperBack from '../assets/bouquet-lab/raster/wrapper-back.webp'
import wrapperFront from '../assets/bouquet-lab/raster/wrapper-front.webp'
import ribbonPink from '../assets/bouquet-lab/raster/ribbon-pink.webp'
import ribbonCream from '../assets/bouquet-lab/raster/ribbon-cream.webp'

// Generated studio-style cutouts for this experiment only, not product photographs.
export const ingredients = [
  { id: 'rose', name: 'Hồng phấn', role: 'FOCAL', referencePrice: 45000, image: roseA, variants: [roseA, roseB, roseC], width: 31 },
  { id: 'tulip', name: 'Tulip trắng', role: 'SECONDARY', referencePrice: 30000, image: tulipA, variants: [tulipA, tulipB], width: 25 },
  { id: 'baby', name: 'Baby', role: 'FILLER', referencePrice: 15000, image: baby, width: 23 },
  { id: 'eucalyptus', name: 'Bạch đàn', role: 'GREENERY', referencePrice: 10000, image: eucalyptusA, variants: [eucalyptusA, eucalyptusB], width: 30 },
  { id: 'pearl', name: 'Ngọc trai', role: 'TOPPING', referencePrice: 12000, image: pearl, width: 17 },
]
export const wrappers = [
  { id: 'ivory', name: 'Kem / blush', referencePrice: 35000, backImage: wrapperBack, frontImage: wrapperFront },
  { id: 'warm', name: 'Kem ấm', referencePrice: 35000, backImage: wrapperBack, frontImage: wrapperFront, filter: 'sepia(.28) saturate(.65)' },
]
export const ribbons = [
  { id: 'pink', name: 'Satin hồng', referencePrice: 10000, image: ribbonPink },
  { id: 'cream', name: 'Satin kem', referencePrice: 10000, image: ribbonCream },
]
const positions = {
  FOCAL: [[40, 37], [61, 40], [49, 47], [31, 46], [70, 48]],
  SECONDARY: [[38, 25], [64, 29], [51, 23]],
  FILLER: [[27, 37], [73, 40], [51, 49]],
  GREENERY: [[27, 27], [75, 31], [33, 20], [69, 22]],
  TOPPING: [[58, 43], [34, 42]],
}
const depths = { GREENERY: 10, FOCAL: 30, SECONDARY: 25, FILLER: 40, TOPPING: 50 }
// One focused registration pass for the new cutouts; ROUND_M stays exploratory.
const roundSPositions = {
  FOCAL: [[39, 38], [61, 40], [49, 46]],
  SECONDARY: [[37, 26], [63, 30]],
  FILLER: [[31, 39], [71, 42]],
  GREENERY: [[28, 31], [73, 32]],
  TOPPING: [[55, 44], [37, 43]],
}
const roundSRotations = {
  FOCAL: [-10, 9, 3], SECONDARY: [-9, 12], FILLER: [-28, 28],
  GREENERY: [-32, 32], TOPPING: [2, -8],
}
function makeSlots(small) {
  return Object.entries(small ? roundSPositions : positions).flatMap(([role, points]) => points
    .map(([x, y], index) => ({ id: `${role}-${index}`, role, x, y, scale: 1, rotation: small ? roundSRotations[role][index] : (index % 3 - 1) * 8, zIndex: depths[role] + index })))
}
export const templates = { ROUND_S: makeSlots(true), ROUND_M: makeSlots(false) }
export function initialLabState(template = 'ROUND_S') {
  return { template, items: [], nextId: 1, variation: 0, wrapperId: 'ivory', ribbonId: 'pink' }
}
export function defaultLabState(template = 'ROUND_S') {
  return ['rose', 'rose', 'rose', 'tulip', 'tulip', 'baby', 'baby', 'eucalyptus', 'eucalyptus', 'pearl']
    .reduce(addIngredient, initialLabState(template))
}
export function addIngredient(state, ingredientId) {
  const ingredient = ingredients.find((entry) => entry.id === ingredientId)
  if (!ingredient) return state
  const capacity = templates[state.template].filter((slot) => slot.role === ingredient.role).length
  const count = state.items.filter((item) => ingredients.find((entry) => entry.id === item.ingredientId).role === ingredient.role).length
  if (count >= capacity) return state
  return { ...state, nextId: state.nextId + 1, items: [...state.items, { id: state.nextId, ingredientId }] }
}
export function removeIngredient(state, id) { return { ...state, items: state.items.filter((item) => item.id !== id) } }
export function shuffleBouquet(state) { return { ...state, variation: state.variation + 1 } }
export function assignSlots(state) {
  const counts = {}
  return state.items.map((item) => {
    const ingredient = ingredients.find((entry) => entry.id === item.ingredientId)
    const slots = templates[state.template].filter((slot) => slot.role === ingredient.role)
    const index = counts[ingredient.role] ?? 0
    counts[ingredient.role] = index + 1
    const slot = slots[(index + state.variation) % slots.length]
    const seed = (item.id * 7 + state.variation * 3) % 16
    const image = ingredient.variants ? ingredient.variants[index % ingredient.variants.length] : ingredient.image
    return { ...item, ingredient, image, slot, rotation: slot.rotation + seed - 7, scale: slot.scale * (0.9 + seed / 100), mirror: item.id % 3 === 0 }
  })
}
export function referenceTotal(state) {
  return state.items.reduce((sum, item) => sum + ingredients.find((entry) => entry.id === item.ingredientId).referencePrice, 0)
    + wrappers.find((entry) => entry.id === state.wrapperId).referencePrice
    + ribbons.find((entry) => entry.id === state.ribbonId).referencePrice
}
