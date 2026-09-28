import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import {
  BOUQUET_RECIPE_VERSION, ingredients, ribbons, templates, wrappers,
  createEmptyBouquetRecipe, createDefaultBouquetRecipe, addIngredient, removeIngredient,
  setWrapper, setRibbon, shuffleBouquet, composeBouquet, calculateBouquetReferencePrice,
  serializeBouquetRecipe, deserializeBouquetRecipe,
} from '../src/experiments/bouquetLab.js'
import { bouquetLabCatalogue } from '../src/experiments/bouquetLabAssets.js'

test('default recipe is versioned, valid and preserves the approved visual composition', () => {
  const recipe = createDefaultBouquetRecipe()
  assert.equal(recipe.version, BOUQUET_RECIPE_VERSION)
  assert.equal(recipe.templateId, 'ROUND_S')
  assert.deepEqual(Object.fromEntries(recipe.ingredients.map((item) => [item.assetId, item.quantity])),
    { rose: 3, tulip: 2, baby: 2, eucalyptus: 2, pearl: 1 })
  assert.equal(recipe.wrapperId, 'ivory')
  assert.equal(recipe.ribbonId, 'pink')
  assert.equal(recipe.layoutVariant, 0)
  const rendered = composeBouquet(recipe)
  assert.equal(rendered.items.length, 10)
  assert.equal(new Set(rendered.items.map((item) => item.slot.id)).size, 10)
  assert.equal(new Set(rendered.items.filter((item) => item.assetId === 'rose').map((item) => item.image)).size, 3)
  assert.equal(calculateBouquetReferencePrice(recipe), 302000)
  assert.deepEqual(deserializeBouquetRecipe(serializeBouquetRecipe(recipe)), recipe)
})

test('serialization roundtrip carries selections only, without images, functions, price or slots', () => {
  const recipe = setRibbon(setWrapper(createDefaultBouquetRecipe(), 'warm'), 'cream')
  const serialized = serializeBouquetRecipe(recipe)
  assert.deepEqual(deserializeBouquetRecipe(serialized), recipe)
  assert.deepEqual(Object.keys(JSON.parse(serialized)),
    ['version', 'templateId', 'ingredients', 'wrapperId', 'ribbonId', 'layoutVariant'])
  assert.ok(recipe.ingredients.every((item) => Object.keys(item).join(',') === 'assetId,role,quantity,selectionIds'))
  assert.doesNotMatch(serialized, /image|\.webp|referencePrice|slot|function|backImage/u)
  assert.equal(JSON.stringify(recipe), serialized)
})

test('malformed input rejects unsupported shape/version and normalizes unknown or spoofed selections', () => {
  assert.equal(deserializeBouquetRecipe('{'), null)
  assert.equal(deserializeBouquetRecipe({ version: 2, templateId: 'ROUND_S', ingredients: [] }), null)
  assert.equal(deserializeBouquetRecipe({ version: 1, templateId: 'UNKNOWN', ingredients: [] }), null)
  assert.equal(deserializeBouquetRecipe({ version: 1, templateId: 'ROUND_S', ingredients: 'rose' }), null)
  assert.throws(() => serializeBouquetRecipe({ version: 2 }), TypeError)
  const input = {
    version: 1, templateId: 'ROUND_S',
    ingredients: [
      { assetId: 'unknown', role: 'FOCAL', quantity: 4 },
      { assetId: 'rose', role: 'TOPPING', quantity: 500, price: 1, image: 'fake' },
      { assetId: 'rose', role: 'FOCAL', quantity: 2 },
      { assetId: 'tulip', quantity: -1 },
    ],
    wrapperId: 'unknown', ribbonId: 'unknown', layoutVariant: 999, total: 1,
  }
  assert.deepEqual(deserializeBouquetRecipe(input), {
    version: 1, templateId: 'ROUND_S', ingredients: [{ assetId: 'rose', role: 'FOCAL', quantity: 3, selectionIds: [1, 2, 3] }],
    wrapperId: 'ivory', ribbonId: 'pink', layoutVariant: 0,
  })
  assert.equal(addIngredient(createEmptyBouquetRecipe(), 'unknown').ingredients.length, 0)
})

