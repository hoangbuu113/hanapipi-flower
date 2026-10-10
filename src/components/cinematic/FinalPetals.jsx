import { useState } from 'react'

// Mounted only after the curtain finishes; no pre-advanced animation phases.
const petals = [
  { x: '14%', size: 72, drift: '6vw', turn: '-18deg', delay: 0.35, cell: '0% 0%' },
  { x: '76%', size: 64, drift: '-5vw', turn: '24deg', delay: 3.6, cell: '100% 0%' },
  { x: '33%', size: 60, drift: '4vw', turn: '-32deg', delay: 6.85, cell: '0% 100%' },
  { x: '88%', size: 68, drift: '-7vw', turn: '12deg', delay: 10.1, cell: '100% 100%' },
  { x: '51%', size: 62, drift: '-4vw', turn: '16deg', delay: 13.35, cell: '100% 0%' },
  { x: '23%', size: 66, drift: '5vw', turn: '-24deg', delay: 16.6, cell: '0% 0%' },
  { x: '65%', size: 70, drift: '-6vw', turn: '28deg', delay: 19.85, cell: '100% 100%' },
  { x: '42%', size: 64, drift: '3vw', turn: '-12deg', delay: 23.1, cell: '0% 100%' },
]
const dust = [
  { x: -21, y: -18, size: 2 }, { x: 12, y: -26, size: 3 },
  { x: 30, y: -5, size: 2 }, { x: 18, y: 20, size: 2 },
  { x: -19, y: 24, size: 3 }, { x: -31, y: 5, size: 2 },
]

function Petal({ petal }) {
  const [dissolving, setDissolving] = useState(false)
  const reset = event => {
    // Child effects cannot reset a petal; only the next outer fall cycle can.
    if (event.target === event.currentTarget) setDissolving(false)
  }
  return <span className="chapter-final-petal" data-dissolving={dissolving || undefined} onAnimationIteration={reset} style={{ '--petal-x': petal.x, '--petal-size': petal.size + 'px', '--petal-drift': petal.drift, '--petal-turn': petal.turn, '--petal-delay': petal.delay + 's' }}>
    <span className="chapter-final-petal-sprite" style={{ backgroundPosition: petal.cell }} onClick={() => setDissolving(true)} />
    <span className="chapter-petal-glow" />
    {dust.map((mote, index) => <span key={index} className="chapter-petal-dust" style={{ '--dust-x': mote.x + 'px', '--dust-y': mote.y + 'px', '--dust-size': mote.size + 'px', '--dust-delay': index * 35 + 'ms' }} />)}
  </span>
}

export default function FinalPetals() {
  return <div className="chapter-final-petals" aria-hidden="true">
    {petals.map((petal, index) => <Petal key={index} petal={petal} />)}
  </div>
}
