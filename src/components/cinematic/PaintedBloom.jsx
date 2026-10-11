import { memo, useId } from 'react'

// Connected broad pigment ribbons; narrow inset traces suggest a dragged brush.
// These paths and their React props are retained while parent variables change.
const ribbons = [
  ['M-160 250 C190 30 353 428 706 229 S1260 53 1770 267 L1770 351 C1280 165 1050 497 709 323 S216 123 -160 371Z', 1],
  ['M-80 629 C235 383 389 757 775 491 S1319 400 1700 600 L1700 682 C1357 493 1072 724 791 603 S232 527 -80 746Z', 2],
  ['M106 -100 C434 211 177 485 486 671 S554 919 383 1100 L253 1100 C463 864 437 822 356 702 S267 194 -26 -100Z', 0],
  ['M1340 -130 C1047 168 1451 379 1125 677 S1237 969 1410 1100 L1547 1100 C1275 900 1238 846 1260 718 S1321 139 1487 -130Z', 1],
  ['M-100 880 C232 713 585 1047 918 800 S1440 786 1710 888 L1710 1040 C1357 916 1124 1070 958 946 S252 867 -100 1022Z', 3],
  ['M-130 83 C370 -53 550 230 1017 85 S1360 118 1710 22 L1710 149 C1380 222 1256 169 1003 211 S451 66 -130 178Z', 3],
]
const Pigment = memo(function Pigment() {
  const id = 'brush-' + useId().replaceAll(':', '')
  return <svg className="chapter-paint-pigment" viewBox="0 0 1600 1000" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id={id}><stop stopColor="var(--paint-0)" /><stop offset=".55" stopColor="var(--paint-1)" /><stop offset="1" stopColor="var(--paint-2)" /></linearGradient>
      <pattern id={id + '-bristle'} width="19" height="23" patternUnits="userSpaceOnUse" patternTransform="rotate(-18)">
        <path d="M0 2H19M2 5H16M0 13H14M7 17H19" stroke="var(--paint-3)" strokeWidth=".65" strokeOpacity=".11" />
      </pattern>
    </defs>
    <rect width="1600" height="1000" fill={'url(#' + id + ')'} />
    {ribbons.map(([d, color], i) => <g key={i} className={'chapter-paint-drag chapter-paint-drag--' + (i % 2 ? 'right' : 'left')}>
      <path d={d} fill={'var(--paint-' + color + ')'} fillOpacity={color === 3 ? '.52' : '.64'} />
      <path d={d} fill={'url(#' + id + '-bristle)'} />
      <path d={d} fill="none" stroke="var(--paint-3)" strokeWidth="1.8" strokeOpacity=".16" />
    </g>)}
  </svg>
})
export default memo(function PaintedBloom({ media }) {
  return <div className="chapter-paint-wash" style={{
    maskImage: media.mask, maskSize: media.maskSize, maskComposite: media.maskComposite,
    '--paint-0': media.colors[0], '--paint-1': media.colors[1], '--paint-2': media.colors[2], '--paint-3': media.colors[3], '--paint-drag': media.drag,
  }}>
    <Pigment />
  </div>
})
