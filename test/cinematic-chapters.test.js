import assert from 'node:assert/strict'
import test from 'node:test'
import { register } from 'node:module'
import { CHAPTERS, CHAPTER_STARTS, SCROLL, chapterAtProgress, CHAPTER_DISSOLVE, CHAPTER_PAINT_SPAN, CHAPTER_CURTAIN_SPAN, chapterTransitionAtProgress } from '../src/components/cinematic/cinematicConfig.js'

import { paintReveal, paintBrushMask, PAINT_PALETTES, paintPaletteAt } from '../src/components/cinematic/paintReveal.js'
import { bloomRadiusAt, bloomReveal, bloomPetalShapes } from '../src/components/cinematic/bloomReveal.js'
import { bloomPaletteAt } from '../src/components/cinematic/bloomPalette.js'
import { curtainOffsetAt, curtainShape } from '../src/components/cinematic/curtainGeometry.js'

register('./cart-component-loader.js', import.meta.url)
const React = await import('react')
const { act, create } = await import('react-test-renderer')
const ChapterImages = (await import('../src/components/cinematic/ChapterImages.jsx')).default
const CinematicLabPage = (await import('../src/pages/CinematicLabPage.jsx')).default
const ChapterFrame = (await import('../src/components/cinematic/ChapterFrame.jsx')).default

test('all three chapter effects gain 50% travel without changing photographs or settled holds', () => {
  assert.deepEqual([0, .3, .5, 1].map(chapterAtProgress), [0, 1, 2, 3])
  assert.deepEqual([1, .5, .3, 0].map(chapterAtProgress), [3, 2, 1, 0])
  assert.equal(chapterAtProgress(-1), 0)
  assert.equal(chapterAtProgress(2), 3)
  CHAPTER_STARTS.slice(1).forEach((start, index) => {
    assert.equal(chapterAtProgress(start - 1e-8), index)
    assert.equal(chapterAtProgress(start), index + 1)
  })
  assert.deepEqual(CHAPTERS.map(c => c.src.split('?')[0]), [1, 2, 3, 4].map(n => '/media/hanapipi/chapters/chapter-0' + n + '-new.png'))
  assert.ok(Math.abs(SCROLL.desktop - 1371.83) < 1e-9)
  assert.ok(Math.abs(SCROLL.mobile - 1190.14) < 1e-9)
  assert.ok(Math.abs(CHAPTER_STARTS[1] * SCROLL.desktopTravel - 209.775) < 1e-9)
  assert.ok(Math.abs(CHAPTER_STARTS[2] * SCROLL.desktopTravel - 527.28) < 1e-9)
  assert.ok(Math.abs(CHAPTER_DISSOLVE * SCROLL.desktopTravel - 179.55) < 1e-9)
  assert.ok(Math.abs(CHAPTER_PAINT_SPAN * SCROLL.desktopTravel - 215.46) < 1e-9)
  assert.ok(Math.abs((CHAPTER_STARTS[2] - CHAPTER_PAINT_SPAN / 2) * SCROLL.desktopTravel - 419.55) < 1e-9)
  assert.ok(Math.abs(CHAPTER_PAINT_SPAN * SCROLL.desktopTravel / 143.64 - 1.5) < 1e-9)
  assert.ok(Math.abs(CHAPTER_CURTAIN_SPAN * SCROLL.desktopTravel - 430.92) < 1e-9)
  assert.ok(Math.abs((CHAPTER_STARTS[3] - CHAPTER_CURTAIN_SPAN / 2) * SCROLL.desktopTravel - 755.01) < 1e-9)
})


test('first three photographs have equal settled viewing distance on desktop and mobile', () => {
  const spans = [CHAPTER_DISSOLVE, CHAPTER_PAINT_SPAN, CHAPTER_CURTAIN_SPAN]
  const sections = spans.map((span, index) => ({
    start: index === 0 ? 0 : CHAPTER_STARTS[index] + spans[index - 1] / 2,
    end: CHAPTER_STARTS[index + 1] - span / 2,
  }))
  for (const travel of [SCROLL.desktopTravel, SCROLL.mobile - 100]) {
    const distances = sections.map(section => (section.end - section.start) * travel)
    assert.ok(distances.every(distance => Math.abs(distance - distances[0]) < 1e-9))
    assert.ok(distances[0] > 100, 'retain enough settled scroll travel to view every photograph')
  }
  assert.ok(sections.every(section => Math.abs((section.end - section.start) * SCROLL.desktopTravel - 120) < 1e-9))
  sections.forEach((section, chapter) => {
    for (const sample of [.05, .5, .95]) {
      const state = chapterTransitionAtProgress(section.start + (section.end - section.start) * sample)
      assert.equal(state.from, chapter)
      assert.equal(state.to, chapter)
      assert.equal(state.copyIn, 1)
      assert.equal(state.copyOut, 1)
    }
  })
})

