import assert from 'node:assert/strict'
import test from 'node:test'
import { register } from 'node:module'
import { CHAPTERS } from '../src/components/cinematic/cinematicConfig.js'
register('./cart-component-loader.js', import.meta.url)
const React = await import('react')
const { act, create } = await import('react-test-renderer')
const Hero = (await import('../src/components/cinematic/ChapterHero.jsx')).default
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a;reject=b }); return {promise,resolve,reject} }
test('photo first paint waits for controlled decode without changing source or crop', async () => {
 globalThis.IS_REACT_ACT_ENVIRONMENT = true
 let renderer
 try {
  await act(async () => { renderer=create(React.createElement(Hero,{chapter:CHAPTERS[2]})) })
  const img=()=>renderer.root.findByType('img')
  const task=deferred(), image={currentSrc:CHAPTERS[2].src,decode:()=>task.promise}
  assert.equal(img().props.style.visibility,'hidden')
  let ready
  await act(async () => { ready=img().props.onLoad({currentTarget:image}) })
  assert.equal(img().props.style.visibility,'hidden','visible lazy decode must not race the compositor')
  await act(async () => { task.resolve();await ready })
  assert.equal(img().props.style.visibility,'visible')
  assert.equal(img().props.src,CHAPTERS[2].src)
  assert.equal(img().props.style.objectPosition,CHAPTERS[2].frame.objectPosition)
 } finally { if(renderer)await act(async()=>renderer.unmount());delete globalThis.IS_REACT_ACT_ENVIRONMENT }
})
test('stale responsive decode cannot reveal a replacement source; rejection and disposal are bounded', async () => {
 globalThis.IS_REACT_ACT_ENVIRONMENT = true
 let renderer
 try {
  await act(async()=>{renderer=create(React.createElement(Hero,{chapter:CHAPTERS[0]}))})
  const img=()=>renderer.root.findByType('img'),task=deferred(),image={currentSrc:'old',decode:()=>task.promise}
  let ready
  await act(async()=>{ready=img().props.onLoad({currentTarget:image})})
  image.currentSrc='new'
  await act(async()=>{task.resolve();await ready})
  assert.equal(img().props.style.visibility,'hidden')
  image.decode=()=>Promise.reject(new Error('loaded image decode rejected'))
  await act(async()=>{await img().props.onLoad({currentTarget:image})})
  assert.equal(img().props.style.visibility,'visible')
  const pending=deferred();image.decode=()=>pending.promise
  await act(async()=>{ready=img().props.onLoad({currentTarget:image})})
  await act(async()=>renderer.unmount())
  pending.resolve();await ready
  assert.equal(renderer.toJSON(),null)
 }finally{if(renderer)await act(async()=>renderer.unmount());delete globalThis.IS_REACT_ACT_ENVIRONMENT}
})
