const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t) }

// Close and open top-down. A small outward sweep keeps the closing tail loose.
export function curtainOffsetAt(phase, opening, height) {
  const p = clamp(phase), y = clamp(height)
  // A smaller shared height lag keeps the triangular gap restrained in both directions.
  const travel = ease(p * 1.28 - y * .28)
  const open = opening ? travel : 1 - travel
  const sweep = opening ? 0 : 18 * Math.sin(Math.PI * p) * y ** 4
  return Math.max(-550, -550 * open - sweep)
}

export function curtainShape(phase, opening) {
  const rows = Array.from({ length: 25 }, (_, index) => {
    const y = index / 24
    return { y: y * 1000, offset: curtainOffsetAt(phase, opening, y) }
  })
  const points = x => rows.map(row => (x + row.offset).toFixed(2) + ' ' + row.y.toFixed(2))
  const seam = 'M' + points(500).join('L')
  const edge = 'M0 0L' + points(500).join('L') + 'L0 1000Z'
  // Eight gently varied pleats keep the cloth soft rather than mechanically striped.
  const pleats = [-24, 42, 111, 175, 245, 308, 377, 440, 508]
  const folds = pleats.slice(0, -1).map((x, index) => {
    return 'M' + points(x).join('L') + 'L' + points(pleats[index + 1] + 1).reverse().join('L') + 'Z'
  })
  return { edge, seam, folds }
}
