import test from 'node:test'
import assert from 'node:assert/strict'
import { chapterEntryAnimations } from '../src/components/cinematic/chapterEntryAnimation.js'
import { headlineRevealTiming } from '../src/components/cinematic/headlineGraphemes.js'
import { advanceCopyGate } from '../src/components/cinematic/chapterCopyGate.js'

test('one gated entry overlaps both frame strokes, label, graphemes and final CTA', () => {
  const groups = { '.lab-frame-stroke': [{ id: 'outer' }, { id: 'inner' }], '.lab-headline-grapheme': Array.from({ length: 30 }, (_, id) => ({ id })) }
  const container = { querySelectorAll: s => groups[s], querySelector: s => ({ id: s }) }
  const plans = chapterEntryAnimations(container)
  assert.equal(plans.length, 35)
  for (const frame of plans.slice(0, 2)) { assert.deepEqual(frame.frames, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }]); assert.equal(frame.delay, 0); assert.equal(frame.duration, 1150); assert.ok(!frame.holdForFont) }
  assert.equal(plans[2].delay, 220); assert.ok(!plans[2].holdForFont)
  const letters = plans.slice(4, 34)
  assert.equal(letters[0].delay, 380)
  letters.forEach((letter, i) => { assert.equal(letter.delay, 380 + i * 42); assert.equal(letter.duration, 220); assert.ok(letter.holdForFont); assert.equal(letter.frames[0].transform, 'translateY(5px)') })
  assert.equal(plans.at(-1).delay, 240 + headlineRevealTiming(30).ctaDelay)
  assert.ok(letters[0].delay < plans[0].duration && letters.at(-1).delay > plans[0].duration)
  const state = { armed: [true,true,true,true], epochs: [0,0,0,0] }
  const entries = p => advanceCopyGate(state, { from: 0, to: 1, mix: p }).filter(e => e.entered)
  advanceCopyGate(state,{from:0,to:0,mix:1})
  assert.equal(entries(.77).length, 1)
  for (const p of [.755,.765,.751,.78,.76]) assert.equal(entries(p).length, 0)
  advanceCopyGate(state,{from:1,to:1,mix:1}); entries(.6)
  assert.equal(entries(.2)[0].chapter, 0); assert.equal(state.epochs[0], 2)
})
