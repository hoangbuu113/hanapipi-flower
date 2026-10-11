// Demand-only display-frame gate. Input bursts invalidate one pending sample;
// the callback reads the latest native position, never a queued input history.
export function createScrollFrameGate(update, {
  requestFrame = callback => requestAnimationFrame(callback),
  cancelFrame = id => cancelAnimationFrame(id),
} = {}) {
  let frame = null, disposed = false
  const render = at => {
    frame = null
    if (!disposed) update(at)
  }
  return {
    schedule() {
      if (!disposed && frame === null) frame = requestFrame(render)
    },
    dispose() {
      disposed = true
      if (frame !== null) cancelFrame(frame)
      frame = null
    },
  }
}