test('settled chapters display one photograph without a canvas or video', async () => {
  const previousAct = globalThis.IS_REACT_ACT_ENVIRONMENT
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  let renderer
  try {
    for (const chapter of [0, 1, 2, 3, 2, 1, 0]) {
      await act(async () => {
        const element = React.createElement(ChapterImages, { transition: chapterTransitionAtProgress([0, .3, .55, 1][chapter]) })
        if (renderer) renderer.update(element)
        else renderer = create(element)
      })
      const scenes = renderer.root.findAll(n => n.props.className === 'chapter-image-scene')
      assert.deepEqual(scenes.filter(n => !n.props.hidden).map(n => n.props['data-chapter']), [chapter + 1])
      assert.equal(scenes[chapter].findByType('img').props.src, CHAPTERS[chapter].src)
      assert.equal(renderer.root.findAllByType('canvas').length, 0)
      assert.equal(renderer.root.findAllByType('video').length, 0)
      const finalPetals = renderer.root.findAll(n => n.props.className === 'chapter-final-petals')
      assert.equal(finalPetals.length, chapter === 3 ? 1 : 0)
      if (chapter === 3) assert.equal(finalPetals[0].findAll(n => n.props.className === 'chapter-final-petal').length, 8)
    }
  } finally {
    if (renderer) await act(async () => renderer.unmount())
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousAct
  }
})



test('petals begin from the top only after the curtain finishes, including reverse and re-entry', async () => {
  const previousAct = globalThis.IS_REACT_ACT_ENVIRONMENT
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  let renderer
  const end = CHAPTER_STARTS[3] + CHAPTER_CURTAIN_SPAN / 2
  const renderAt = async progress => {
    await act(async () => {
      const element = React.createElement(ChapterImages, { transition: chapterTransitionAtProgress(progress) })
      if (renderer) renderer.update(element)
      else renderer = create(element)
    })
  }
  const petals = () => renderer.root.findAll(n => n.props.className === 'chapter-final-petal')
  try {
    for (const progress of [CHAPTER_STARTS[3], end - .001, end - 1e-7]) {
      await renderAt(progress)
      assert.equal(petals().length, 0, 'no falling petals while the curtain is still opening')
    }
    await renderAt(end + 1e-7)
    assert.equal(petals().length, 8)
    const delays = petals().map(n => parseFloat(n.props.style['--petal-delay']))
    assert.ok(delays[0] > 0, 'first petal waits briefly after the curtain clears')
    assert.ok(delays.every((delay, index) => delay >= 0 && (!index || delay > delays[index - 1])), 'all petals start fresh with positive stagger, never midway down the screen')
    await act(async () => renderer.root.findAll(n => n.props.className === 'chapter-final-petal-sprite')[0].props.onClick())
    await renderAt(end - .001)
    assert.equal(petals().length, 0, 'reverse scroll removes petals before the curtain returns')
    await renderAt(end + 1e-7)
    assert.ok(petals().every(n => !n.props['data-dissolving']), 're-entry starts a fresh fall without old click effects')
    assert.deepEqual(petals().map(n => parseFloat(n.props.style['--petal-delay'])), delays)
  } finally {
    if (renderer) await act(async () => renderer.unmount())
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousAct
  }
})

test('clicked petal dissolves independently and returns only on its next fall cycle', async () => {
  const previousAct = globalThis.IS_REACT_ACT_ENVIRONMENT
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  let renderer
  try {
    await act(async () => { renderer = create(React.createElement(ChapterImages, { transition: chapterTransitionAtProgress(1) })) })
    const petals = () => renderer.root.findAll(n => n.props.className === 'chapter-final-petal')
    const sprites = () => renderer.root.findAll(n => n.props.className === 'chapter-final-petal-sprite')
    const styles = petals().map(n => n.props.style)
    await act(async () => sprites()[0].props.onClick())
    assert.equal(petals()[0].props['data-dissolving'], true)
    assert.ok(petals().slice(1).every(n => !n.props['data-dissolving']), 'other falling petals stay intact')
    assert.equal(petals()[0].findAll(n => n.props.className === 'chapter-petal-dust').length, 6)
    await act(async () => sprites()[0].props.onClick())
    assert.equal(petals()[0].props['data-dissolving'], true, 'repeat click must not resurrect the petal')
    assert.deepEqual(petals().map(n => n.props.style), styles, 'fall phase and trajectory stay unchanged')
    const outer = {}
    await act(async () => petals()[0].props.onAnimationIteration({ target: {}, currentTarget: outer }))
    assert.equal(petals()[0].props['data-dissolving'], true, 'a child event must not reset the petal')
    await act(async () => petals()[0].props.onAnimationIteration({ target: outer, currentTarget: outer }))
    assert.equal(petals()[0].props['data-dissolving'], undefined)
    await act(async () => sprites()[1].props.onClick())
    assert.equal(petals()[1].props['data-dissolving'], true)
    await act(async () => renderer.update(React.createElement(ChapterImages, { transition: chapterTransitionAtProgress(.5) })))
    assert.equal(sprites().length, 0, 'leaving Chapter 4 removes all particles and effects')
  } finally {
    if (renderer) await act(async () => renderer.unmount())
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousAct
  }
})

