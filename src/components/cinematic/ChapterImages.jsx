import { memo, useId } from 'react'
import ChapterHero from './ChapterHero'
import ChapterWorld from './ChapterWorld'
import { CHAPTERS } from './cinematicConfig.js'
import { mixPaletteColor } from './chapterPalette.js'
import { paintReveal } from './paintReveal.js'
import { curtainShape } from './curtainGeometry.js'
import FinalPetals from './FinalPetals'
import BloomIris from './BloomIris'
import PaintedBloom from './PaintedBloom'
import { bloomReveal } from './bloomReveal.js'

const whiteSilk = ['#e2e5e8', '#f7f8f5', '#e2e5e8', '#c6c7ca', '#fffefa', '#e6e8e1', '#a6aaa1', '#f7f8f3']
const roseSilk = ['#dcc9bb', '#f0e5dc', '#d4b3a9', '#c9a09e', '#fbf1e9', '#e5cec6', '#ac8e86', '#f5e8df']
function SilkDrape({ phase, opening, tone }) {
  const colors = whiteSilk.map((color, index) => tone <= 0 ? color : tone >= 1 ? roseSilk[index] : mixPaletteColor(color, roseSilk[index], tone))
  const id = 'silk-' + useId().replaceAll(':', '')
  const { edge, seam, folds } = curtainShape(phase, opening)
  return <svg className="chapter-silk-drape" viewBox="0 0 500 1000" preserveAspectRatio="none" focusable="false">
    <defs>
      <linearGradient id={id + '-base'} x1="0" y1="0" x2="1" y2=".3">
        <stop stopColor={colors[0]} /><stop offset=".46" stopColor={colors[1]} /><stop offset="1" stopColor={colors[2]} />
      </linearGradient>
      <linearGradient id={id + '-fold'}>
        <stop stopColor={colors[3]} stopOpacity="0" /><stop offset=".18" stopColor={colors[3]} stopOpacity=".23" /><stop offset=".38" stopColor={colors[5]} stopOpacity=".12" /><stop offset=".57" stopColor={colors[4]} stopOpacity=".24" /><stop offset=".78" stopColor={colors[5]} stopOpacity=".1" /><stop offset=".9" stopColor={colors[6]} stopOpacity=".2" /><stop offset="1" stopColor={colors[6]} stopOpacity="0" />
      </linearGradient>
      <pattern id={id + '-weave'} width="3" height="4" patternUnits="userSpaceOnUse">
        <path d="M0 .5H3M.6 2.5H2.4" fill="none" stroke={colors[6]} strokeWidth=".45" strokeOpacity=".055" />
        <path d="M.5 0V4M2 1V3" fill="none" stroke={colors[7]} strokeWidth=".4" strokeOpacity=".08" />
      </pattern>
      <clipPath id={id + '-edge'}><path d={edge} /></clipPath>
    </defs>
    <g clipPath={'url(#' + id + '-edge)'}>
      <path d={edge} fill={'url(#' + id + '-base)'} fillOpacity="1" />
      {folds.map((path, index) => <path key={index} d={path} fill={'url(#' + id + '-fold)'} />)}
      {folds.map((path, index) => <path key={'weave-' + index} d={path} fill={'url(#' + id + '-weave)'} />)}
      <path d={seam} fill="none" stroke={colors[7]} strokeOpacity=".25" strokeWidth="2.4" />
    </g>
  </svg>
}

// Chapter objects are stable; input only changes the parent scene's visibility.
// Retain photograph/world elements while transient effects update each frame.
const ChapterSceneContent = memo(function ChapterSceneContent({ chapter }) {
  return <div className="chapter-scene-content"><ChapterWorld chapter={chapter} /><ChapterHero chapter={chapter} /></div>
})

export default memo(function ChapterImages({ transition, suspended = false }) {
  const { from, to, mix } = transition
  const moving = from !== to
  const bloom = moving && to === 1
  const bloomMedia = bloom ? bloomReveal(mix) : null
  const paint = moving && to === 2
  const paintMedia = paint ? paintReveal(mix) : null
  const curtain = moving && to === 3
  // White silk closes first; recolor and swap under full cover; rose silk opens.
  const ease = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t) }
  const curtainOpening = mix > .58
  const curtainPhase = mix < .42 ? ease(mix / .42) : curtainOpening ? ease((mix - .58) / .42) : 1
  const curtainTone = ease((mix - .44) / .12)
  const curtainScene = mix < .5 ? from : to
  return <div className="chapter-experience" aria-hidden="true" data-sequence-covered={suspended || undefined}
    style={suspended ? { visibility: 'hidden' } : undefined}>
    <div className="chapter-images">
      {CHAPTERS.map((chapter, index) => {
        return <div key={chapter.key} className="chapter-image-scene" data-chapter={index + 1}
          hidden={curtain ? index !== curtainScene : paint ? index !== (paintMedia.scene ? to : from) : bloom ? index !== (bloomMedia.scene ? to : from) : index !== from && index !== to}
          style={{ opacity: 1, zIndex: index === to ? 1 : 0,
            maskImage: 'none', maskSize: '100% 100%', maskRepeat: 'no-repeat',
            maskPosition: '0% 0%' }}>
          <ChapterSceneContent chapter={chapter} />
        </div>
      })}
      {bloom && <BloomIris media={bloomMedia} />}
      {paint && <PaintedBloom media={paintMedia} />}
      {!moving && from === 3 && <FinalPetals />}
      {curtain && <div className="chapter-sheer-curtains" style={{ opacity: 1 }}>
        <div className="chapter-sheer-curtain chapter-sheer-curtain--left"><SilkDrape phase={curtainPhase} opening={curtainOpening} tone={curtainTone} /></div>
        <div className="chapter-sheer-curtain chapter-sheer-curtain--right"><SilkDrape phase={curtainPhase} opening={curtainOpening} tone={curtainTone} /></div>
      </div>}
    </div>
  </div>
})
