// One cancellable startup/idle gate; proximity mounting remains the fallback.
export function scheduleSmokePreload({ document, window, onStart }) {
  let cancelled = false, idle = null, timer = null, load = null
  async function prepare() {
    const image = document.querySelector('.chapter-image-scene[data-chapter="1"] img')
    await Promise.allSettled([image?.decode?.(), document.fonts?.ready])
    if (cancelled) return
    const start = () => { if (!cancelled) onStart() }
    if (window.requestIdleCallback) idle = window.requestIdleCallback(start)
    else timer = window.setTimeout(start, 0)
  }
  if (document.readyState === 'complete') void prepare()
  else { load = () => { window.removeEventListener('load', load); void prepare() }; window.addEventListener('load', load, { once: true }) }
  return () => { cancelled = true; if (load) window.removeEventListener('load', load); if (idle !== null) window.cancelIdleCallback(idle); if (timer !== null) window.clearTimeout(timer) }
}
