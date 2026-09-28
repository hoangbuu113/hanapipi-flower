// Experimental recipe and composition only. No cart, D1 or backend integration.
import { bouquetLabCatalogue } from './bouquetLabAssets.js'
export { ingredients, wrappers, ribbons } from './bouquetLabAssets.js'

export const BOUQUET_RECIPE_VERSION = 1
const MAX_LAYOUT_VARIANT = 2
const MAX_SELECTION_ID = 100000
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

// Selection IDs keep individual blooms removable; they are not placement coordinates.
// BouquetRecipe v1 describes selections, never placement or imported image data.
export function createEmptyBouquetRecipe(templateId = 'ROUND_S') {
  return {
    version: BOUQUET_RECIPE_VERSION,
    templateId: templates[templateId] ? templateId : 'ROUND_S',
    ingredients: [],
    wrapperId: 'ivory',
    ribbonId: 'pink',
    layoutVariant: 0,
  }
}

export function createDefaultBouquetRecipe(templateId = 'ROUND_S') {
  return ['rose', 'rose', 'rose', 'tulip', 'tulip', 'baby', 'baby', 'eucalyptus', 'eucalyptus', 'pearl']
    .reduce((recipe, assetId) => addIngredient(recipe, assetId), createEmptyBouquetRecipe(templateId))
}

export function addIngredient(recipe, assetId, catalogue = bouquetLabCatalogue) {
  const asset = catalogue.ingredients.find((entry) => entry.id === assetId && entry.active)
  if (!asset || !templates[recipe.templateId]) return recipe
  const capacity = templates[recipe.templateId].filter((slot) => slot.role === asset.role).length
  const count = recipe.ingredients.reduce((sum, item) => sum + (item.role === asset.role ? item.quantity : 0), 0)
  if (count >= capacity) return recipe
  const usedIds = new Set(recipe.ingredients.flatMap((item) => item.selectionIds))
  let selectionId = 1
  while (usedIds.has(selectionId) && selectionId < MAX_SELECTION_ID) selectionId += 1
  if (selectionId >= MAX_SELECTION_ID) return recipe
  const existing = recipe.ingredients.find((item) => item.assetId === assetId)
  const ingredients = existing
    ? recipe.ingredients.map((item) => item.assetId === assetId ? { ...item, quantity: item.quantity + 1, selectionIds: [...item.selectionIds, selectionId] } : item)
    : [...recipe.ingredients, { assetId, role: asset.role, quantity: 1, selectionIds: [selectionId] }]
  return { ...recipe, ingredients }
}

export function removeIngredient(recipe, assetId, selectionId) {
  const existing = recipe.ingredients.find((item) => item.assetId === assetId)
  if (!existing || (selectionId !== undefined && !existing.selectionIds.includes(selectionId))) return recipe
  const ingredients = existing.quantity === 1
    ? recipe.ingredients.filter((item) => item.assetId !== assetId)
    : recipe.ingredients.map((item) => item.assetId === assetId ? {
      ...item,
      quantity: item.quantity - 1,
      selectionIds: item.selectionIds.filter((id) => id !== (selectionId ?? item.selectionIds.at(-1))),
    } : item)
  return { ...recipe, ingredients }
}

export function setWrapper(recipe, wrapperId, catalogue = bouquetLabCatalogue) {
  return catalogue.wrappers.some((item) => item.id === wrapperId && item.active)
    ? { ...recipe, wrapperId }
    : recipe
}

export function setRibbon(recipe, ribbonId, catalogue = bouquetLabCatalogue) {
  return catalogue.ribbons.some((item) => item.id === ribbonId && item.active)
    ? { ...recipe, ribbonId }
    : recipe
}

export function shuffleBouquet(recipe) {
  return { ...recipe, layoutVariant: (recipe.layoutVariant + 1) % (MAX_LAYOUT_VARIANT + 1) }
}