test('native scroll keeps image and copy synchronized, handles resize and releases listeners', async () => {
  const originals = { window: globalThis.window, observer: globalThis.ResizeObserver, act: globalThis.IS_REACT_ACT_ENVIRONMENT }
  const listeners = new Map(), frames = new Map()
  const dispatch = type => listeners.get(type)?.forEach(fn => fn())
  let clock = 0, nextFrame = 0, height = SCROLL.desktop * 10, top = -(height - 1000) * .5, disconnected = 0
  let reduced = false, renderer, staticFrameProps
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  globalThis.window = {
    innerHeight: 1000,
    matchMedia: query => ({ matches: query.includes('reduced-motion') && reduced, addEventListener() {}, removeEventListener() {} }),
    addEventListener: (type, handler) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(handler) },
    removeEventListener: (type, handler) => { listeners.get(type)?.delete(handler); if (!listeners.get(type)?.size) listeners.delete(type) },
    requestAnimationFrame: handler => { frames.set(++nextFrame, handler); return nextFrame },
    cancelAnimationFrame: id => frames.delete(id),
  }
  globalThis.ResizeObserver = class { observe() {} disconnect() { disconnected++ } }
  const flush = () => {
    for (let count = 0; frames.size && count < 120; count++) {
      clock += 1000 / 60
      for (const [id, handler] of [...frames]) { frames.delete(id); handler(clock) }
    }
    assert.equal(frames.size, 0, 'bounded catch-up sleeps after settling')
  }
  const check = chapter => {
    const frameProps = renderer.root.findAll(n => n.type === 'svg' && n.props.className === 'lab-chapter-frame').map(n => n.props)
    if (staticFrameProps) frameProps.forEach((props, index) => assert.equal(props, staticFrameProps[index], 'static copy frames do not rerender with displayed progress'))
    staticFrameProps = frameProps
    const scenes = renderer.root.findAll(n => n.props.className === 'chapter-image-scene')
    assert.deepEqual(scenes.filter(n => !n.props.hidden).map(n => n.props['data-chapter']), [chapter + 1])
    const copies = renderer.root.findAll(n => typeof n.props.className === 'string' && /^lab-copy lab-copy--/.test(n.props.className))
    assert.equal(copies.filter(n => !n.props.hidden).length, 1)
    assert.equal(copies[chapter].props.hidden, false)
    assert.equal(copies[chapter].findByProps({ className: 'lab-copy-content' }).findAll(n => n.props.className === 'lab-chapter-frame').length, 1)
    assert.equal(copies[chapter].findByProps({ className: 'lab-kicker' }).findAll(n => n.props.className === 'lab-chapter-frame').length, 0)
    assert.equal(renderer.root.findByProps({ className: 'lab-chapter-count' }).children.join(''), String(chapter + 1).padStart(2, '0') + ' — 04')
  }
  try {
    await act(async () => { renderer = create(React.createElement(CinematicLabPage), { createNodeMock: element => element.props.className === 'lab-scroll-region' ? { getBoundingClientRect: () => ({ top, height }) } : { querySelector: () => null } }) })
    check(2) // Restored scroll position is applied on mount.
    for (const [p, chapter] of [[1, 3], [.3, 1], [0, 0]]) {
      top = -(height - window.innerHeight) * p
      await act(async () => { dispatch('scroll'); dispatch('scroll'); assert.equal(frames.size, 1, 'input burst shares one display frame'); flush() })
      check(chapter)
    }
    height = SCROLL.mobile * 10; top = -(height - window.innerHeight) * .5
    await act(async () => { dispatch('resize'); flush() })
    check(2)
    top = -1000
    dispatch('scroll')
    assert.equal(frames.size, 1, 'large reversal queues only the latest position')
    await act(async () => flush())
    check(0)
    top = -500
    dispatch('scroll')
    assert.equal(frames.size, 1, 'same-chapter input also shares display scheduling')
    await act(async () => renderer.unmount())
    renderer = null
    assert.equal(frames.size, 0)
    assert.equal(listeners.size, 0)
    assert.equal(disconnected, 1)

    reduced = true
    await act(async () => { renderer = create(React.createElement(CinematicLabPage)) })
    assert.equal(listeners.size, 0)
    assert.equal(renderer.root.findAll(n => n.props.className === 'chapter-experience').length, 0)
    assert.equal(renderer.root.findAllByType('img').length, 4)
    const copies = renderer.root.findAll(n => typeof n.props.className === 'string' && /^lab-copy lab-copy--/.test(n.props.className))
    assert.equal(copies.filter(n => !n.props.hidden).length, 4)
    assert.ok(renderer.root.findAllByType('a').some(n => n.props.href === '/shop'))
  } finally {
    if (renderer) await act(async () => renderer.unmount())
    globalThis.window = originals.window
    globalThis.ResizeObserver = originals.observer
    globalThis.IS_REACT_ACT_ENVIRONMENT = originals.act
  }
})

