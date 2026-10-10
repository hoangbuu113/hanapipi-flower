import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { createSmokeScrub } from '../src/components/cinematic/smokeScrub.js'
import { hFinalFrameAt, H_FINAL_TIMELINE as timeline, createHFinalFrameStore, hFinalWindow } from '../src/components/cinematic/hFinalSmoke.js'
import { SMOKE_TRANSITION_TIMING as timing } from '../src/components/cinematic/smokeTransitionConfig.js'
const raw = (p, sequenceProgress=0, chapterProgress=1) => ({ chapterProgress, smokeProgress:p, sequenceProgress })
function rig(ready=true) {
 let refresh=0
 const c=createSmokeScrub({requestUpdate:()=>refresh++})
 c.setReady('renderer',true);c.setReady('video',ready)
 return {c,at(p,s=0){c.observe(raw(p,s));return c.getSnapshot()},get refresh(){return refresh}}
}
test('native time follows displayed progress forward and reverse; no autonomous clock or input API',async()=>{
 const r=rig()
 for(const p of [.1,.2,.3,.41,timing.swap,.5,timing.reveal,.7,.9,1,.9,.7,.5,.41,.3,.1,0]) {
  let s=r.at(p);if(s.gated==='swap-plate')s=r.at(p)
  assert.equal(s.progress,p);assert.equal(s.nativeFrame,hFinalFrameAt(p*timing.duration)+1)
  assert.equal(s.virtualTime,p*timing.duration);assert.equal(s.scene,p>=timing.swap?'sequence':'chapter')
  assert.equal(s.covered,p>=timing.swap);assert.equal(s.revealing,p>=timing.reveal)
 }
 const held=r.at(.28);await new Promise(resolve=>setTimeout(resolve,20));assert.equal(r.c.getSnapshot(),held)
 assert.equal(r.c.input,undefined)
 for(const file of ['smokeScrub.js','useSmokeTransition.js','HFinalSmokeHandoff.jsx']) assert.doesNotMatch(fs.readFileSync(new URL('../src/components/cinematic/'+file,import.meta.url),'utf8'),/requestAnimationFrame|setTimeout|setInterval|preventDefault|scrollTo/)
 r.c.dispose()
})
test('exact N38 readiness holds ownership, raw target continues; readiness resumes latest target',()=>{
 const r=rig(false);r.at(.1)
 let s=r.at(.72);assert.equal(s.progress,timing.swap);assert.equal(s.nativeFrame,38);assert.equal(s.scene,'chapter');assert.equal(s.gated,'frame0');assert.equal(s.sequenceProgress,0)
 r.at(.9);const count=r.refresh;r.c.setReady('video',true);assert.ok(r.refresh>count)
 s=r.at(.9);assert.equal(s.scene,'sequence');assert.equal(s.progress,timing.swap)
 s=r.at(.9);assert.equal(s.progress,.9);assert.equal(s.gated,'')
 assert.equal(timing.swap,1.308333/timing.duration);assert.equal(timing.reveal,1.741667/timing.duration)
 s=r.at(1,.34);assert.equal(s.sequenceProgress,.34);assert.equal(s.phase,'RIFE');assert.equal(s.visible,false)
 // Frame0 may no longer be presented during RIFE. Only an ownership crossing
 // needs frame0; ordinary active RIFE never reclamps to smoke.
 r.c.setReady('video',false);s=r.at(1,.8);assert.equal(s.sequenceProgress,.8)
 s=r.at(.2);assert.equal(s.progress,timing.swap);assert.equal(s.scene,'sequence');assert.equal(s.sequenceProgress,0)
 r.c.setReady('video',true);s=r.at(.2);assert.equal(s.scene,'chapter');s=r.at(.2);assert.equal(s.progress,.2)
 r.c.observe(raw(0,0,.8));s=r.c.getSnapshot();assert.equal(s.chapterProgress,.8);r.c.dispose()
})
test('latest target wins decode hold and one gesture crosses smoke directly into RIFE without replay',()=>{
 let available=new Set([0,.1,timing.swap]);const r=rig();r.c.setReady('renderer',{ready:true,canPresent:p=>[...available].some(x=>Math.abs(x*timing.duration/timing.nativeDuration-p)<1e-9)})
 r.at(.1);let s=r.at(.72);assert.equal(s.progress,timing.swap)
 s=r.at(.72);assert.equal(s.gated,'decode-target');assert.equal(s.progress,timing.swap)
 s=r.at(.82);assert.equal(s.requestedProgress,.82);available.add(.82);r.c.setReady('renderer',{ready:true,canPresent:p=>[...available].some(x=>Math.abs(x*timing.duration/timing.nativeDuration-p)<1e-9)})
 s=r.at(.82);assert.equal(s.progress,.82)
 available.add(1);s=r.at(1,.55);assert.equal(s.sequenceProgress,.55)
 r.c.dispose();const held=r.c.getSnapshot();r.at(.2);assert.equal(r.c.getSnapshot(),held)
})
test('mobile arbitrary jump prioritizes latest target and nearest direction neighbors, bounded abandoned decodes',async()=>{
 const pending=[],requested=[],images=[];let capability
 const store=createHFinalFrameStore({mobile:true,
  fetchFrame:async url=>({ok:true,blob:async()=>({id:Number(url.match(/(\d+)\.png$/)[1])-1,size:1})}),
  decodeFrame:blob=>{requested.push(blob.id);return new Promise(resolve=>pending.push({id:blob.id,resolve}))},onReady:value=>capability=value})
 const flush=async()=>{await new Promise(resolve=>setImmediate(resolve))}
 function finish(){for(const p of pending.splice(0)){const image={width:960,height:540,closed:false,close(){this.closed=true}};images.push(image);p.resolve(image)}}
 try {
  await store.load();for(let n=0;n<10&&!capability;n++){finish();await flush()};assert.ok(capability)
  assert.equal(capability.canPresent(timeline.frames[10].pts/timeline.duration),true)
  // Up to four previous in-flight images are unavoidable; no queued sweep10..49.
  const start=requested.length;capability.canPresent(timeline.frames[50].pts/timeline.duration)
  finish();await flush()
  const jump=requested.slice(start);assert.equal(jump[0],50);assert.equal(jump[1],51);assert.ok(jump.every(i=>Math.abs(i-50)<=2))
  capability.canPresent(timeline.frames[80].pts/timeline.duration)
  finish();await flush();assert.ok(requested.slice(start+4).every(i=>hFinalWindow(80).includes(i)))
  for(let n=0;n<10&&!store.get(80);n++){finish();await flush()}
  assert.ok(store.get(80));assert.ok(store.getStats().decoded<=25);assert.equal(store.getStats().failures.length,0)
 }finally{store.dispose();finish();await flush()};assert.ok(images.every(i=>i.closed))
})


test('effective production boundary ends on first fully clear frame without changing native archive',()=>{
 assert.equal(timeline.frames.length,88);assert.equal(timeline.duration,3.041667)
 assert.equal(timing.frames,80);assert.equal(timing.duration,timeline.frames[79].pts)
 const r=rig();r.at(1);let s=r.at(1,.02);assert.equal(s.nativeFrame,80);assert.equal(s.phase,'RIFE');assert.equal(s.visible,false);assert.equal(s.sequenceProgress,.02)
 s=r.at(.999);assert.equal(s.nativeFrame,79);assert.equal(s.visible,true)
 r.at(timing.swap);s=r.at(timing.swap);assert.equal(s.nativeFrame,38)
 s=r.at(timing.reveal);assert.equal(s.nativeFrame,51);r.c.dispose()
})
