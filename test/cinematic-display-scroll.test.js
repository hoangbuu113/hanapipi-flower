import assert from 'node:assert/strict'
import test from 'node:test'
import { createDisplayScroll, advanceDisplayScroll, displayResponse, DISPLAY_RESPONSES } from '../src/components/cinematic/displayScroll.js'
import { authoredTransitionProgress, cinematicEase, TRANSITION_TIMELINES } from '../src/components/cinematic/transitionTimeline.js'
import { bloomRadiusAt } from '../src/components/cinematic/bloomReveal.js'
import { curtainOffsetAt } from '../src/components/cinematic/curtainGeometry.js'
import { advancePlayhead } from '../src/components/cinematic/sequenceMotion.js'

function harness(response) {
  let time = 0, target = 0, id = 0, reads = 0
  const pending = new Map(), samples = []
  const controller = createDisplayScroll({ initial: { position: 0, response },
    readTarget: () => { reads++; return { position: target, response } }, publish: position => samples.push(position), now: () => time,
    requestFrame: cb => { const key = id++; pending.set(key, cb); return key }, cancelFrame: key => pending.delete(key) })
  return { controller, samples, pending, get reads() { return reads }, input(value) { target = value; controller.schedule() },
    tick(dt) { time += dt; for (const [key, cb] of [...pending]) { pending.delete(key); cb(time) } } }
}
for (const response of DISPLAY_RESPONSES) {
  test(response + 'ms display smoother coalesces, uses intermediates, converges without overshoot and sleeps', () => {
    const h = harness(response)
    for (let n = 0; n < 300; n++) h.input(n + 1)
    assert.equal(h.reads, 0); assert.equal(h.pending.size, 1)
    h.tick(1000 / 75)
    assert.equal(h.reads, 1)
    if (response) assert.ok(h.samples[0] > 0 && h.samples[0] < 300)
    else assert.equal(h.samples[0], 300)
    for (let n = 0; n < 100 && h.pending.size; n++) h.tick(1000 / 75)
    assert.equal(h.controller.getState().position, 300); assert.equal(h.pending.size, 0)
    h.samples.forEach((value, n) => { assert.ok(value <= 300); if (n) assert.ok(value >= h.samples[n - 1]) })
    h.input(0); h.tick(1000 / 75)
    assert.ok(h.samples.at(-1) < 300)
    h.input(150); h.input(75); h.input(10); h.tick(1000 / 75)
    assert.equal(h.controller.getState().target, 10, 'no queued stale target')
    h.controller.dispose(); assert.equal(h.pending.size, 0)
    h.input(500); assert.equal(h.pending.size, 0)
  })
  test(response + 'ms convergence is identical at60/75/120Hz', () => {
    const end = hz => { let value = 0; for (let n = 0; n < hz; n++) value = advanceDisplayScroll(value, 1, 1000 / hz, response); return value }
    assert.ok(Math.abs(end(60) - end(75)) < 1e-12)
    assert.ok(Math.abs(end(75) - end(120)) < 1e-12)
    for (const hz of [60, 75, 120]) {
      const h = harness(response); h.input(1000)
      let frames = 0
      while (h.pending.size && frames < hz * 2) { h.tick(1000 / hz); frames++ }
      assert.equal(h.pending.size, 0)
      assert.ok(frames * 1000 / hz <= response * 2 + 1000 / hz + 1e-8, 'bounded stop catch-up')
      assert.equal(h.controller.getState().position, 1000)
    }
  })
}
test('target behind current display reverses on the very next frame without completing old intent', () => {
  const h = harness(250); h.input(1000); h.tick(100)
  const before = h.controller.getState().position
  h.input(0); h.tick(1000 / 75)
  assert.ok(h.controller.getState().position < before)
  h.controller.dispose()
})
test('resize samples latest geometry atomically and disposal cancels RAF id zero', () => {
  const h = harness(350); h.input(900); h.controller.resize()
  assert.equal(h.pending.size, 1); h.tick(1000 / 75)
  assert.equal(h.controller.getState().position, 900); assert.equal(h.pending.size, 0)
  const first = harness(250); first.input(100); first.controller.dispose(); assert.equal(first.pending.size, 0)
})
test('touch remains native, debug switches stay development-only and default is conservative150ms', () => {
  assert.equal(displayResponse({}), 150)
  for (const value of DISPLAY_RESPONSES) {
    const search = '?smooth=' + value
    assert.equal(displayResponse({ dev: true, search }), value)
    assert.equal(displayResponse({ dev: false, search }), 150)
    assert.equal(displayResponse({ mobile: true, dev: true, search }), 0)
    assert.equal(displayResponse({ touch: true, dev: true, search }), 0)
  }
  assert.equal(displayResponse({ dev: true, search: '?smooth=999' }), 150)
})
for (const chapter of [1, 2, 3]) {
  test('transition ' + chapter + ' time warp is monotone, continuous, symmetric and covers photo swap', () => {
    let previous = 0
    for (let n = 0; n <= 1000; n++) {
      const t = n / 1000, value = authoredTransitionProgress(t, chapter)
      assert.ok(value >= previous - 1e-10); assert.ok(value >= 0 && value <= 1)
      assert.ok(Math.abs(value + authoredTransitionProgress(1 - t, chapter) - 1) < 1e-8)
      previous = value
    }
    const p = TRANSITION_TIMELINES[chapter - 1]
    for (const point of [0, p.closeEnd, .5, p.openStart, 1]) {
      const center = authoredTransitionProgress(point, chapter)
      for (const delta of [-1e-7, 1e-7]) assert.ok(Math.abs(authoredTransitionProgress(point + delta, chapter) - center) < 1e-4)
    }
    assert.equal(authoredTransitionProgress(0, chapter), 0); assert.equal(authoredTransitionProgress(1, chapter), 1)
    assert.ok(Math.abs(authoredTransitionProgress(.5, chapter) - .5) < 1e-9)
    if (chapter === 1) { assert.equal(bloomRadiusAt(authoredTransitionProgress(.49, chapter)), 0); assert.equal(bloomRadiusAt(authoredTransitionProgress(.51, chapter)), 0) }
    if (chapter === 3) {
      const mix = authoredTransitionProgress(.49, chapter)
      assert.ok(mix >= .42 && mix <= .58)
      assert.ok(Math.abs(curtainOffsetAt(1, false, .5)) < 1e-9)
    }
  })
}
test('cinematic ease has a broad stable velocity plateau and gentle zero-velocity endpoints', () => {
  const derivative = t => (cinematicEase(t + 1e-5) - cinematicEase(t - 1e-5)) / 2e-5
  assert.ok(derivative(0) < .001); assert.ok(derivative(1) < .001)
  assert.ok(Math.abs(derivative(.2) - derivative(.5)) < 1e-8)
  assert.ok(Math.abs(derivative(.5) - derivative(.8)) < 1e-8)
  assert.ok(derivative(.5) < 1.23)
})
test('immediate Engine B response candidate follows exactly without NaN at zero elapsed', () => {
  for (const elapsed of [0, 1000 / 60, 1000 / 75, 1000 / 120]) assert.equal(advancePlayhead(0, 1, elapsed, 0), 1)
})

test('bounded exponential tail decelerates continuously before sleep, including coarse frames', () => {
  for (const hz of [60,75,120]) {
    const h = harness(150); h.input(1000)
    while (h.pending.size) h.tick(1000 / hz)
    const last = h.samples.at(-1), prior = h.samples.at(-2)
    assert.equal(last, 1000)
    assert.ok(last - prior < 10, 'no large tail snap at the300ms deadline')
    assert.ok(h.samples.length > 10)
  }
})

test('retiming does not create a faster bloom pigment exchange while broadening motion', () => {
  const quintic = t => { const p = Math.max(0, Math.min(1, t)); return p ** 3 * (p * (6 * p - 15) + 10) }
  const cubic = t => t * t * (3 - 2 * t)
  const tone = mix => quintic((mix - .44) / .12)
  const peak = fn => { let value = 0; for (let i = 1; i < 10000; i++) { const t = i / 10000; value = Math.max(value, Math.abs((fn(t + .00001) - fn(t - .00001)) / .00002)) } return value }
  const before = peak(t => tone(cubic(t)))
  const after = peak(t => tone(authoredTransitionProgress(t, 1)))
  assert.ok(after <= before * 1.001, 'opaque exchange preserves pigment velocity')
})