test('material handoffs are reversible without full-frame ghosting', async () => {
  const previousAct = globalThis.IS_REACT_ACT_ENVIRONMENT
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  let renderer
  try {
    for (const [index, boundary] of CHAPTER_STARTS.slice(1).entries()) {
      const samples = []
      const span = index === 2 ? CHAPTER_CURTAIN_SPAN : index === 1 ? CHAPTER_PAINT_SPAN : CHAPTER_DISSOLVE
      for (const t of [0, .1, .25, .5, .75, .9, 1]) {
        const p = boundary + (t - .5) * span
        const state = chapterTransitionAtProgress(p)
        samples.push(state)
        await act(async () => {
          const element = React.createElement(ChapterImages, { transition: state })
          if (renderer) renderer.update(element)
          else renderer = create(element)
        })
        const visible = renderer.root.findAll(n => n.props.className === 'chapter-image-scene' && !n.props.hidden)
        assert.ok(visible.length >= 1 && visible.length <= 2)
        assert.ok(visible.every(n => n.props.style.opacity === 1))
        assert.ok(state.copyOut === 0 || state.copyIn === 0 || state.from === state.to)
        assert.equal(renderer.root.findAll(n => n.props.className === 'chapter-sheer-curtains').length, state.from !== state.to && state.to === 3 ? 1 : 0)
        if (t > 0 && t < 1) {
          assert.equal(renderer.root.findAll(n => n.props.className === 'chapter-final-petals').length, 0, 'petals must not spill into another chapter or the curtain handoff')
          assert.deepEqual([state.from, state.to], [index, index + 1])
          if (index === 2) {
            // Exactly one complete photograph: incoming cannot expose the old room.
            assert.equal(visible.length, 1)
            assert.equal(visible[0].props['data-chapter'], state.mix < .5 ? 3 : 4)
            assert.equal(visible[0].props.style.maskImage, 'none')
            const cover = renderer.root.findByProps({ className: 'chapter-sheer-curtains' })
            if (state.mix >= .18 && state.mix <= .88) assert.equal(cover.props.style.opacity, 1)
            const panels = renderer.root.findAll(n => n.props.className?.startsWith('chapter-sheer-curtain chapter-sheer-curtain--'))
            assert.equal(panels.length, 2)
            if (state.mix >= .42 && state.mix <= .58) {
              assert.ok(panels.every(panel => panel.props.style == null))
            }
            const bases = renderer.root.findAll(n => n.type === 'path' && n.props.fillOpacity != null)
            assert.equal(bases.length, 2)
            assert.ok(bases.every(n => n.props.fillOpacity === '1'))
          } else if (index === 1) {
            assert.equal(visible.length, 1)
            assert.equal(visible[0].props['data-chapter'], state.mix < .5 ? 2 : 3)
            assert.equal(visible[0].props.style.maskImage, 'none')
            const wash = renderer.root.findByProps({ className: 'chapter-paint-wash' })
            assert.equal(wash.props.style.maskImage, paintReveal(state.mix).mask)
            assert.equal(wash.props.style.maskSize, paintReveal(state.mix).maskSize)
            assert.equal(wash.props.style.maskComposite, paintReveal(state.mix).maskComposite)
            assert.equal(wash.findAllByProps({ className: 'chapter-paint-pastel' }).length, 0, 'no phase-specific central texture patch')
            assert.equal(wash.findAllByType('filter').length, 0)
          } else {
            assert.equal(visible.length, 1)
            assert.equal(visible[0].props['data-chapter'], state.mix < .5 ? 1 : 2)
            assert.equal(visible[0].props.style.maskImage, 'none')
            const bloom = renderer.root.findByProps({ className: 'chapter-bloom-iris' })
            assert.equal(bloom.findAllByType('clipPath').length, 0, 'moving base avoids overlapping SVG clips')
            assert.equal(bloom.findAllByType('filter').length, 0)
            assert.equal(bloom.findByProps({ className: 'chapter-bloom-base' }).findAllByType('rect').length, 2)
            assert.equal(renderer.root.findAll(n => n.props.className === 'chapter-paint-wash').length, 0)
          }
        }
      }
      assert.equal(samples[0].from, index)
      assert.equal(samples.at(-1).to, index + 1)
      assert.ok(Math.abs(samples[3].mix - .5) < 1e-9)
      const fades = samples.slice(1, -1).map(s => s.mix)
      assert.deepEqual(fades, [...fades].sort((a,b) => a-b))
      for (const t of [1, .75, .5, .25, 0]) {
        const p = boundary + (t - .5) * span
        assert.deepEqual(chapterTransitionAtProgress(p), samples[[0, .1, .25, .5, .75, .9, 1].indexOf(t)])
      }
    }
  } finally {
    if (renderer) await act(async () => renderer.unmount())
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousAct
  }
})

test('final photograph switches only while the silk is completely closed', async () => {
  const previousAct = globalThis.IS_REACT_ACT_ENVIRONMENT
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  let renderer
  try {
    for (const mix of [.18, .42, .44, .499, .5, .501, .56, .58, .88, .58, .501, .5, .499, .42, .18]) {
      await act(async () => {
        const element = React.createElement(ChapterImages, { transition: { from: 2, to: 3, mix } })
        if (renderer) renderer.update(element)
        else renderer = create(element)
      })
      const photos = renderer.root.findAll(n => n.props.className === 'chapter-image-scene' && !n.props.hidden)
      assert.equal(photos.length, 1)
      assert.equal(photos[0].props['data-chapter'], mix < .5 ? 3 : 4)
      assert.equal(photos[0].props.style.maskImage, 'none')
      assert.equal(renderer.root.findByProps({ className: 'chapter-sheer-curtains' }).props.style.opacity, 1)
      const tones = renderer.root.findAll(n => n.type === 'linearGradient' && n.props.id.endsWith('-base')).map(n => n.findAll(c => c.type === 'stop' && c.props.offset === '1')[0])
      if (mix <= .44) assert.ok(tones.every(n => n.props.stopColor === '#e2e5e8'))
      if (mix >= .56) assert.ok(tones.every(n => n.props.stopColor === '#d4b3a9'))
      if (mix >= .42 && mix <= .58) {
        const panels = renderer.root.findAll(n => n.props.className?.startsWith('chapter-sheer-curtain chapter-sheer-curtain--'))
        assert.ok(panels.every(n => n.props.style == null))
        const bases = renderer.root.findAll(n => n.type === 'path' && n.props.fillOpacity === '1')
        assert.ok(bases.every(n => n.props.d === curtainShape(1, false).edge))
      }
    }
  } finally {
    if (renderer) await act(async () => renderer.unmount())
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousAct
  }
})

