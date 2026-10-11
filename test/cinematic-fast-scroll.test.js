import assert from 'node:assert/strict'
import test from 'node:test'
import { createDisplayScroll, catchupResponse, advanceDisplayScroll } from '../src/components/cinematic/displayScroll.js'

test('ordinary scroll response is unchanged; backlog response is continuous, symmetric and bounded', () => {
  for (const response of [0, 150, 250, 350, 500]) {
    for (const gap of [-240, -80, 0, 80, 240]) assert.equal(catchupResponse(response, gap), response)
    for (let gap = 0; gap <= 4000; gap += 10) {
      const r = catchupResponse(response, gap)
      assert.equal(r, catchupResponse(response, -gap))
      assert.ok(r >= response / 6 && r <= response)
    }
    for (const edge of [240, 1200]) assert.ok(Math.abs(catchupResponse(response, edge - .001) - catchupResponse(response, edge + .001)) < .001)
  }
})

test('fast input catches up more strongly at multiple cadences without snapping, overshooting or queuing old intent', () => {
  for (const hz of [60,75,120]) {
    let time=0, target=0, id=0, base=0
    const frames=new Map(), samples=[]
    const c=createDisplayScroll({initial:{position:0,response:150},now:()=>time,readTarget:()=>({position:target,response:150}),publish:(p,s)=>samples.push({p,s}),requestFrame:cb=>{frames.set(++id,cb);return id},cancelFrame:key=>frames.delete(key)})
    const tick=()=>{time+=1000/hz;for(const[key,cb]of [...frames]){frames.delete(key);cb(time)}}
    for(let n=0;n<8;n++) {target+=600;c.schedule();tick();base=advanceDisplayScroll(base,target,1000/hz,150)}
    assert.ok(target-c.getState().position < (target-base)*.65, 'large-gap processing catches newest state faster')
    assert.ok(samples.every(x=>x.p>0&&x.p<=target&&x.s.effectiveResponse>=25))
    const prior=c.getState().position;target=0;c.schedule();tick();assert.ok(c.getState().position<prior)
    target=2000;c.schedule();target=1000;c.schedule();tick();assert.equal(c.getState().target,1000)
    for(let n=0;n<100&&frames.size;n++)tick()
    assert.equal(c.getState().position,1000);assert.equal(frames.size,0)
    c.resize();tick();assert.equal(c.getState().position,target);c.dispose();assert.equal(frames.size,0)
  }
})
