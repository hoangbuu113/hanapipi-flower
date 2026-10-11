const smooth = (a, b, p) => { const t = Math.max(0, Math.min(1, (p - a) / (b - a))); return t * t * (3 - 2 * t) }
export const COPY_TIMING = { hold: .5, exit: .64, enter: .76, rearm: .68, fadeEnd: .84, directionTravel: .08 }

// The same visual phase controls visibility and entry, in either scroll direction.
export function copyChoreography({ from, to, mix, direction = 1, armed = [false, false, false, false], reducedMotion = false }) {
  const opacity = [0, 0, 0, 0]
  if (reducedMotion) return { opacity: [1, 1, 1, 1], activeChapter: from }
  if (from === to) { opacity[from] = 1; return { opacity, activeChapter: from } }
  const outgoing = direction < 0 ? to : from, incoming = direction < 0 ? from : to
  const progress = direction < 0 ? 1 - mix : mix
  opacity[outgoing] = 1 - smooth(COPY_TIMING.hold, COPY_TIMING.exit, progress)
  // Entry is latched. Small reversals never blank or restart an entered headline.
  opacity[incoming] = armed[incoming] ? 0 : smooth(COPY_TIMING.rearm, COPY_TIMING.fadeEnd, progress)
  return { opacity, outgoing, incoming, progress, activeChapter: opacity[incoming] > opacity[outgoing] ? incoming : outgoing }
}

export function advanceCopyGate(state, { from, to, mix, sequence = false, reducedMotion = false }) {
  const events = []
  const exit = chapter => { if (!state.armed[chapter]) { state.armed[chapter] = true; events.push({ chapter, entered: false, epoch: state.epochs[chapter] }) } }
  const enter = chapter => { if (state.armed[chapter]) { state.armed[chapter] = false; events.push({ chapter, entered: true, epoch: ++state.epochs[chapter] }) } }
  if (reducedMotion) { for (let i = 0; i < 4; i++) enter(i); return events }
  if (sequence) { exit(3); return events }
  if (from === to) {
    state.settled = from; state.edge = null
    for (let i = 0; i < 4; i++) if (i !== from) exit(i)
    enter(from)
  } else {
    const edge = `${from}:${to}`
    if (state.edge !== edge) {
      state.edge = edge; state.direction = state.settled === to ? -1 : 1; state.extreme = mix
    } else if (state.direction > 0) {
      state.extreme = Math.max(state.extreme, mix)
      if (state.extreme - mix >= COPY_TIMING.directionTravel) { state.direction = -1; state.extreme = mix }
    } else {
      state.extreme = Math.min(state.extreme, mix)
      if (mix - state.extreme >= COPY_TIMING.directionTravel) { state.direction = 1; state.extreme = mix }
    }
    const view = copyChoreography({ from, to, mix, direction: state.direction, armed: state.armed })
    for (let i = 0; i < 4; i++) if (i !== from && i !== to) exit(i)
    if (view.progress <= COPY_TIMING.hold) enter(view.outgoing)
    if (view.progress >= COPY_TIMING.exit) exit(view.outgoing)
    if (view.progress < COPY_TIMING.rearm) exit(view.incoming)
    if (view.progress >= COPY_TIMING.enter) enter(view.incoming)
  }
  return events
}
