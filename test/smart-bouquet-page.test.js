import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import {
  ingredients, templates, createDefaultBouquetRecipe, addIngredient, removeIngredient,
  setWrapper, setRibbon, shuffleBouquet, composeBouquet, calculateBouquetReferencePrice,
} from '../src/experiments/bouquetLab.js'
import { createMinimalBouquetRecipe, getBouquetSummary } from '../src/experiments/smartBouquetView.js'

const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const page = fs.readFileSync(new URL('../src/pages/SmartBouquetPage.jsx', import.meta.url), 'utf8')
const css = fs.readFileSync(new URL('../src/pages/SmartBouquetPage.css', import.meta.url), 'utf8')

test('real Build Bouquet route uses Smart Composer; comparison route stays separate', () => {
  assert.ok(app.includes('path="build-your-bouquet" element={<SmartBouquetPage />}'))
  assert.ok(app.includes('path="build-bouquet-lab" element={<BouquetLabPage />}'))
  assert.match(page, /Tự tạo bó hoa/u)
  assert.match(page, /Tự phối một bó hoa theo cách của bạn/u)
})

test('curated starter, quantity controls and reference price use the accepted recipe', () => {
  const starter = createDefaultBouquetRecipe()
  const summary = getBouquetSummary(starter)
  assert.deepEqual(summary.ingredients.map((item) => [item.assetId, item.quantity]),
    [['rose', 3], ['tulip', 2], ['baby', 2], ['eucalyptus', 2], ['pearl', 1]])
  assert.equal(summary.wrapper, 'Kem / blush')
  assert.equal(summary.ribbon, 'Satin hồng')
  assert.equal(composeBouquet(starter).items.length, 10)
  assert.equal(calculateBouquetReferencePrice(starter), 302000)
  const added = addIngredient(starter, 'pearl')
  assert.equal(calculateBouquetReferencePrice(added), 314000)
  assert.equal(calculateBouquetReferencePrice(removeIngredient(added, 'pearl')), 302000)
  assert.ok(page.includes('aria-label={`Bớt ${asset.name}`}'))
  assert.ok(page.includes('aria-label={full ? `${asset.name} đã đạt giới hạn'))
})

test('template capacity, wrapper/ribbon selection and shuffle preserve recipe authority', () => {
  let recipe = createDefaultBouquetRecipe()
  assert.equal(addIngredient(recipe, 'rose'), recipe)
  assert.equal(recipe.ingredients.find((item) => item.assetId === 'rose').quantity,
    templates.ROUND_S.filter((slot) => slot.role === 'FOCAL').length)
  recipe = setRibbon(setWrapper(recipe, 'warm'), 'cream')
  assert.equal(recipe.wrapperId, 'warm')
  assert.equal(recipe.ribbonId, 'cream')
  const shuffled = shuffleBouquet(recipe)
  assert.deepEqual({ ...shuffled, layoutVariant: recipe.layoutVariant }, recipe)
  assert.equal(calculateBouquetReferencePrice(shuffled), calculateBouquetReferencePrice(recipe))
  assert.notDeepEqual(composeBouquet(shuffled).items, composeBouquet(recipe).items)
  assert.match(page, /setRecipe\(shuffleBouquet\)/u)
})

test('reset is a clean minimal bouquet and selected summary tracks changes', () => {
  const reset = createMinimalBouquetRecipe('ROUND_S')
  assert.deepEqual(getBouquetSummary(reset).ingredients.map((item) => item.assetId),
    ['rose', 'tulip', 'baby', 'eucalyptus'])
  assert.equal(getBouquetSummary(reset).ingredients.length, 4)
  assert.equal(getBouquetSummary(addIngredient(reset, 'pearl')).ingredients.at(-1).quantity, 1)
  assert.equal(calculateBouquetReferencePrice(reset), 145000)
  assert.match(page, /setRecipe\(createMinimalBouquetRecipe\(recipe.templateId\)\)/u)
  assert.match(page, /summary.ingredients.map/u)
})

test('public CTA is honest and has no commerce or consultation side effect', () => {
  assert.match(page, /Tiếp tục với bó hoa này/u)
  assert.match(page, /Bước gửi yêu cầu tư vấn sẽ được kết nối ở giai đoạn tiếp theo/u)
  assert.doesNotMatch(page, /useCommerce|addCustomBouquet|addToCart|createOrder|createConsultation|fetch\(/u)
  assert.doesNotMatch(page, /Phòng thử nghiệm|Bản thử nghiệm|debug|slot terminology/u)
  assert.ok(ingredients.every((item) => item.active))
})

test('public controls and preview retain accessible/mobile/reduced-motion behavior', () => {
  assert.ok(page.includes('aria-pressed={activeGroup === group.id}'))
  assert.match(page, /role="img"/u)
  assert.match(page, /aria-live="polite"/u)
  assert.match(css, /min-height: 44px/u)
  assert.match(css, /@media \(max-width: 767px\)/u)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u)
})
