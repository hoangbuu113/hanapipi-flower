import test from 'node:test'
import assert from 'node:assert/strict'
import { createTelemetryBuffer, startCinematicTelemetry, cinematicTelemetry } from '../src/components/cinematic/cinematicTelemetry.js'
test('normal/server route installs no telemetry or browser APIs', () => { assert.equal(startCinematicTelemetry(), undefined); assert.equal(cinematicTelemetry, null) })
test('bounded ring preserves chronological records, overflow and timestamp', () => { let at = 10; const b = createTelemetryBuffer({ capacity: 3, now: () => at }); b.record('sample', 9); assert.equal(b.export().records.length, 0); b.start(); for(let i=0;i<5;i++){ at++;b.record('draw',i) } b.stop(); at=500; b.record('draw',99); const r=b.export();assert.equal(r.dropped,2);assert.deepEqual(r.records,[[3,'draw',2],[4,'draw',3],[5,'draw',4]]);assert.equal(r.durationMs,5);assert.equal(r.startPerformanceMs,10) })
test('disabled query leaves DOM, RAF and observers untouched', () => { globalThis.window={location:{search:'?cinematicTelemetry=0'}}; try { assert.equal(startCinematicTelemetry(),undefined);assert.equal(cinematicTelemetry,null) } finally { delete globalThis.window } })

import { telemetrySmokeFrameAt } from '../src/components/cinematic/smokeTelemetryMapping.js'
import { H_FINAL_TIMELINE, createHFinalFrameStore } from '../src/components/cinematic/hFinalSmoke.js'
import { SMOKE_TRANSITION_TIMING } from '../src/components/cinematic/smokeTransitionConfig.js'
test('telemetry follows effective80 runtime PTS including cover/reveal/end rather than archive88 end', () => {
  assert.equal(telemetrySmokeFrameAt(0),1); assert.equal(telemetrySmokeFrameAt(1),80)
  assert.equal(telemetrySmokeFrameAt(SMOKE_TRANSITION_TIMING.swap),SMOKE_TRANSITION_TIMING.safeSwapFrame)
  for(let i=0;i<80;i++)assert.equal(telemetrySmokeFrameAt(H_FINAL_TIMELINE.frames[i].pts / SMOKE_TRANSITION_TIMING.duration),i+1)
})
test('progressive startup instrumentation decodes current24 while final encoded frame is still pending', async () => {
  let release,decodes=0,ready=false; const events=[]
  const held=new Promise(r=>release=r),telemetry={record:(...row)=>events.push(row),source:()=>{},bootstrap:(...v)=>events.push(['bootstrap',...v])}
  const store=createHFinalFrameStore({mobile:true,telemetry,fetchFrame:async url=>({ok:true,blob:async()=>{if(url.endsWith(H_FINAL_TIMELINE.frames[87].file))await held;return {size:4}}}),decodeFrame:async()=>{decodes++;return {width:960,height:540,close(){}}},onReady:()=>ready=true})
  const loading=store.load();try {
    for(let i=0;i<100&&store.getStats().fetched!==87;i++)await new Promise(r=>setImmediate(r))
    assert.equal(store.getStats().fetched,87);for(let i=0;i<100&&!ready;i++)await new Promise(r=>setImmediate(r));assert.equal(decodes,24);assert.equal(ready,true)
    assert.ok(events.some(x=>x[0]==='pump'&&x[1]===0))
    release();await loading;for(let i=0;i<100&&!ready;i++)await new Promise(r=>setImmediate(r))
    assert.equal(store.getStats().fetched,88);assert.equal(ready,true);assert.equal(store.getStats().decoded,24)
    const encoded=events.findIndex(x=>x[0]==='fetch'&&x[2]===3&&x[4]===88),submit=events.findIndex(x=>x[0]==='decodeSubmit')
    assert.ok(encoded>submit && submit>=0);assert.ok(events.some(x=>x[0]==='pump'&&x[1]===5&&x[2]<88));assert.ok(events.some(x=>x[0]==='ready'&&x[1]<88&&x[2]===24))
  } finally {release();store.dispose()}
})
