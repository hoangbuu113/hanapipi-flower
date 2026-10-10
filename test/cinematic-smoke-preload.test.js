import assert from 'node:assert/strict'
import test from 'node:test'
import { scheduleSmokePreload } from '../src/components/cinematic/smokePreload.js'
import { createHFinalFrameStore } from '../src/components/cinematic/hFinalSmoke.js'
const flush = () => new Promise(r => setImmediate(r))
test('staged gate waits load, visible photo decode, fonts and idle; cancelled startup never launches', async () => {
  let photo, fonts, idle, start=0; const events=new Map()
  const document={readyState:'loading',querySelector:()=>({decode:()=>new Promise(r=>photo=r)}),fonts:{ready:new Promise(r=>fonts=r)}}
  const window={addEventListener:(t,f)=>events.set(t,f),removeEventListener:t=>events.delete(t),requestIdleCallback:f=>{idle=f;return 1},cancelIdleCallback:()=>{idle=null}}
  const stop=scheduleSmokePreload({document,window,onStart:()=>start++});await flush();assert.equal(start,0);assert.equal(photo,undefined)
  events.get('load')();await flush();assert.equal(idle,undefined);photo();await flush();assert.equal(idle,undefined);fonts();await flush();assert.ok(idle);assert.equal(start,0);idle();assert.equal(start,1);stop()
  document.readyState='complete';document.querySelector=()=>({decode:async()=>{}});document.fonts.ready=Promise.resolve();const cancelled=scheduleSmokePreload({document,window,onStart:()=>start++});cancelled();await flush();assert.equal(start,1)
})
test('unsupported idle uses only one next-task fallback and cleanup cancels it', async () => {
 let callback,cancelled=false;const stop=scheduleSmokePreload({document:{readyState:'complete',querySelector:()=>null},window:{setTimeout:(f,ms)=>{assert.equal(ms,0);callback=f;return 2},clearTimeout:id=>{assert.equal(id,2);cancelled=true}},onStart:()=>assert.fail('cancelled fallback')});await flush();stop();assert.ok(cancelled);callback()
})
test('latest useful window jumps queued archive requests without duplicate/restarted fetches or more than four workers', async () => {
 const requests=[],releases=new Map(),active=new Set();let peak=0,automatic=false
 const store=createHFinalFrameStore({mobile:true,fetchFrame:async url=>{const id=Number(url.match(/(\d+)\.png$/)[1]);assert.ok(!requests.includes(id));requests.push(id);active.add(id);peak=Math.max(peak,active.size);if(!automatic)await new Promise(r=>releases.set(id,r));active.delete(id);return{ok:true,blob:async()=>({id,size:200})}},decodeFrame:async()=>({width:960,height:540,close(){}})})
 try { const loading=store.load();await flush();assert.deepEqual(requests,[1,2,3,4]);store.canPresent(60);releases.get(1)();await flush();assert.equal(requests[4],61);store.canPresent(20);releases.get(2)();await flush();assert.equal(requests[5],21);assert.ok(active.has(61));automatic=true;for(const r of releases.values())r();await loading;await flush();assert.equal(requests.length,88);assert.equal(new Set(requests).size,88);assert.equal(peak,4);assert.equal(store.getStats().fetched,88);assert.ok(store.getStats().decoded<=24);assert.equal(store.getStats().failures.length,0) } finally { for(const r of releases.values())r();store.dispose() }
})