test('painted bloom flows from bouquet blush to carmine and wine through one surface, reversing exactly', () => {
  assert.equal(paintReveal(0).scene, 0)
  assert.equal(paintReveal(1).scene, 1)
  assert.equal(paintReveal(0).phase, 0)
  assert.equal(paintReveal(1).phase, 1)
  for (const mix of [.45, .499, .5, .501, .55]) {
    assert.equal(paintReveal(mix).mask, 'none', 'opaque ground covers the one-photo swap')
    assert.equal(paintReveal(mix).scene, mix < .5 ? 0 : 1)
  }
  assert.deepEqual(paintReveal(-1), paintReveal(0))
  assert.deepEqual(paintReveal(NaN), paintReveal(0))
  assert.deepEqual(paintReveal(2), paintReveal(1))
  assert.deepEqual(paintReveal(0).colors, PAINT_PALETTES[0])
  assert.deepEqual(paintReveal(1).colors, PAINT_PALETTES.at(-1))
  assert.deepEqual(paintPaletteAt(.25)[1], PAINT_PALETTES[1][1])
  assert.deepEqual(paintPaletteAt(.5)[1], PAINT_PALETTES[2][1])
  assert.notDeepEqual(paintReveal(.25).colors, paintReveal(.75).colors)
  for (const mix of [0, .2, .44, .45, .5, .55, .75, 1]) {
    assert.equal('pinkOpacity' in paintReveal(mix), false, 'no separate central material')
  }
  assert.equal(paintReveal(.12).mask, paintReveal(.35).mask, 'path is encoded once; only coverage size changes')
  assert.notEqual(paintReveal(.12).maskSize, paintReveal(.35).maskSize)
  const svg = decodeURIComponent(paintBrushMask)
  assert.equal((svg.match(/<path /g) || []).length, 1, 'a connected dragged brush, no detached drops')
  assert.doesNotMatch(svg, /circle|filter|feTurbulence|NaN/)
  assert.ok(svg.includes('C'))
  assert.equal(paintReveal(.75).maskComposite, 'subtract', 'brush clears pigment from the center, not the photo')
  assert.ok(paintReveal(.75).drag > 0)
  let previous = paintReveal(0)
  for (let i = 1; i <= 4000; i++) {
    const state = paintReveal(i / 4000)
    for (let c = 0; c < 4; c++) for (const offset of [1, 3, 5]) {
      const channel = hex => parseInt(hex.slice(offset, offset + 2), 16)
      assert.ok(Math.abs(channel(state.colors[c]) - channel(previous.colors[c])) <= 2, 'no palette step')
    }
    assert.ok(Math.abs(state.drag - previous.drag) < .003)
    previous = state
  }
  const samples = [0, .1, .25, .44999, .45, .5, .55, .55001, .75, .9, 1]
  assert.deepEqual(samples.map(paintReveal), [...samples].reverse().map(paintReveal).reverse())
})

test('static brush geometry covers every viewport corner before the opaque phase boundary', () => {
  const path = decodeURIComponent(paintBrushMask).match(/d="([^"]+)"/)[1]
  const tokens = path.match(/[MCZ]|-?[0-9.]+/g)
  const polygon = []; let x, y, i = 0
  while (i < tokens.length) {
    const command = tokens[i++]
    if (command === 'M') { x = +tokens[i++]; y = +tokens[i++]; polygon.push([x, y]) }
    else if (command === 'C') {
      const points = tokens.slice(i, i + 6).map(Number); i += 6
      for (let j = 1; j <= 40; j++) {
        const t = j / 40, u = 1 - t
        polygon.push([u ** 3 * x + 3 * u ** 2 * t * points[0] + 3 * u * t ** 2 * points[2] + t ** 3 * points[4], u ** 3 * y + 3 * u ** 2 * t * points[1] + 3 * u * t ** 2 * points[3] + t ** 3 * points[5]])
      }
      x = points[4]; y = points[5]
    }
  }
  const inside = (x, y) => {
    let covered = false
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j]
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) covered = !covered
    }
    return covered
  }
  for (const mix of [.45 - 1e-5, 1 - 1e-5]) {
    const scale = paintReveal(mix).phase * 5
    for (let x = 0; x <= 1000; x += 100) for (let y = 0; y <= 1000; y += 100) {
      assert.ok(inside(500 + (x - 500) / scale, 500 + (y - 500) / scale), 'scaled brush fully covers viewport')
    }
  }
})

