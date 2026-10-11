import { memo, useId } from 'react'
import { bloomPetalShapes } from './bloomReveal.js'
import { bloomPaletteAt } from './bloomPalette.js'

const warmTones = bloomPaletteAt(0)
const blushTones = bloomPaletteAt(1)

// Moving the HTML wrapper lets the browser retain the static SVG drawing.
export const BloomPetal = memo(function BloomPetal({ shape, colors, layer }) {
  const id = 'bloom-petal-' + useId().replaceAll(':', '')
  return <svg viewBox={shape.bounds.join(' ')} focusable="false">
    <defs><radialGradient id={id} gradientUnits="userSpaceOnUse" cx={shape.light[0]} cy={shape.light[1]} r={layer === 2 ? 335 : 225}>
      <stop stopColor="#fff8ec" /><stop offset=".32" stopColor={colors[0]} /><stop offset=".64" stopColor={colors[1]} /><stop offset="1" stopColor={colors[2]} />
    </radialGradient></defs>
    <path d={shape.path} fill={'url(#' + id + ')'} stroke={colors[2]} strokeWidth=".8" strokeOpacity=".35" />
    <path d={shape.curl} fill="none" stroke={colors[2]} strokeWidth="3.8" strokeOpacity=".16" />
    <path d={shape.curl} fill="none" stroke="#fff8ed" strokeWidth="1.25" strokeOpacity=".72" />
    <path d={shape.rib} fill="none" stroke={colors[2]} strokeWidth=".65" strokeOpacity=".19" />
  </svg>
})

function BloomBaseArtwork({ media, tones }) {
  const id = 'bloom-base-' + useId().replaceAll(':', '')
  return <g>
    <defs><radialGradient id={id} cx="50%" cy="50%" r="90%">
      <stop stopColor={tones[0][0]} /><stop offset=".55" stopColor={tones[4][1]} /><stop offset="1" stopColor={tones[3][2]} />
    </radialGradient></defs>
    <rect width="1000" height="1000" fill={tones[0][1]} opacity={Number(media.closed)} />
    <path d={media.petals.map(petal => petal.path).join('')} fill={'url(#' + id + ')'} />
    <path d={media.petals.map(petal => petal.crease).join('')} fill={tones[0][2]} opacity=".08" />
    <path d={media.petals.flatMap(petal => petal.veins).join('')} fill="none" stroke={tones[0][2]} strokeWidth="1" strokeOpacity=".13" />
    <path d={media.petals.map(petal => petal.rim).join('')} fill="none" stroke={tones[0][0]} strokeWidth="2" strokeOpacity=".35" />
  </g>
}

export default function BloomIris({ media }) {
  // Keep both endpoint drawings cached: scroll changes HTML opacity, never SVG pigment.
  // The warm drawing remains opaque underneath, so blending cannot reveal the photo.
  return <div className="chapter-bloom-iris">
    <div className="chapter-bloom-base">
      <svg viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" focusable="false">
        <BloomBaseArtwork media={media} tones={warmTones} />
      </svg>
      <div className="chapter-bloom-pigment chapter-bloom-pigment--incoming" style={{ opacity: media.tone }}>
        <svg viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" focusable="false">
          <BloomBaseArtwork media={media} tones={blushTones} />
        </svg>
      </div>
    </div>
    {media.whorls.map((petal, index) => <div key={index} className="chapter-bloom-petal"
      style={{ width: petal.bounds[2] / 10 + 'vmax', height: petal.bounds[3] / 10 + 'vmax',
        transformOrigin: (-petal.bounds[0] / petal.bounds[2] * 100) + '% ' + (-petal.bounds[1] / petal.bounds[3] * 100) + '%',
        transform: 'translate(' + ((petal.x + petal.bounds[0]) / 10) + 'vmax, ' + ((petal.y + petal.bounds[1]) / 10) + 'vmax) rotate(' + petal.angle + 'rad)' }}>
      <BloomPetal shape={bloomPetalShapes[petal.layer]} colors={warmTones[petal.tone]} layer={petal.layer} />
      <div className="chapter-bloom-pigment chapter-bloom-pigment--incoming" style={{ opacity: media.tone }}>
        <BloomPetal shape={bloomPetalShapes[petal.layer]} colors={blushTones[petal.tone]} layer={petal.layer} />
      </div>
    </div>)}
  </div>
}