function normalizeBouquetRecipe(value, catalogue) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || value.version !== BOUQUET_RECIPE_VERSION || !templates[value.templateId]
    || !Array.isArray(value.ingredients)) return null

  const recipe = createEmptyBouquetRecipe(value.templateId)
  const roleCounts = {}
  const usedIds = new Set()
  for (const item of value.ingredients) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || !Number.isSafeInteger(item.quantity) || item.quantity < 1) continue
    const asset = catalogue.ingredients.find((entry) => entry.id === item.assetId && entry.active)
    if (!asset) continue
    const capacity = templates[recipe.templateId].filter((slot) => slot.role === asset.role).length
    const quantity = Math.min(item.quantity, capacity - (roleCounts[asset.role] ?? 0))
    if (quantity < 1) continue
    roleCounts[asset.role] = (roleCounts[asset.role] ?? 0) + quantity
    const selectionIds = Array.from({ length: quantity }, (_, index) => {
      const candidate = item.selectionIds?.[index]
      if (Number.isSafeInteger(candidate) && candidate > 0 && candidate < MAX_SELECTION_ID && !usedIds.has(candidate)) {
        usedIds.add(candidate)
        return candidate
      }
      let id = 1
      while (usedIds.has(id)) id += 1
      usedIds.add(id)
      return id
    })
    const existing = recipe.ingredients.find((entry) => entry.assetId === asset.id)
    if (existing) {
      existing.quantity += quantity
      existing.selectionIds.push(...selectionIds)
    } else recipe.ingredients.push({ assetId: asset.id, role: asset.role, quantity, selectionIds })
  }

  recipe.wrapperId = catalogue.wrappers.some((item) => item.id === value.wrapperId && item.active) ? value.wrapperId : recipe.wrapperId
  recipe.ribbonId = catalogue.ribbons.some((item) => item.id === value.ribbonId && item.active) ? value.ribbonId : recipe.ribbonId
  recipe.layoutVariant = Number.isSafeInteger(value.layoutVariant) && value.layoutVariant >= 0 && value.layoutVariant <= MAX_LAYOUT_VARIANT
    ? value.layoutVariant : 0
  return recipe
}

export function deserializeBouquetRecipe(value, catalogue = bouquetLabCatalogue) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    return normalizeBouquetRecipe(parsed, catalogue)
  } catch {
    return null
  }
}

export function serializeBouquetRecipe(recipe, catalogue = bouquetLabCatalogue) {
  const normalized = deserializeBouquetRecipe(recipe, catalogue)
  if (!normalized) throw new TypeError('Invalid BouquetRecipe')
  return JSON.stringify(normalized)
}

export function calculateBouquetReferencePrice(recipe, catalogue = bouquetLabCatalogue) {
  const valid = deserializeBouquetRecipe(recipe, catalogue)
  if (!valid) return 0
  const ingredientTotal = valid.ingredients.reduce((sum, item) => {
    const asset = catalogue.ingredients.find((entry) => entry.id === item.assetId)
    return sum + asset.referencePrice * item.quantity
  }, 0)
  const wrapper = catalogue.wrappers.find((item) => item.id === valid.wrapperId)
  const ribbon = catalogue.ribbons.find((item) => item.id === valid.ribbonId)
  return ingredientTotal + wrapper.referencePrice + ribbon.referencePrice
}

// RenderedBouquet is derived. Slots, visual variants and image URLs never enter the recipe.
export function composeBouquet(recipe, catalogue = bouquetLabCatalogue) {
  const valid = deserializeBouquetRecipe(recipe, catalogue)
  if (!valid) return null
  const counts = {}
  const items = valid.ingredients.flatMap(({ assetId, selectionIds }) => {
    const ingredient = catalogue.ingredients.find((entry) => entry.id === assetId)
    const slots = templates[valid.templateId].filter((slot) => slot.role === ingredient.role)
    return selectionIds.map((id) => {
      const index = counts[ingredient.role] ?? 0
      counts[ingredient.role] = index + 1
      const slot = slots[(index + valid.layoutVariant) % slots.length]
      const seed = (id * 7 + valid.layoutVariant * 3) % 16
      const image = ingredient.variants ? ingredient.variants[index % ingredient.variants.length] : ingredient.image
      return { id, assetId, ingredient, image, slot, rotation: slot.rotation + seed - 7, scale: slot.scale * (0.9 + seed / 100), mirror: id % 3 === 0 }
    })
  })
  return {
    items,
    wrapper: catalogue.wrappers.find((item) => item.id === valid.wrapperId),
    ribbon: catalogue.ribbons.find((item) => item.id === valid.ribbonId),
  }
}