test('paint ribbons remain cached through forward and reverse updates and release on unmount', async () => {
  const previousAct = globalThis.IS_REACT_ACT_ENVIRONMENT
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const PaintedBloom = (await import('../src/components/cinematic/PaintedBloom.jsx')).default
  let renderer, drawings
  try {
    for (const mix of [.1, .3, .45, .5, .7, .9, .7, .5, .3, .1]) {
      await act(async () => {
        const element = React.createElement(PaintedBloom, { media: paintReveal(mix) })
        if (renderer) renderer.update(element); else renderer = create(element)
      })
      const current = renderer.root.findAllByType('path').map(n => n.props)
      if (drawings) current.forEach((props, i) => assert.equal(props, drawings[i]))
      drawings = current
    }
  } finally {
    if (renderer) await act(async () => renderer.unmount())
    assert.equal(renderer.toJSON(), null)
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousAct
  }
})

test('full copy frame fits resized blocks and releases its observer', async () => {
  const originalObserver = globalThis.ResizeObserver
  const previousAct = globalThis.IS_REACT_ACT_ENVIRONMENT
  let resize, disconnected = 0, renderer
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  globalThis.ResizeObserver = class {
    constructor(callback) { resize = callback }
    observe() {}
    disconnect() { disconnected++ }
  }
  try {
    await act(async () => { renderer = create(React.createElement(ChapterFrame), { createNodeMock: () => ({ getBoundingClientRect() {} }) }) })
    for (const [width, height] of [[440, 330], [330, 390]]) {
      await act(async () => resize([{ contentRect: { width, height } }]))
      assert.equal(renderer.root.findByType('svg').props.viewBox, '0 0 ' + width + ' ' + height)
      assert.ok(renderer.root.findAllByType('path').every(n => !n.props.d.includes('NaN')))
    }
    await act(async () => renderer.unmount())
    renderer = null
    assert.equal(disconnected, 1)
  } finally {
    if (renderer) await act(async () => renderer.unmount())
    globalThis.ResizeObserver = originalObserver
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousAct
  }
})


test('curtains meet from the top first and cover the entire swap without a central arc', () => {
  for (const height of [0, .25, .5, .75, 1]) {
    assert.ok(Math.abs(curtainOffsetAt(1, false, height)) < 1e-8, 'closed cloth reaches the center at every height')
    assert.ok(curtainOffsetAt(0, false, height) < -500, 'initial cloth is outside the viewport')
    assert.ok(curtainOffsetAt(1, true, height) < -500, 'opened cloth completely clears the scene')
    const closing = [0, .2, .4, .6, .8, 1].map(p => curtainOffsetAt(p, false, height))
    assert.deepEqual(closing, [...closing].sort((a, b) => a - b))
  }
  assert.ok(Math.abs(curtainOffsetAt(.8, false, 0)) < 1e-8, 'top is closed while the hem is still following')
  assert.ok(curtainOffsetAt(.8, false, 1) < -50)
  assert.ok(curtainOffsetAt(.3, true, 0) < curtainOffsetAt(.3, true, 1), 'opening releases the top first')
  for (const phase of [.2, .5, .8]) {
    const top = curtainOffsetAt(phase, false, 0)
    const middle = curtainOffsetAt(phase, false, .5)
    const hem = curtainOffsetAt(phase, false, 1)
    assert.ok(top > middle && middle > hem, 'edge slopes outward toward the hem rather than bowing in the middle')
    assert.ok(!curtainShape(phase, false).edge.includes('NaN'))
  }
  const forward = [.1, .3, .5, .7, .9].map(p => curtainShape(p, false))
  assert.deepEqual([.9, .7, .5, .3, .1].map(p => curtainShape(p, false)), [...forward].reverse())
})


test('opening progresses top-down with a restrained gap in both directions', () => {
  for (const phase of [.01, .1, .2, .218]) {
    assert.equal(Math.abs(curtainOffsetAt(phase, true, 1)), 0, 'hem stays closed until its delayed release')
    assert.ok(curtainOffsetAt(phase, true, 0) < 0, 'top leads the opening')
  }
  for (let step = 0; step <= 100; step++) {
    const phase = step / 100
    const offsets = [0, .25, .5, .75, 1].map(y => curtainOffsetAt(phase, true, y))
    assert.deepEqual(offsets, [...offsets].sort((a, b) => a - b), 'lower cloth must not open ahead of the rows above')
    const openingFlare = Math.abs(offsets[0] - offsets.at(-1))
    const closingFlare = Math.abs(curtainOffsetAt(phase, false, 0) - curtainOffsetAt(phase, false, 1))
    assert.ok(openingFlare <= closingFlare + 1e-8, 'opening triangle must not be wider than the matching closing profile')
    assert.ok(openingFlare <= 250 && closingFlare <= 250, 'both profiles must stay narrower than the previous flare')
  }
  for (const y of [0, .25, .5, .75, 1]) {
    const offsets = Array.from({length: 101}, (_, step) => curtainOffsetAt(step / 100, true, y))
    assert.deepEqual(offsets, [...offsets].sort((a, b) => b - a), 'opening must not spring back between wheel positions')
  }
})


