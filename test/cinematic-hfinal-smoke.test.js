import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { register } from 'node:module'
import { H_FINAL_TIMELINE as timeline, hFinalFrameAt, hFinalCover, hFinalWindow, createHFinalFrameStore } from '../src/components/cinematic/hFinalSmoke.js'
register('./cart-component-loader.js', import.meta.url)
const React = await import('react'), {act,create} = await import('react-test-renderer')
const HFinal = (await import('../src/components/cinematic/HFinalSmokeHandoff.jsx')).default
const flush = () => new Promise(resolve => setImmediate(resolve))
const wait = async fn => { for(let i=0;i<150;i++){if(fn())return;await flush()}assert.fail('Diagnostic did not settle') }
const fixtures = () => {const images=[];return {images, fetchFrame:async url=>({ok:true,blob:async()=>({id:Number(url.match(/(\d+)\.png$/)[1]),size:200})}),decodeFrame:async blob=>{const image={id:blob.id,width:960,height:540,closed:false,close(){this.closed=true}};images.push(image);return image}}}

test('production copies match all accepted PNG hashes, RGBA8 dimensions, exact native mapping',()=>{
 const provenance=JSON.parse(fs.readFileSync(new URL('../docs/cinematic/h-final-production-assets.json',import.meta.url),'utf8'))
 const production=JSON.parse(fs.readFileSync(new URL('../public/media/hanapipi/smoke/h-final/timeline.json',import.meta.url),'utf8'))
 assert.deepEqual(production,timeline);assert.equal(provenance.count,88);assert.equal(provenance.pngBytes,12416931)
 for(const f of provenance.frames){const png=fs.readFileSync(new URL('../public/media/hanapipi/smoke/h-final/'+f.file,import.meta.url));assert.equal(createHash('sha256').update(png).digest('hex'),f.sha256);assert.equal(png.readUInt32BE(16),960);assert.equal(png.readUInt32BE(20),540);assert.equal(png[24],8);assert.equal(png[25],6)}
 for(let i=0;i<88;i++){const t=timeline.frames[i].pts;assert.equal(hFinalFrameAt(t),i);assert.equal(hFinalFrameAt(t/timeline.duration*timeline.duration),i);if(i)assert.equal(hFinalFrameAt(t-.000001),i-1)}
 assert.equal(hFinalFrameAt(1.06),29);assert.equal(hFinalFrameAt(2.06),58);assert.equal(hFinalFrameAt(0),0);assert.equal(hFinalFrameAt(timeline.duration),87)
})
test('cover preserves aspect and fills desktop, portrait and 4K without a larger backing canvas',()=>{
 for(const [w,h]of [[1920,1080],[390,844],[3840,2160]]){const f=hFinalCover(w,h);assert.ok(f.width>=w&&f.height>=h);assert.ok(Math.abs(f.width/f.height-16/9)<1e-10);assert.equal(f.left,(w-f.width)/2);assert.equal(f.top,(h-f.height)/2)}
 const jsx=fs.readFileSync(new URL('../src/components/cinematic/HFinalSmokeHandoff.jsx',import.meta.url),'utf8');assert.match(jsx,/width="960" height="540"/);assert.doesNotMatch(jsx,/requestAnimationFrame|setInterval|setTimeout|setState/)
})
test('desktop full decode gate, direct alpha images, no missing start and all decoded resources close',async()=>{
 const f=fixtures();let ready=0,cap;const store=createHFinalFrameStore({...f,onReady:value=>{ready++;cap=value}})
 try{assert.equal(store.canPresent(0),false);await store.load();await wait(()=>ready===1);assert.equal(store.getStats().fetched,88);assert.equal(store.getStats().decoded,88);assert.equal(cap.ready,true);assert.equal(cap.canPresent(1),true);assert.equal(store.get(87).id,88)}finally{store.dispose()}
 assert.equal(store.getStats().decoded,0);assert.ok(f.images.every(i=>i.closed))
})
test('mobile rolling decode bounded in both directions, stays ready before every native frame',async()=>{
 const f=fixtures();let cap;const store=createHFinalFrameStore({...f,mobile:true,onReady:value=>cap=value})
 try{await store.load();await wait(()=>cap);assert.equal(store.getStats().decoded,24)
 for(const i of [...Array.from({length:88},(_,i)=>i),...Array.from({length:88},(_,i)=>87-i)]){const p=timeline.frames[i].pts/timeline.duration;await wait(()=>cap.canPresent(p));assert.equal(store.get(i).id,i+1);store.hold(i);assert.ok(store.getStats().decoded<=25)}
 assert.ok(store.getStats().peakDecoded<=25);assert.ok(store.getStats().decodeCount>88);assert.equal(store.getStats().failures.length,0);assert.equal(hFinalWindow(87,-1).length,24)
 store.setMobile(false);await wait(()=>store.getStats().decoded===88);store.setMobile(true);assert.ok(store.getStats().decoded<=25)
 }finally{store.dispose()};assert.ok(f.images.every(i=>i.closed))
})
test('failed fetch reports once, no ready callback; disposed late decode closes without stale readiness',async()=>{
 let errors=0,ready=0;const broken=createHFinalFrameStore({fetchFrame:async()=>({ok:false,status:404}),onError:()=>errors++,onReady:()=>ready++})
 await broken.load();assert.equal(errors,1);assert.equal(ready,0);assert.equal(broken.canPresent(0),false);broken.dispose()
 const f=fixtures(),pending=[];const late=createHFinalFrameStore({...f,decodeFrame:()=>new Promise(resolve=>pending.push(resolve)),onReady:()=>ready++})
 await late.load();await wait(()=>pending.length===4);late.dispose();const image={width:960,height:540,closed:0,close(){this.closed++}};pending.forEach(resolve=>resolve(image));await flush();assert.equal(image.closed,4);assert.equal(ready,0)
})
test('actual H-final component StrictMode, readiness, native ordering, resize without restart and cleanup',async()=>{
 const previous={fetch:globalThis.fetch,createImageBitmap:globalThis.createImageBitmap,ResizeObserver:globalThis.ResizeObserver,act:globalThis.IS_REACT_ACT_ENVIRONMENT};globalThis.IS_REACT_ACT_ENVIRONMENT=true
 const f=fixtures(),observers=[],subscribers=new Set(),draws=[],caps=[],measured=[];let state={progress:0,entry:0,visible:false,running:false},root,w=1920,h=1080
 const context={globalAlpha:1,clearRect(){},drawImage(image){assert.equal(this.globalAlpha,1);assert.equal(this.globalCompositeOperation,'source-over');draws.push(image.id)}}
 const canvas={style:{},getContext:()=>context},host={style:{},dataset:{},getBoundingClientRect:()=>({width:w,height:h})}
 const channel={getSnapshot:()=>state,subscribe:fn=>{subscribers.add(fn);return()=>subscribers.delete(fn)}}
 const emit=s=>{state=s;subscribers.forEach(fn=>fn(s))}
 globalThis.fetch=f.fetchFrame;globalThis.createImageBitmap=f.decodeFrame;globalThis.ResizeObserver=class{constructor(fn){this.fn=fn;observers.push(this)}observe(){}disconnect(){this.closed=true}}
 try{const props={displayScrollRef:{current:channel},settings:{mobile:false},debug:true,onReady:c=>caps.push(c),onFailure:()=>assert.fail('Unexpected failure'),onDiagnostics:d=>measured.push(d)}
 await act(async()=>{root=create(React.createElement(React.StrictMode,null,React.createElement(HFinal,props)),{createNodeMock:e=>e.type==='canvas'?canvas:e.type==='div'?host:null});await flush()});await act(async()=>{await wait(()=>caps.some(c=>c.ready))})
 assert.equal(subscribers.size,1);assert.equal(caps.filter(c=>c.ready).length,1)
 for(let i=0;i<88;i++)emit({entry:1,progress:timeline.frames[i].pts/timeline.duration,visible:true,running:true,elapsed:timeline.frames[i].pts})
 assert.deepEqual(draws,Array.from({length:88},(_,i)=>i+1));assert.equal(measured.at(-1).skipped,0)
 w=3840;h=2160;observers.at(-1).fn();assert.equal(canvas.style.width,'3840px');assert.equal(state.progress,timeline.frames[87].pts/timeline.duration)
 w=390;h=844;observers.at(-1).fn();assert.equal(canvas.style.height,'844px');assert.ok(parseFloat(canvas.style.left)<0)
 emit({entry:1,progress:1,elapsed:3.041667,visible:false,running:false,complete:true});assert.equal(host.style.visibility,'hidden');assert.equal(measured.at(-1).nativeDuration,3.041667)
 await act(async()=>root.unmount());root=null;assert.equal(subscribers.size,0);assert.ok(observers.every(o=>o.closed));assert.ok(f.images.every(i=>i.closed));assert.equal(caps.at(-1).ready,false)
 }finally{if(root)await act(async()=>root.unmount());for(const [k,v]of Object.entries(previous)){if(k==='act')globalThis.IS_REACT_ACT_ENVIRONMENT=v;else globalThis[k]=v}}
})
test('normal boundary has one H-final renderer and no temporary smoke production dependency',()=>{
 const boundary=fs.readFileSync(new URL('../src/components/cinematic/SmokeTransition.jsx',import.meta.url),'utf8');assert.match(boundary,/import\('\.\/HFinalSmokeHandoff\.jsx'\)/);assert.doesNotMatch(boundary,/SoftSmoke|ReactSmoke|react-smoke|\.webm|\.mp4/)
 const store=fs.readFileSync(new URL('../src/components/cinematic/hFinalSmoke.js',import.meta.url),'utf8');assert.doesNotMatch(store,/requestAnimationFrame|setInterval/)
 const page=fs.readFileSync(new URL('../src/pages/CinematicLabPage.jsx',import.meta.url),'utf8');assert.match(page,/smokeEnabled = !reducedMotion/);assert.match(page,/smokeCandidate \? takeover.channelRef/)
})
