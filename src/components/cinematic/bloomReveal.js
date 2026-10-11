const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
const ease = value => { const p = clamp(value); return p < 1e-9 ? 0 : p > 1 - 1e-9 ? 1 : p * p * p * (p * (6 * p - 15) + 10) }
const point = (x, y) => x.toFixed(2) + ' ' + y.toFixed(2)
const polar = (radius, angle) => [500 + radius * Math.cos(angle), 500 + radius * Math.sin(angle)]
const trace = points => 'L' + point(...points[0]) + points.slice(0, -1).map((p, i) => 'Q' + point(...p) + ' ' + point((p[0] + points[i + 1][0]) / 2, (p[1] + points[i + 1][1]) / 2)).join('') + 'L' + point(...points.at(-1))

// The drawings stay fixed while compositor transforms move the three whorls.
export const bloomPetalShapes = [0, 1, 2].map(layer => {
  const count = [8, 10, 12][layer], inner = [12, 125, 305][layer]
  const outer = inner + [270, 335, 420][layer], width = Math.PI / count * 1.05
  const controls = []
  const at = (radius, angle) => {
    const xy = [radius * Math.cos(angle) - inner, radius * Math.sin(angle)]
    controls.push(xy)
    return point(...xy)
  }
  const path = 'M' + at(inner, -.06)
    + 'C' + at(inner + 40, -width * .7) + ' ' + at(outer - 65, -width * 1.12) + ' ' + at(outer, -width * .5)
    + 'C' + at(outer + 45, -width * .12) + ' ' + at(outer + 40, width * .85) + ' ' + at(outer - 45, width)
    + 'C' + at(inner + 100, width * 1.12) + ' ' + at(inner - 8, width * .5) + ' ' + at(inner, -.06) + 'Z'
  const curl = 'M' + at(inner, -.06) + 'C' + at(inner + 60, width * .12) + ' ' + at(outer - 80, width * .65) + ' ' + at(outer - 45, width)
  const rib = 'M' + at(inner + 32, -.01) + 'C' + at(inner + 90, -width * .28) + ' ' + at(outer - 80, -width * .12) + ' ' + at(outer - 16, width * .18)
  const lightRadius = inner + (outer - inner) * .62
  const xs = controls.map(p => p[0]), ys = controls.map(p => p[1])
  const x = Math.floor(Math.min(...xs) - 6), y = Math.floor(Math.min(...ys) - 6)
  const bounds = [x, y, Math.ceil(Math.max(...xs) + 6) - x, Math.ceil(Math.max(...ys) + 6) - y]
  return { path, curl, rib, bounds, light: [lightRadius * Math.cos(-width * .32) - inner, lightRadius * Math.sin(-width * .32)] }
})

export function bloomRadiusAt(progress) {
  const p = clamp(progress)
  return 1280 * (p < .44 ? 1 - ease(p / .44) : p > .56 ? ease((p - .56) / .44) : 0)
}
export function bloomReveal(progress) {
  const p = clamp(progress), radius = bloomRadiusAt(p), twist = .95 * (p < .44 ? ease(p / .44) : p > .56 ? 1 - ease((p - .56) / .44) : 1)
  const aperture = angle => radius * (.98 + .16 * Math.cos(angle * 8))
  const boundary = angle => ({
    outer: polar(2200, angle),
    c1: polar(1200 + radius * .2, angle + twist * .4),
    c2: polar(aperture(angle) + 230, angle + twist),
    inner: polar(aperture(angle), angle + twist),
  })
  const petals = Array.from({ length: 8 }, (_, index) => {
    const a = index * Math.PI / 4, b = a + Math.PI / 4
    const left = boundary(a), right = boundary(b)
    const rim = Array.from({ length: 13 }, (_, i) => {
      const angle = a + (b - a) * i / 12
      return polar(aperture(angle), angle + twist)
    })
    const path = 'M' + point(...left.outer) + 'C' + point(...left.c1) + ' ' + point(...left.c2) + ' ' + point(...left.inner)
      + trace(rim) + 'C' + point(...right.c2) + ' ' + point(...right.c1) + ' ' + point(...right.outer)
      + 'A2200 2200 0 0 0 ' + point(...left.outer) + 'Z'
    const fold = boundary(a + .11)
    const crease = 'M' + point(...left.outer) + 'C' + point(...left.c1) + ' ' + point(...left.c2) + ' ' + point(...left.inner)
      + 'L' + point(...fold.inner) + 'C' + point(...fold.c2) + ' ' + point(...fold.c1) + ' ' + point(...fold.outer)
      + 'A2200 2200 0 0 0 ' + point(...left.outer) + 'Z'
    const veins = [.36, .62].map(fraction => {
      const angle = a + (b - a) * fraction
      return 'M' + point(...polar(aperture(angle) + 55, angle + twist)) + 'C'
        + point(...polar(aperture(angle) + 180, angle + twist + .06)) + ' '
        + point(...polar(aperture(angle) + 360, angle + twist * .65)) + ' '
        + point(...polar(aperture(angle) + 630, angle + twist * .25))
    })
    return { path, crease, rim: 'M' + point(...rim[0]) + trace(rim), veins }
  })
  const whorls = [2, 1, 0].flatMap(layer => Array.from({ length: [8, 10, 12][layer] }, (_, index) => {
    const angle = index * Math.PI * 2 / [8, 10, 12][layer] + twist + layer * .23
    const distance = radius * .84 + [12, 125, 305][layer]
    return { ...bloomPetalShapes[layer], layer, tone: (index + layer * 2) % 8, angle,
      x: distance * Math.cos(angle), y: distance * Math.sin(angle) }
  }))
  return { scene: p < .5 ? 0 : 1, closed: radius === 0, radius, petals, whorls,
    tone: ease((p - .44) / .12) }
}
