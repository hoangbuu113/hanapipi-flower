import assert from 'node:assert/strict'
import test from 'node:test'
import { register } from 'node:module'
import { smokePreviewRequested } from '../src/components/cinematic/smokePreviewConfig.js'

register('./cart-component-loader.js', import.meta.url)
const React = await import('react')
const { act, create } = await import('react-test-renderer')
const SmokePreviewPage = (await import('../src/pages/SmokePreviewPage.jsx')).default

test('preview requires the exact opt-in query and cannot be enabled outside development', () => {
  for (const search of ['', '?smokePreview=0', '?smokePreview=true', '?smoke=react', '?smokePreview=01']) {
    assert.equal(smokePreviewRequested(true, search), false)
  }
  assert.equal(smokePreviewRequested(true, '?debug=1&smokePreview=1'), true)
  assert.equal(smokePreviewRequested(false, '?smokePreview=1'), false)
})

test('native preview controls play/pause/restart, handle failures, and reset failed media on source switch', async () => {
  const previousAct = globalThis.IS_REACT_ACT_ENVIRONMENT
  const previousWindow = globalThis.window
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  globalThis.window = { matchMedia: () => ({ matches: true }) }
  let root
  const media = []
  try {
    await act(async () => {
      root = create(React.createElement(SmokePreviewPage), { createNodeMock(element) {
        if (element.type !== 'video') return null
        const node = { paused: true, currentTime: 0, duration: 2.4, rejectPlay: false, loads: 0,
          async play() { if (this.rejectPlay) throw new Error('Blocked'); this.paused = false; element.props.onPlay() },
          pause() { this.paused = true; element.props.onPause() }, load() { this.loads++ },
        }
        media.push(node)
        return node
      } })
    })
    const video = () => root.root.findByType('video')
    const action = name => root.root.findAllByType('button').find(node => node.props['data-action'] === name)
    const choose = name => root.root.findAllByType('button').find(node => node.props['data-source'] === name)
    assert.equal(video().props.autoPlay, false, 'respect reduced motion')
    assert.equal(video().props['data-source'], 'h-final')
    assert.equal(root.root.findAllByType('video').length, 1)
    await act(async () => { video().props.onLoadedMetadata({ currentTarget: media.at(-1) }); video().props.onCanPlay() })
    await act(async () => action('play').props.onClick())
    assert.equal(media.at(-1).paused, false)
    assert.deepEqual(action('play').children, ['Tạm dừng'])
    await act(async () => action('play').props.onClick())
    assert.equal(media.at(-1).paused, true)
    media.at(-1).currentTime = 1
    await act(async () => action('restart').props.onClick())
    assert.equal(media.at(-1).currentTime, 0)
    assert.equal(media.at(-1).paused, true)
    await act(async () => action('loop').props.onClick())
    assert.equal(video().props.loop, false)
    media.at(-1).rejectPlay = true
    await act(async () => action('play').props.onClick())
    assert.ok(root.root.findAll(node => node.props.role === 'alert').length > 0)
    await act(async () => video().props.onError())
    assert.equal(action('play').props.disabled, true)
    const retry = root.root.findAllByType('button').find(node => node.children.includes('Thử lại'))
    await act(async () => retry.props.onClick())
    assert.equal(media.at(-1).loads, 1)
    for (const name of ['reference', 'f4a', 'b3', 'h-final']) {
      await act(async () => choose(name).props.onClick())
      assert.equal(video().props['data-source'], name)
      assert.equal(root.root.findAllByType('video').length, 1)
      assert.equal(root.root.findAll(node => node.props.role === 'alert').length, 0)
      assert.equal(video().props.loop, true)
      assert.equal(action('play').props.disabled, true, 'new source waits for its own metadata')
      assert.equal(media.at(-1).currentTime, 0)
    }
  } finally {
    if (root) await act(async () => root.unmount())
    globalThis.window = previousWindow
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousAct
  }
})
