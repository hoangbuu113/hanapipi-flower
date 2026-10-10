import assert from 'node:assert/strict'
import test from 'node:test'
import { register } from 'node:module'
register('./cart-component-loader.js',import.meta.url)
const React=await import('react'), {act,create}=await import('react-test-renderer')
const useChapterScroll=(await import('../src/components/cinematic/useChapterScroll.js')).default
const {useSmokeTransition}=await import('../src/components/cinematic/useSmokeTransition.js')
const {SEQUENCE_SCROLL}=await import('../src/components/cinematic/sequenceConfig.js')
for(const mobile of [false,true]) test(`${mobile?'mobile':'desktop'} real master channel resumes decode/frame0 without new gesture, resize and StrictMode cleanup`,async()=>{
 const saved={window:globalThis.window,ResizeObserver:globalThis.ResizeObserver,act:globalThis.IS_REACT_ACT_ENVIRONMENT}
 const events=new Map(),frames=new Map(),observers=[];let id=0,height=1000,distance=0,view,root,time=performance.now()
 const suffix=mobile?'Mobile':'Desktop',ch=SEQUENCE_SCROLL['chapter'+suffix],sm=SEQUENCE_SCROLL['smoke'+suffix],sq=SEQUENCE_SCROLL['sequence'+suffix]
 const region={current:{getBoundingClientRect:()=>({top:-distance*height/100,height:(100+ch+sm+sq)*height/100})}}
 const displayRef={current:null}
 globalThis.IS_REACT_ACT_ENVIRONMENT=true
 globalThis.window={innerHeight:height,matchMedia:q=>({matches:mobile||q==='(pointer: coarse)'}),addEventListener:(t,f)=>events.set(t,f),removeEventListener:t=>events.delete(t),requestAnimationFrame:f=>{frames.set(++id,f);return id},cancelAnimationFrame:i=>frames.delete(i)}
 globalThis.ResizeObserver=class{constructor(fn){this.fn=fn;observers.push(this)}observe(){}disconnect(){this.closed=true}}
 function Probe({enabled=true}){useChapterScroll(region,!enabled,displayRef,true);const s=useSmokeTransition({enabled,displayScrollRef:displayRef,renderSectionsOnly:true});React.useLayoutEffect(()=>{view=s});return null}
 async function flush(){await act(async()=>{const pending=[...frames];frames.clear();time+=16;pending.forEach(([,f])=>f(time))})}
 async function settle(){for(let n=0;n<30&&frames.size;n++)await flush();assert.equal(frames.size,0)}
 async function move(p,seq=0){distance=ch+sm*p+sq*seq;events.get('scroll')();await settle()}
 try{
  await act(async()=>{root=create(React.createElement(React.StrictMode,null,React.createElement(Probe)))})
  assert.deepEqual([...events.keys()].sort(),['resize','scroll']);assert.ok(displayRef.current.refresh)
  await act(async()=>view.rendererReady({ready:true,canPresent:()=>true}));await settle()
  const channel=view.channelRef.current
  await move(.2);assert.ok(Math.abs(channel.getSnapshot().progress-.2)<1e-12)
  const held=channel.getSnapshot();assert.equal(frames.size,0);assert.equal(channel.getSnapshot(),held)
  await move(.72);assert.equal(channel.getSnapshot().gated,'frame0');assert.equal(frames.size,0)
  await act(async()=>view.frame0Ready(true));await settle();assert.ok(Math.abs(channel.getSnapshot().progress-.72)<1e-12)
  await move(1,.45);assert.equal(channel.getSnapshot().scene,'sequence');assert.ok(Math.abs(channel.getSnapshot().sequenceProgress-.45)<1e-12)
  await act(async()=>view.frame0Ready(false));await settle();await move(.2);assert.equal(channel.getSnapshot().gated,'frame0');assert.equal(channel.getSnapshot().sequenceProgress,0)
  await act(async()=>view.frame0Ready(true));await settle();assert.equal(channel.getSnapshot().scene,'chapter')
  height=844;window.innerHeight=height;events.get('resize')();await settle();assert.equal(view.channelRef.current,channel);assert.ok(Math.abs(channel.getSnapshot().progress-.2)<1e-12)
  await act(async()=>root.update(React.createElement(React.StrictMode,null,React.createElement(Probe,{enabled:false}))));assert.equal(events.size,0);assert.equal(frames.size,0);assert.equal(view.channelRef.current,null)
  await act(async()=>root.unmount());root=null;assert.ok(observers.every(o=>o.closed))
 }finally{if(root)await act(async()=>root.unmount());globalThis.window=saved.window;globalThis.ResizeObserver=saved.ResizeObserver;globalThis.IS_REACT_ACT_ENVIRONMENT=saved.act}
})
