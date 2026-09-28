import { bouquetLabCatalogue } from './bouquetLabAssets.js'
import { addIngredient, createEmptyBouquetRecipe, deserializeBouquetRecipe } from './bouquetLab.js'

export function createMinimalBouquetRecipe(templateId) {
  return ['rose', 'tulip', 'baby', 'eucalyptus']
    .reduce((recipe, assetId) => addIngredient(recipe, assetId), createEmptyBouquetRecipe(templateId))
}

export function getBouquetSummary(recipe, catalogue = bouquetLabCatalogue) {
  const valid = deserializeBouquetRecipe(recipe, catalogue)
  if (!valid) return null
  return {
    ingredients: valid.ingredients.map((item) => ({
      assetId: item.assetId,
      name: catalogue.ingredients.find((asset) => asset.id === item.assetId).name,
      quantity: item.quantity,
    })),
    wrapper: catalogue.wrappers.find((item) => item.id === valid.wrapperId).name,
    ribbon: catalogue.ribbons.find((item) => item.id === valid.ribbonId).name,
  }
}