test('floral iris covers the photo swap, clears every viewport and reverses deterministically', () => {
  assert.ok(bloomRadiusAt(0) * .82 > Math.hypot(500, 500), 'fully open aperture clears even the corners')
  assert.equal(bloomRadiusAt(1), bloomRadiusAt(0))
  for (const p of [.44, .49, .5, .51, .56]) {
    const state = bloomReveal(p)
    assert.equal(state.radius, 0)
    assert.equal(state.closed, true, 'photograph changes under full opaque cover')
    assert.equal(state.scene, p < .5 ? 0 : 1)
  }
  const closing = Array.from({ length: 45 }, (_, i) => bloomRadiusAt(i / 100))
  assert.deepEqual(closing, [...closing].sort((a, b) => b - a))
  const opening = Array.from({ length: 45 }, (_, i) => bloomRadiusAt(.56 + i / 100))
  assert.deepEqual(opening, [...opening].sort((a, b) => a - b))
  assert.deepEqual(bloomReveal(-1), bloomReveal(0))
  assert.deepEqual(bloomReveal(2), bloomReveal(1))
  const samples = [0, .1, .25, .5, .75, .9, 1]
  assert.deepEqual([...samples].reverse().map(bloomReveal), samples.map(bloomReveal).reverse())
  for (const p of samples) {
    const state = bloomReveal(p)
    assert.ok(state.petals.every(petal => ![petal.path, petal.crease, petal.rim, ...petal.veins].some(path => /NaN|Infinity/.test(path))))
    assert.equal(state.whorls.length, 30)
    assert.ok(state.whorls.every(petal => ![petal.path, petal.curl, petal.rib].some(path => /NaN|Infinity/.test(path))))
    assert.ok(state.whorls.every(petal => petal.light.every(Number.isFinite)))
  }
})


test('flower palette changes only under closed cover and cached petal drawings stay fixed', async () => {
  for (const p of [0, .2, .4, .44]) assert.equal(bloomReveal(p).tone, 0)
  for (const p of [.56, .7, .9, 1]) assert.equal(bloomReveal(p).tone, 1)
  const held = bloomReveal(.44)
  for (const p of [.46, .49, .5, .51, .54, .56]) {
    const state = bloomReveal(p)
    assert.ok(state.closed)
    assert.deepEqual(state.whorls, held.whorls, 'palette morph must not also reraster moving geometry')
    assert.deepEqual(state.petals, held.petals)
  }
  assert.notDeepEqual(bloomPaletteAt(0), bloomPaletteAt(1))
  assert.equal(bloomPaletteAt(0)[0][1], '#edbd69')
  assert.equal(bloomPaletteAt(1)[0][1], '#e8b5ad')
  let previousTone = 0
  for (let step = 1; step <= 100; step++) {
    const tone = bloomReveal(.44 + step * .0012).tone
    assert.ok(tone >= previousTone && tone - previousTone <= .019, 'cached colors fade without an opacity jump')
    previousTone = tone
  }
  const oldAct = globalThis.IS_REACT_ACT_ENVIRONMENT
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  let renderer
  try {
    let drawings
    for (const mix of [.18, .25, .3, .4]) {
      await act(async () => {
        const element = React.createElement(ChapterImages, { transition: { from: 0, to: 1, mix } })
        if (renderer) renderer.update(element)
        else renderer = create(element)
      })
      const petals = renderer.root.findAll(n => n.props.className === 'chapter-bloom-petal')
      assert.equal(petals.length, 30)
      const current = petals.map(n => n.findAllByType('svg').map(svg => svg.props))
      if (drawings) current.forEach((pair, index) => pair.forEach((props, tone) => assert.equal(props, drawings[index][tone], 'both cached endpoint drawings are retained while scrolling')))
      drawings = current
      assert.equal(renderer.root.findAll(n => n.props.className === 'chapter-bloom-tone-shift').length, 0)
      bloomReveal(mix).whorls.forEach(petal => assert.equal(petal.path, bloomPetalShapes[petal.layer].path))
    }
    let instances
    for (const mix of [.4399, .44, .47, .49, .51, .54, .5599, .56, .560001, .57, .7, .57, .56, .5599, .51, .44, .4399]) {
      await act(async () => renderer.update(React.createElement(ChapterImages, { transition: { from: 0, to: 1, mix } })))
      const petals = renderer.root.findAll(n => n.props.className === 'chapter-bloom-petal')
      const current = petals.flatMap(n => n.findAllByType('svg'))
      assert.equal(current.length, 60)
      if (instances) current.forEach((node, index) => assert.equal(node, instances[index], 'same petal elements survive color changes and reverse scroll'))
      instances = current
      assert.equal(renderer.root.findAllByType('svg').length, 62, 'two fixed pigment endpoints per base and per petal, retained across the hold')
      assert.equal(renderer.root.findAll(n => n.props.className === 'chapter-bloom-tone-shift').length, 0)
      const media = bloomReveal(mix)
      petals.forEach((petal, index) => {
        const pair = petal.findAllByType('svg')
        pair.forEach((svg, endpoint) => {
          assert.equal(svg.findAllByType('stop')[2].props.stopColor, bloomPaletteAt(endpoint)[media.whorls[index].tone][1], 'cached pigment never changes while blending')
          assert.equal(svg.props, drawings[index][endpoint], 'color scrolling never rerenders the cached leaf artwork')
        })
        const incoming = petal.findByProps({ className: 'chapter-bloom-pigment chapter-bloom-pigment--incoming' })
        assert.equal(incoming.props.style.opacity, media.tone)
        assert.equal(petal.props.style.opacity, undefined, 'opaque lower pigment prevents a brightness dip or photo leak')
      })
    }
  } finally {
    if (renderer) await act(async () => renderer.unmount())
    globalThis.IS_REACT_ACT_ENVIRONMENT = oldAct
  }
})


