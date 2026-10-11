import assert from 'node:assert/strict'
import test from 'node:test'
import { register } from 'node:module'
import { segmentVietnameseGraphemes, headlineRevealTiming, HEADLINE_REVEAL } from '../src/components/cinematic/headlineGraphemes.js'
register('./cart-component-loader.js', import.meta.url)
const React = await import('react')
const { renderToStaticMarkup } = await import('react-dom/server')
const HeadlineText = (await import('../src/components/cinematic/HeadlineText.jsx')).default

test('Vietnamese letters and decomposed accents remain one visual unit without changing Unicode spelling', () => {
 for (const character of ['ó', 'ể', 'ư', 'ộ', 'ấ', 'ằ']) {
  for (const text of [character, character.normalize('NFD')]) {
   assert.deepEqual(segmentVietnameseGraphemes(text), [text])
   assert.deepEqual(segmentVietnameseGraphemes(text, null), [text])
  }
 }
 const text='Khó nói, để hoa nói thay.'
 assert.equal(segmentVietnameseGraphemes(text).join(''),text)
 assert.deepEqual(segmentVietnameseGraphemes(''), [])
 assert.deepEqual(segmentVietnameseGraphemes('👨‍👩‍👧‍👦'), ['👨‍👩‍👧‍👦'])
})
test('headline delay increases cumulatively across lines and CTA follows the completed last grapheme', () => {
 const lines=['Khó nói,','để hoa','nói thay.'],letters=lines.flatMap(line => segmentVietnameseGraphemes(line)).filter(s=>/\S/u.test(s))
 assert.equal(letters.join(''),'Khónói,đểhoanóithay.')
 const delays=letters.map((_,i)=>HEADLINE_REVEAL.start+i*HEADLINE_REVEAL.interval)
 assert.equal(delays[0],140)
 assert.equal(delays[1],182)
 assert.equal(delays.at(-1)+HEADLINE_REVEAL.duration,headlineRevealTiming(letters.length).end)
 assert.equal(headlineRevealTiming(letters.length).ctaDelay,delays.at(-1)+220+100)
 assert.ok(headlineRevealTiming(30).end>headlineRevealTiming(20).end)
})
test('visual spans reserve full text and preserve emphasis, punctuation and whitespace behind one accessible heading', () => {
 const text='nói thay.'
 const html=renderToStaticMarkup(React.createElement('h2',{'aria-label':'Khó nói, để hoa nói thay.'},React.createElement(HeadlineText,{text,as:'em'})))
 assert.ok(html.includes('<h2 aria-label="Khó nói, để hoa nói thay.">'))
 assert.ok(html.includes('<em class="lab-copy-line" aria-hidden="true">'))
 assert.equal(html.match(/class="lab-headline-grapheme"/gu).length,8)
 assert.equal(html.replace(/<[^>]+>/gu,''),text)
 assert.ok(html.includes('class="lab-headline-word"'))
})


test('cold fonts hold only headline/CTA and never resurrect an exited or cancelled entry', async () => {
 const { holdHeadlineForFonts } = await import('../src/components/cinematic/headlineGraphemes.js')
 let resolve;const ready=new Promise(r=>{resolve=r})
 const animation=()=>({playState:'running',currentTime:45,plays:0,pause(){this.playState='paused'},play(){this.playState='running';this.plays++}})
 const current=animation(),cancelled=animation(),stale=animation();
 holdHeadlineForFonts([current,cancelled],{status:'loading',ready},()=>true)
 holdHeadlineForFonts([stale],{status:'loading',ready},()=>false)
 assert.equal(current.playState,'paused');assert.equal(current.currentTime,0)
 cancelled.playState='idle';resolve();await ready;await Promise.resolve()
 assert.equal(current.plays,1);assert.ok(current.currentTime>=0 && current.currentTime<=140)
 assert.equal(cancelled.plays,0);assert.equal(stale.plays,0)
 const warm=animation();holdHeadlineForFonts([warm],{status:'loaded',ready},()=>true)
 assert.equal(warm.playState,'running');assert.equal(warm.currentTime,45)
})

test('specific headline faces bypass unrelated fonts and stalled faces release at a bounded deadline', async()=>{
 const {holdHeadlineForFonts,preloadHeadlineFonts}=await import('../src/components/cinematic/headlineGraphemes.js')
 let deadline,cleared=0,loads=[];const pending=new Promise(()=>{})
 const fonts={status:'loading',check:()=>false,load:face=>{loads.push(face);return pending},ready:pending}
 const a={playState:'running',plays:0,pause(){this.playState='paused'},play(){this.playState='running';this.plays++}}
 const cancel=holdHeadlineForFonts([a],fonts,()=>true,{faces:['400 32px Display'],setTimer:(fn,ms)=>{deadline=fn;assert.equal(ms,500);return 7},clearTimer:()=>cleared++})
 assert.equal(a.playState,'paused');assert.deepEqual(loads,['400 32px Display']);deadline();assert.equal(a.plays,1);assert.equal(cleared,1);cancel()
 const warm={...a,plays:0,playState:'running'};holdHeadlineForFonts([warm],{...fonts,check:()=>true},()=>true,{faces:['400 32px Display']});assert.equal(warm.playState,'running');assert.equal(warm.plays,0)
 const stale={...a,plays:0,playState:'running'};const stop=holdHeadlineForFonts([stale],fonts,()=>true,{faces:['italic 400 32px Display'],setTimer:fn=>{deadline=fn;return 8},clearTimer:()=>{}});stop();deadline();assert.equal(stale.plays,0)
 await preloadHeadlineFonts({load:()=>Promise.reject(Error('offline'))},['400 32px Display'])
})
