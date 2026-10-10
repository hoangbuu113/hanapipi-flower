import assert from 'node:assert/strict'
import test from 'node:test'
import { createCinematicPerf } from '../src/components/cinematic/cinematicPerf.js'

function harness() {
  let time=0,id=0,cancels=0,closed=0
  const listeners=new Map(),mediaListeners=new Map(),timers=new Map()
  class E { constructor(type,cancelable){this.type=type;this.cancelable=cancelable;this.deltaY=100;this.deltaMode=0} preventDefault(){cancels++} }
  class Bitmap {constructor(w,h){this.width=w;this.height=h}close(){closed++}}
  class Video {constructor(inside=true){this.inside=inside;this.time=0;this.dataset={direction:'forward'};this.seeking=false;this.readyState=4;this.tagName='VIDEO'}get currentTime(){return this.time}set currentTime(t){this.time=t}closest(){return this.inside}}
  const v=new Video(),outside=new Video(false),stage={getBoundingClientRect:()=>({top:0,bottom:1000}),querySelector:selector=>selector==='video'?v:null,querySelectorAll:()=>[v]}
  const win={Event:E,ImageBitmap:Bitmap,HTMLMediaElement:Video,navigator:{userAgent:'mock'},innerHeight:1000,innerWidth:1920,devicePixelRatio:1,scrollY:0,document:{addEventListener:(t,f)=>mediaListeners.set(t,f),removeEventListener:t=>mediaListeners.delete(t)},addEventListener:(t,f)=>listeners.set(t,f),removeEventListener:t=>listeners.delete(t),setInterval:f=>{timers.set(++id,f);return id},clearInterval:k=>timers.delete(k),createImageBitmap:async input=>new Bitmap(input.width,input.height)}
  return {win,v,outside,listeners,mediaListeners,timers,create:()=>createCinematicPerf(win,()=>stage,()=>time),advance:n=>time+=n,get cancels(){return cancels},get closed(){return closed}}
}

test('DEV observer records owned cancellation without changing baseline semantics and restores all hooks on effect replay', async()=>{
  const h=harness(),w=h.win,prevent=w.Event.prototype.preventDefault,write=Object.getOwnPropertyDescriptor(w.HTMLMediaElement.prototype,'currentTime').set,decode=w.createImageBitmap,close=w.ImageBitmap.prototype.close
  for(let n=0;n<2;n++){
    const p=h.create();p.registerController({getSnapshot:()=>({phase:'SMOKE_PRE_COVER',visible:true,gated:''})})
    const e=new w.Event('touchmove',false);e.touches=[{clientY:100}];h.listeners.get('touchmove')(e);p.cancelIntent(e,'test owned gesture');e.preventDefault()
    assert.equal(p.snapshot().rows.cancel.filter(x=>x.kind==='call'&&!x.cancelable).length,1)
    h.v.currentTime=1;h.outside.currentTime=2;assert.equal(p.rows.writes.length,1,'outside media is not instrumented')
    const bitmap=await w.createImageBitmap({width:960,height:540});const other=await w.createImageBitmap({width:100,height:100});assert.equal(p.snapshot().memory.retained,1)
    assert.equal(p.snapshot().memory.estimatedBytes,960*540*4);bitmap.close();other.close();assert.equal(p.snapshot().memory.retained,0)
    p.dispose();assert.equal(w.Event.prototype.preventDefault,prevent);assert.equal(Object.getOwnPropertyDescriptor(w.HTMLMediaElement.prototype,'currentTime').set,write);assert.equal(w.createImageBitmap,decode);assert.equal(w.ImageBitmap.prototype.close,close);assert.equal(h.listeners.size+h.mediaListeners.size+h.timers.size,0);assert.equal(w.__CINEMATIC_PERF__,undefined)
  }
  assert.equal(h.cancels,2);assert.equal(h.closed,4)
})

test('input normalization is observational, samples are bounded, and idle RAF wakeups are excluded from active cadence',()=>{
  const h=harness(),p=h.create(),e=new h.win.Event('wheel',true);e.deltaMode=2;h.listeners.get('wheel')(e);assert.equal(p.rows.input[0].normalizedDelta,100000);assert.equal(h.cancels,0)
  p.raf('master',10,0,1);p.raf('master',26,11,1);p.raf('master',500,490,1);assert.equal(p.rows.raf[1].continuous,true);assert.equal(p.rows.raf[2].continuous,false)
  for(let n=0;n<12010;n++)p.target(.2,96,48);assert.equal(p.rows.target.length,12000)
  const snapshot=p.snapshot();p.target(.3,144,48);assert.equal(snapshot.rows.target.at(-1).frame,96,'exports are stable array copies')
  p.dispose()
})
