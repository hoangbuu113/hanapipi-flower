import assert from 'node:assert/strict'
import test from 'node:test'
import { createScrollFrameGate } from '../src/components/cinematic/scrollFrame.js'

function frames(update) {
  const pending = new Map()
  let id = 0
  const gate = createScrollFrameGate(update, {
    requestFrame: cb => { const key = id++; pending.set(key, cb); return key },
    cancelFrame: key => pending.delete(key),
  })
  return { gate, pending, flush() { for (const [key, cb] of [...pending]) { pending.delete(key); cb() } } }
}

test('300 native inputs collapse into one latest-position sample, including reversal', () => {
  let position = 0
  const samples = [], f = frames(() => samples.push(position))
  for (let i = 0; i < 300; i++) { position = i < 200 ? i : 399 - i; f.gate.schedule() }
  assert.equal(f.pending.size, 1)
  assert.deepEqual(samples, [])
  f.flush()
  assert.deepEqual(samples, [100])
  assert.equal(f.pending.size, 0, 'stop creates no autonomous catch-up')
  position = 50; f.gate.schedule(); f.flush()
  assert.deepEqual(samples, [100, 50], 'reverse uses current position at the next display frame')
})

test('disposal cancels RAF id zero and rejects late callbacks and later input', () => {
  let updates = 0
  const f = frames(() => updates++)
  f.gate.schedule()
  const callback = f.pending.get(0)
  f.gate.dispose()
  assert.equal(f.pending.size, 0)
  callback(); f.gate.schedule()
  assert.equal(updates, 0)
  assert.equal(f.pending.size, 0)
})

test('input during a display update schedules only the next frame', () => {
  let updates = 0
  const f = frames(() => { updates++; if (updates === 1) { f.gate.schedule(); f.gate.schedule() } })
  f.gate.schedule(); f.flush()
  assert.equal(updates, 1); assert.equal(f.pending.size, 1)
  f.flush()
  assert.equal(updates, 2); assert.equal(f.pending.size, 0)
})