test('quantity bounds are per template role; mutations are immutable', () => {
  for (const templateId of Object.keys(templates)) {
    let recipe = createEmptyBouquetRecipe(templateId)
    for (const asset of ingredients) for (let index = 0; index < 20; index += 1) recipe = addIngredient(recipe, asset.id)
    assert.equal(recipe.ingredients.reduce((sum, item) => sum + item.quantity, 0), templates[templateId].length)
    const rendered = composeBouquet(recipe)
    assert.equal(new Set(rendered.items.map((item) => item.slot.id)).size, rendered.items.length)
    assert.ok(rendered.items.every((item) => item.slot.role === item.ingredient.role))
  }
  const empty = createEmptyBouquetRecipe()
  const added = addIngredient(empty, 'rose')
  const removed = removeIngredient(added, 'rose')
  assert.equal(empty.ingredients.length, 0)
  assert.equal(added.ingredients[0].quantity, 1)
  assert.equal(removed.ingredients.length, 0)
  assert.equal(removeIngredient(empty, 'unknown'), empty)
  assert.equal(setWrapper(empty, 'unknown'), empty)
  assert.equal(setRibbon(empty, 'unknown'), empty)
  const roses = addIngredient(addIngredient(added, 'rose'), 'rose')
  const middleRemoved = removeIngredient(roses, 'rose', 2)
  assert.deepEqual(middleRemoved.ingredients[0].selectionIds, [1, 3])
  assert.deepEqual(composeBouquet(middleRemoved).items.map((item) => item.id), [1, 3])
  assert.deepEqual(roses.ingredients[0].selectionIds, [1, 2, 3])
})

test('price comes only from active catalogue metadata, not serialized client values', () => {
  const recipe = createDefaultBouquetRecipe()
  const forged = { ...recipe, price: 1, total: 1, ingredients: recipe.ingredients.map((item) => ({ ...item, referencePrice: 1 })) }
  assert.equal(calculateBouquetReferencePrice(forged), 302000)
  const changedCatalogue = {
    ...bouquetLabCatalogue,
    ingredients: bouquetLabCatalogue.ingredients.map((item) => item.id === 'rose' ? { ...item, referencePrice: 50000 } : item),
  }
  assert.equal(calculateBouquetReferencePrice(forged, changedCatalogue), 317000)
  assert.equal(calculateBouquetReferencePrice(deserializeBouquetRecipe('{"version":2}')), 0)
})

test('shuffle changes only layoutVariant and composition is deterministic', () => {
  const recipe = createDefaultBouquetRecipe()
  const shuffled = shuffleBouquet(recipe)
  assert.deepEqual({ ...shuffled, layoutVariant: recipe.layoutVariant }, recipe)
  assert.equal(shuffled.layoutVariant, 1)
  assert.equal(calculateBouquetReferencePrice(shuffled), calculateBouquetReferencePrice(recipe))
  assert.notDeepEqual(composeBouquet(shuffled).items, composeBouquet(recipe).items)
  assert.deepEqual(composeBouquet(shuffled), composeBouquet(deserializeBouquetRecipe(serializeBouquetRecipe(shuffled))))
  assert.equal(shuffleBouquet(shuffleBouquet(shuffled)).layoutVariant, 0)
})

test('local asset catalogue keeps active cutouts and ordered visual depth', () => {
  assert.ok([...ingredients, ...wrappers, ...ribbons].every((item) => item.active))
  const directory = new URL('../src/assets/bouquet-lab/raster/', import.meta.url)
  const files = fs.readdirSync(directory).filter((name) => name.endsWith('.webp'))
  assert.equal(files.length, 13)
  for (const file of files) {
    const bytes = fs.readFileSync(new URL(file, directory))
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF')
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP')
    assert.equal(bytes.toString('ascii', 12, 16), 'VP8X')
    assert.ok(bytes[20] & 0x10, `${file} must preserve alpha`)
  }
  const slots = templates.ROUND_S
  const depth = (role) => slots.find((slot) => slot.role === role).zIndex
  assert.ok(depth('GREENERY') < depth('SECONDARY'))
  assert.ok(depth('SECONDARY') < depth('FOCAL'))
  assert.ok(depth('FOCAL') < depth('FILLER'))
  assert.ok(depth('FILLER') < depth('TOPPING'))
  const css = fs.readFileSync(new URL('../src/pages/BouquetLabPage.css', import.meta.url), 'utf8')
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/u)
  const page = fs.readFileSync(new URL('../src/pages/BouquetLabPage.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(page, /bouquet-lab__guide|bouquet-lab__canvas-note|chưa có ảnh/u)
})
