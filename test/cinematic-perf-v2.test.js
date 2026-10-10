import assert from 'node:assert/strict'
import test from 'node:test'
import {register} from 'node:module'
register('./cart-component-loader.js',import.meta.url)
const {chapterViewChanged}=await import('../src/components/cinematic/useChapterScroll.js')
const {smokeViewChanged}=await import('../src/components/cinematic/useSmokeTransition.js')
const {createHFinalFrameStore}=await import('../src/components/cinematic/hFinalSmoke.js')
const flush=()=>new Promise(r=>setImmediate(r))
test('React section projection freezes irrelevant progress while canonical channels keep their precise targets',()=>{
 const chapter={chapterProgress:1,transitionProgress:.3,sequenceProgress:0,totalProgress:.6}
 assert.equal(chapterViewChanged(chapter,{...chapter,transitionProgress:.4,totalProgress:.61}),false)
 assert.equal(chapterViewChanged(chapter,{...chapter,transitionProgress:1,sequenceProgress:.1}),true)
 assert.equal(chapterViewChanged({...chapter,transitionProgress:1,sequenceProgress:.1},{...chapter,transitionProgress:1,sequenceProgress:.91}),false)
 assert.equal(chapterViewChanged(chapter,{...chapter,chapterProgress:.999}),true)
 const s={chapterProgress:1,phase:'SMOKE_REVEAL',scene:'sequence',locked:true,prewarm:true,failed:false,progress:.8}
 assert.equal(smokeViewChanged(s,{...s,progress:.9,virtualTime:2.5}),false)
 for(const [key,value] of [['phase','RIFE'],['scene','chapter'],['locked',false],['chapterProgress',.8],['failed',true]])assert.equal(smokeViewChanged(s,{...s,[key]:value}),true)
})
test('deep RIFE disposes decoded smoke only, wakes latest reverse target from retained bytes, and never refetches',async()=>{
 const images=[];let fetches=0,ready=0
 const store=createHFinalFrameStore({fetchFrame:async()=>({ok:true,blob:async()=>{fetches++;return{size:1}}}),decodeFrame:async()=>{const image={width:960,height:540,closed:false,close(){this.closed=true}};images.push(image);return image},onReady:()=>ready++})
 try{await store.load();for(let n=0;n<100&&!ready;n++)await flush();assert.equal(ready,1);assert.equal(store.getStats().decoded,88)
 store.hold(75);store.setDormant(true);assert.equal(store.getStats().decoded,0);assert.ok(images.every(i=>i.closed))
 const count=images.length;store.setDormant(true);await flush();assert.equal(images.length,count)
 assert.equal(store.canPresent(37),false);for(let n=0;n<100&&!store.get(37);n++)await flush();assert.ok(store.get(37));assert.equal(fetches,88);assert.equal(ready,1)
 }finally{store.dispose()};assert.ok(images.every(i=>i.closed))
})
