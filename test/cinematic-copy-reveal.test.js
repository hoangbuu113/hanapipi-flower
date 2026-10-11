import test from 'node:test'
import assert from 'node:assert/strict'
import { advanceCopyGate, copyChoreography } from '../src/components/cinematic/chapterCopyGate.js'
const fresh = () => ({ armed: [true,true,true,true], epochs: [0,0,0,0] })
const sample = (s,from,to,mix=1) => {const events=advanceCopyGate(s,{from,to,mix});return {events,view:copyChoreography({from,to,mix,direction:s.direction,armed:s.armed})}}
test('outgoing remains visible through half-cover; incoming starts before completion for every forward and reverse handoff',()=>{
 for(const reverse of [false,true])for(let edge=0;edge<3;edge++){
  const s=fresh(),out=reverse?edge+1:edge,inc=reverse?edge:edge+1;sample(s,out,out)
  for(const p of [0,.4,.55,.7,.8,1]){
   const mix=reverse?1-p:p;const {view,events}=sample(s,edge,edge+1,mix)
   if(p<=.4){assert.equal(view.opacity[out],1);assert.equal(s.armed[out],false)}
   if(p===.55){assert.ok(view.opacity[out]>0);assert.equal(s.armed[out],false)}
   if(p===.7){assert.equal(view.opacity[out],0);assert.equal(view.opacity[inc],0)}
   if(p===.8){assert.ok(events.some(e=>e.chapter===inc&&e.entered));assert.ok(view.opacity[inc]>.8)}
  }
  assert.equal(s.epochs[inc],1)
 }
})
test('threshold jitter does not replay headline or blank an entered incoming block',()=>{
 const s=fresh();sample(s,0,0);sample(s,0,1,.77)
 for(const p of [.755,.765,.751,.78,.76]){const {view,events}=sample(s,0,1,p);assert.equal(events.length,0);assert.ok(view.opacity[1]>0)}
 assert.equal(s.epochs[1],1)
 sample(s,1,1);sample(s,0,1,.6);sample(s,0,1,.2)
 assert.equal(s.epochs[0],2)
 for(const p of [.245,.235,.25,.22])assert.equal(sample(s,0,1,p).events.length,0)
})
test('meaningful reversal changes choreography once; sequence and reduced motion retain gates',()=>{
 const s=fresh();sample(s,0,0);sample(s,0,1,.9);sample(s,0,1,.87);assert.equal(s.direction,1);sample(s,0,1,.79);assert.equal(s.direction,-1)
 const reduced=fresh();assert.equal(advanceCopyGate(reduced,{from:0,to:1,mix:.5,reducedMotion:true}).length,4)
 assert.deepEqual(copyChoreography({from:0,to:1,mix:.5,reducedMotion:true}).opacity,[1,1,1,1])
 sample(s,3,3);assert.ok(advanceCopyGate(s,{from:3,to:3,mix:1,sequence:true}).some(e=>e.chapter===3&&!e.entered))
})