test('flower travel and rotation ease into the closed hold without a velocity snap', () => {
  const h = 1e-5
  const angle = p => bloomReveal(p).whorls[0].angle
  for (const p of [0, .44, .56, 1]) {
    const left = p > 0 ? (angle(p) - angle(p - h)) / h : 0
    const right = p < 1 ? (angle(p + h) - angle(p)) / h : 0
    assert.ok(Math.abs(left) < 1e-6 && Math.abs(right) < 1e-6, 'angular speed settles before the hold and endpoints')
    const radiusLeft = p > 0 ? (bloomRadiusAt(p) - bloomRadiusAt(p - h)) / h : 0
    const radiusRight = p < 1 ? (bloomRadiusAt(p + h) - bloomRadiusAt(p)) / h : 0
    assert.ok(Math.abs(radiusLeft) < .001 && Math.abs(radiusRight) < .001, 'radial speed also settles instead of snapping')
  }
  for (const sample of [.1, .2, .3]) {
    assert.ok(angle(sample) < angle(sample + .01))
    assert.ok(angle(1 - sample) > angle(1 - sample + .01))
  }
})


test('flower palette has no discrete jumps around either color handoff boundary', () => {
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  let previous = bloomPaletteAt(0)
  for (let step = 1; step <= 200; step++) {
    const palette = bloomPaletteAt(bloomReveal(.44 + .12 * step / 200).tone)
    palette.forEach((stops, i) => stops.forEach((color, j) => rgb(color).forEach((v, c) => {
      assert.ok(Math.abs(v - rgb(previous[i][j])[c]) <= 3, 'pigment changes gradually in every channel')
    })))
    previous = palette
  }
  for (const boundary of [.44, .56]) {
    const colors = [boundary - 1e-6, boundary, boundary + 1e-6].map(p => bloomPaletteAt(bloomReveal(p).tone))
    assert.deepEqual(colors[0], colors[1])
    assert.deepEqual(colors[1], colors[2])
  }
})


test('incoming second photograph decodes while hidden without changing visible scene or error state', async () => {
  const previousAct = globalThis.IS_REACT_ACT_ENVIRONMENT
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  let renderer, calls = 0
  try {
    await act(async () => { renderer = create(React.createElement(ChapterImages, { transition: chapterTransitionAtProgress(0) })) })
    const scenes = renderer.root.findAll(n => n.props.className === 'chapter-image-scene')
    const incoming = scenes[1].findByType('img')
    assert.equal(scenes[1].props.hidden, true)
    await act(async () => incoming.props.onLoad({ currentTarget: { decode() { calls++; return Promise.resolve() } } }))
    assert.equal(calls, 1)
    await act(async () => incoming.props.onLoad({ currentTarget: { decode() { return Promise.reject(new Error('source changed during decode')) } } }))
    assert.equal(scenes[1].findAllByType('img').length, 1, 'an interrupted decode does not turn a valid image into an error')
    assert.equal(scenes[0].props.hidden, false)
    assert.equal(scenes[1].props.hidden, true)
    for (const scene of scenes) {
      await act(async () => scene.findByType('img').props.onLoad({ currentTarget: { decode() { calls++; return Promise.resolve() } } }))
    }
    assert.equal(calls, 5, 'all selected photographs decode before their first visibility')
  } finally {
    if (renderer) await act(async () => renderer.unmount())
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousAct
  }
})

test('static photographic layers keep their props during all three transient effects', async () => {
  const saved = globalThis.IS_REACT_ACT_ENVIRONMENT
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  let renderer, previous
  try {
    for (const [from, mix] of [[0,.1],[0,.3],[0,.6],[1,.2],[1,.5],[1,.8],[2,.2],[2,.6],[2,.9]]) {
      await act(async () => {
        const element = React.createElement(ChapterImages, { transition: {from,to:from+1,mix} })
        if (renderer) renderer.update(element); else renderer = create(element)
      })
      const layers = renderer.root.findAll(n => n.type === 'div' && (n.props.className === 'chapter-world' || n.props.className?.startsWith('chapter-hero chapter-hero--')))
      assert.equal(layers.length, 8)
      const current = layers.map(n => n.props)
      if (previous) current.forEach((props, index) => assert.equal(props, previous[index], 'unchanged photograph props must not be rebuilt'))
      previous = current
    }
  } finally {
    if (renderer) await act(async () => renderer.unmount())
    globalThis.IS_REACT_ACT_ENVIRONMENT = saved
  }
})
