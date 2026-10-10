import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SEQUENCE_FRAME_COUNT,
  MASTER_FRAME_COUNT,
  SEQUENCE_FPS,
  LEGACY_SEQUENCE_TIMELINE,
  SEQUENCE_ASPECT,
  SEQUENCE_SCROLL,
  TOTAL_SCROLL,
  getFrameUrl,
} from '../src/components/cinematic/sequenceConfig.js'

test('sequenceConfig has exactly 300 continuous frames and valid URL mappings', () => {
  assert.equal(MASTER_FRAME_COUNT, 300)
  assert.equal(SEQUENCE_FRAME_COUNT, 480)
  assert.ok(Math.abs(SEQUENCE_ASPECT - 3840 / 2160) < 1e-9)
  assert.equal(getFrameUrl(0), '/media/hutflower/scroll-sequence/frame_00001.jpg')
  assert.equal(getFrameUrl(149), '/media/hutflower/scroll-sequence/frame_00150.jpg')
  assert.equal(getFrameUrl(299), '/media/hutflower/scroll-sequence/frame_00300.jpg')

  // Clamping at boundaries
  assert.equal(getFrameUrl(-10), '/media/hutflower/scroll-sequence/frame_00001.jpg')
  assert.equal(getFrameUrl(500), '/media/hutflower/scroll-sequence/frame_00300.jpg')

  // Scroll budgets are additive and substantial
  assert.ok(SEQUENCE_SCROLL.sequenceDesktop >= 600, 'sufficient scroll budget for 300 frames')
  assert.ok(SEQUENCE_SCROLL.smokeDesktop >= 100, 'sufficient scroll budget for painterly wash')
  assert.ok(TOTAL_SCROLL.desktop > SEQUENCE_SCROLL.chapterDesktop + 500)
})

import { SEQUENCE_VIDEOS } from '../src/components/cinematic/sequenceConfig.js'
import { createVideoScrubber, needsMasterSettle, selectSequenceVideo, sequenceFrameAt, sequenceTimeAt } from '../src/components/cinematic/videoSequence.js'

test('video mapping holds exact first/final frames and reverses on the RIFE48fps source timeline', () => {
  assert.deepEqual([0, 74/480, 149/480, 224/480, 1].map(p=>sequenceFrameAt(p)), [0,74,149,224,479])
  assert.deepEqual([1,.5,0].map(p=>sequenceFrameAt(p)),[479,240,0])
  assert.equal(sequenceTimeAt(479),479/48)
  assert.equal(sequenceTimeAt(0),0)
  assert.equal(sequenceFrameAt(-2),0)
  assert.equal(sequenceFrameAt(2),479)
})

test('adaptive source checks real candidate bitrate/capability and falls back from an unsmooth desktop tier', async () => {
  const checks=[]
  const capabilities={async decodingInfo(config){checks.push(config);return {supported:true,smooth:config.video.height===1080,powerEfficient:true}}}
  const fallback=await selectSequenceVideo({mobile:false,capabilities})
  assert.equal(fallback.tier,'1080p')
  assert.deepEqual(checks.map(x=>x.video.height),[1440,1080])
  assert.equal(checks[0].video.bitrate,SEQUENCE_VIDEOS[1].bitrate)
  assert.equal(checks[0].video.framerate,48)
  checks.length=0
  assert.equal((await selectSequenceVideo({mobile:true,capabilities})).tier,'1080p')
  assert.deepEqual(checks.map(x=>x.video.height),[1080])
  assert.equal((await selectSequenceVideo({mobile:false})).tier,'1440p')
  assert.equal((await selectSequenceVideo({mobile:false,canPlay:codec=>codec===SEQUENCE_VIDEOS[0].codec})).tier,'1080p')
  assert.equal((await selectSequenceVideo({mobile:false,capabilities:{async decodingInfo(){throw Error('unsupported API')}}})).tier,'1440p')
})

test('master settle is useful only above the delivered physical resolution, never on phones', () => {
  const source=SEQUENCE_VIDEOS[1]
  assert.equal(needsMasterSettle(source,{width:1920,height:1080}),false)
  assert.equal(needsMasterSettle(source,{width:2560,height:1440}),false)
  assert.equal(needsMasterSettle(source,{width:3840,height:2160}),true)
  assert.equal(needsMasterSettle(source,{width:1920,height:1080,dpr:2}),true)
  assert.equal(needsMasterSettle(SEQUENCE_VIDEOS[0],{width:390,height:844,dpr:3,mobile:true}),false)
})

function videoHarness(presentation=true) {
  const events=new Map(),rafs=new Map(),timers=new Map(),callbacks=new Map(),seeks=[],shown=[],errors=[]
  let id=0,time=0,current=0
  const video={readyState:0,seeking:false,
    addEventListener(type,cb){events.set(type,cb)},removeEventListener(type){events.delete(type)},
    get currentTime(){return current},set currentTime(value){current=value;this.seeking=true;seeks.push(value)},
  }
  if(presentation){video.requestVideoFrameCallback=cb=>{callbacks.set(++id,cb);return id};video.cancelVideoFrameCallback=n=>callbacks.delete(n)}
  const scrubber=createVideoScrubber(video,{
    requestFrame:cb=>{rafs.set(++id,cb);return id},cancelFrame:n=>rafs.delete(n),
    delay:cb=>{timers.set(++id,cb);return id},cancelDelay:n=>timers.delete(n),now:()=>time,
    onPresent:(frame,latency)=>shown.push([frame,latency]),onError:error=>errors.push(error),
  })
  const flush=()=>{for(const[n,cb]of [...rafs]){rafs.delete(n);time+=16;cb(time)}}
  const present=frame=>{const[n,cb]=callbacks.entries().next().value;callbacks.delete(n);cb(time,{mediaTime:frame/48})}
  const loaded=()=>{video.readyState=2;events.get('loadeddata')();if(presentation)present(0);else flush()}
  const ended=()=>{video.seeking=false;events.get('seeked')()}
  return {video,scrubber,rafs,timers,callbacks,events,seeks,shown,errors,flush,present,loaded,ended}
}

