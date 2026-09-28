import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { ingredients, templates, initialLabState, defaultLabState, addIngredient, removeIngredient, shuffleBouquet, assignSlots, referenceTotal } from '../src/experiments/bouquetLab.js'

test('lab uses compatible, unique slots and respects both template capacities', () => {
  for (const template of Object.keys(templates)) {
    let state = initialLabState(template)
    for (const ingredient of ingredients) for (let i=0; i<20; i++) state=addIngredient(state,ingredient.id)
    assert.equal(state.items.length,templates[template].length)
    const assigned=assignSlots(state)
    assert.equal(new Set(assigned.map((item)=>item.slot.id)).size,assigned.length)
    assigned.forEach((item)=>assert.equal(item.slot.role,item.ingredient.role))
    assert.deepEqual(assignSlots(state),assigned)
  }
})
test('add/remove changes quantity and reference price; unknown ingredient is ignored', () => {
  const empty=initialLabState(); const added=addIngredient(empty,'rose')
  assert.equal(added.items.length,1); assert.equal(referenceTotal(added)-referenceTotal(empty),45000)
  const removed=removeIngredient(added,added.items[0].id)
  assert.equal(removed.items.length,0); assert.equal(referenceTotal(removed),referenceTotal(empty))
  assert.equal(addIngredient(empty,'unknown'),empty)
})
test('shuffle preserves exact identities, quantities, price and compatible deterministic placement', () => {
  let state=initialLabState('ROUND_M')
  for (const id of ['rose','rose','tulip','baby','eucalyptus','pearl']) state=addIngredient(state,id)
  const shuffled=shuffleBouquet(state)
  assert.deepEqual(shuffled.items,state.items); assert.equal(referenceTotal(shuffled),referenceTotal(state))
  assert.notDeepEqual(assignSlots(shuffled),assignSlots(state))
  assert.deepEqual(assignSlots(shuffled),assignSlots(shuffleBouquet(state)))
  assignSlots(shuffled).forEach((item)=>assert.equal(item.slot.role,item.ingredient.role))
})
test('wrapper/ribbon changes cannot corrupt slots and reduced-motion removes visual motion only', () => {
  const state=addIngredient(initialLabState(),'rose')
  assert.deepEqual(assignSlots({...state,wrapperId:'warm',ribbonId:'cream'}),assignSlots(state))
  const css=fs.readFileSync(new URL('../src/pages/BouquetLabPage.css',import.meta.url),'utf8')
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/u)
  assert.match(css,/animation:none!important; transition:none!important/u)
  assert.equal(addIngredient(state,'baby').items.length,2)
})
test('default illustrated bouquet has complete composition, varied roses and unchanged shuffle price', () => {
  const state=defaultLabState()
  const counts=Object.fromEntries(ingredients.map((ingredient)=>[ingredient.id,state.items.filter((item)=>item.ingredientId===ingredient.id).length]))
  assert.deepEqual(counts,{rose:3,tulip:2,baby:2,eucalyptus:2,pearl:1})
  const placed=assignSlots(state)
  assert.equal(new Set(placed.filter((item)=>item.ingredient.id==='rose').map((item)=>item.image)).size,3)
  assert.ok(placed.every((item)=>item.image))
  assert.equal(referenceTotal(state),302000)
  assert.equal(referenceTotal(shuffleBouquet(state)),referenceTotal(state))
  const page=fs.readFileSync(new URL('../src/pages/BouquetLabPage.jsx',import.meta.url),'utf8')
  assert.doesNotMatch(page,/bouquet-lab__guide|bouquet-lab__canvas-note|chưa có ảnh/u)
})
test('raster cutouts are local alpha WebP assets and lab slots keep ordered depth', () => {
  const directory=new URL('../src/assets/bouquet-lab/raster/',import.meta.url)
  const files=fs.readdirSync(directory).filter((name)=>name.endsWith('.webp'))
  assert.equal(files.length,13)
  for (const file of files) {
    const bytes=fs.readFileSync(new URL(file,directory))
    assert.equal(bytes.toString('ascii',0,4),'RIFF')
    assert.equal(bytes.toString('ascii',8,12),'WEBP')
    assert.equal(bytes.toString('ascii',12,16),'VP8X')
    assert.ok(bytes[20]&0x10,`${file} must preserve alpha`)
  }
  const slots=templates.ROUND_S
  const depth=(role)=>slots.find((slot)=>slot.role===role).zIndex
  assert.ok(depth('GREENERY')<depth('SECONDARY'))
  assert.ok(depth('SECONDARY')<depth('FOCAL'))
  assert.ok(depth('FOCAL')<depth('FILLER'))
  assert.ok(depth('FILLER')<depth('TOPPING'))
})