test('scrubber coalesces burst targets and keeps only the latest target during an in-flight seek', () => {
  const h=videoHarness();h.loaded()
  for(const frame of [50,90,140,190])h.scrubber.setTarget(frame)
  assert.equal(h.rafs.size,1);h.flush()
  assert.deepEqual(h.seeks,[190/48])
  h.scrubber.setTarget(210);h.scrubber.setTarget(299);h.flush()
  assert.equal(h.seeks.length,1)
  h.present(190)
  assert.equal(h.scrubber.getState().busy,true,'presentation alone must not start an overlapping seek')
  h.ended();h.flush()
  assert.deepEqual(h.seeks,[190/48,299/48])
  h.ended();h.present(299)
  assert.equal(h.scrubber.getState().busy,false)
  h.scrubber.setTarget(299);h.flush()
  assert.equal(h.seeks.length,2,'unchanged frame causes no seek')
  assert.equal(h.rafs.size,0)
  h.scrubber.setTarget(0);h.flush();h.ended();h.present(0)
  assert.equal(h.seeks.at(-1),0)
  h.scrubber.dispose()
  assert.equal(h.callbacks.size+h.rafs.size+h.timers.size+h.events.size,0)
})

test('outdated presentation callbacks cannot acknowledge the next requested frame', () => {
  const h=videoHarness();h.loaded();h.scrubber.setTarget(150);h.flush();h.present(0);h.ended()
  assert.equal(h.scrubber.getState().busy,true)
  assert.equal(h.shown.at(-1)[0],0)
  h.present(150)
  assert.equal(h.scrubber.getState().busy,false)
  assert.equal(h.shown.at(-1)[0],150)
  h.scrubber.dispose()
})

test('seeked plus one RAF safely replaces presentation callbacks in older browsers', () => {
  const h=videoHarness(false);h.loaded();h.scrubber.setTarget(74);h.flush()
  assert.equal(h.scrubber.getState().busy,true)
  h.scrubber.setTarget(224);h.ended();h.flush()
  assert.equal(h.shown.at(-1)[0],74)
  h.flush();assert.equal(h.seeks.at(-1),224/48)
  h.ended();h.flush();assert.equal(h.shown.at(-1)[0],224)
  h.scrubber.dispose();assert.equal(h.rafs.size+h.timers.size+h.events.size,0)
})

test('pending media targets wait for data, and disposal cancels queued seeks', () => {
  const h=videoHarness();h.scrubber.setTarget(149);h.flush();assert.equal(h.seeks.length,0)
  h.loaded();h.flush();assert.deepEqual(h.seeks,[149/48])
  h.scrubber.setTarget(224);h.scrubber.dispose();h.flush()
  assert.equal(h.seeks.length,1)
  assert.equal(h.callbacks.size+h.timers.size+h.events.size,0)
})

test('source retry clears only decoder state while retaining the latest scroll target', () => {
  const h=videoHarness();h.loaded();h.scrubber.setTarget(224);h.flush()
  h.scrubber.reset();assert.equal(h.scrubber.getState().desired,224)
  assert.equal(h.scrubber.getState().busy,false)
  h.loaded();h.flush();assert.equal(h.seeks.at(-1),224/48)
  h.ended();h.present(224);assert.equal(h.shown.at(-1)[0],224)
  h.scrubber.dispose();assert.equal(h.callbacks.size+h.rafs.size+h.timers.size+h.events.size,0)
})

import { masterSampleAt } from '../src/components/cinematic/sequenceTimeline.js'
import { REAL_MASTER_INDICES } from '../src/components/cinematic/sequenceSourceMap.js'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

test('real24fps timestamps and synthetic midpoints map to authoritative masters',()=>{
 assert.equal(REAL_MASTER_INDICES.length,240);
 for(let n=0;n<240;n++){
  const frame=sequenceFrameAt((n/24)/10);assert.equal(frame,n*2);
  const real=masterSampleAt(frame);assert.equal(real.synthetic,false);assert.equal(real.masterIndex,REAL_MASTER_INDICES[n]);assert.equal(real.sourceTime,n/24);
  if(n<239){const mid=masterSampleAt(frame+1);assert.equal(mid.synthetic,true);assert.equal(mid.masterIndex,REAL_MASTER_INDICES[n+1]);assert.equal(mid.sourceTime,(frame+1)/48);}
 }
 assert.deepEqual(masterSampleAt(479),{frame:479,sourceTime:239/24,uniqueIndex:239,masterIndex:299,synthetic:false});
 assert.equal(masterSampleAt(150,LEGACY_SEQUENCE_TIMELINE).masterIndex,150);
 assert.equal(sequenceFrameAt(.5,LEGACY_SEQUENCE_TIMELINE),150);assert.equal(SEQUENCE_FPS,48);
});
test('verified master mapping matches exact adjacent dedup of untouched4K sources',async()=>{
 const indices=[];let previous;
 for(let n=0;n<300;n++){const bytes=await readFile(new URL('../public/media/hutflower/scroll-sequence/frame_'+String(n+1).padStart(5,'0')+'.jpg',import.meta.url));const hash=createHash('sha256').update(bytes).digest('hex');if(hash!==previous)indices.push(n);previous=hash;}
 assert.deepEqual(REAL_MASTER_INDICES,indices);
});
