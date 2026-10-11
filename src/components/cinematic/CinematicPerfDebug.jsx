import { useLayoutEffect, useRef } from 'react'
import { createCinematicPerf } from './cinematicPerf.js'

export default function CinematicPerfDebug({ region, channelRef }) {
  const output = useRef(null), runtime = useRef(null)
  useLayoutEffect(() => {
    const perf = createCinematicPerf(window, () => region.current); runtime.current = perf; perf.registerController(channelRef?.current)
    const timer = setInterval(() => { if (output.current) output.current.textContent = perf.display() }, 250)
    return () => { clearInterval(timer); perf.dispose(); runtime.current = null }
  }, [region, channelRef])
  const download = () => { const url = URL.createObjectURL(new Blob([JSON.stringify(runtime.current.snapshot(), null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'cinematic-perf.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
  return <aside style={{ position: 'absolute', right: 16, bottom: 16, zIndex: 7, background: 'rgba(20,18,16,.85)', color: '#fff', padding: 8, font: '10px/1.5 monospace', maxWidth: 'calc(100% - 32px)' }}><output ref={output} style={{ whiteSpace: 'pre-wrap' }} /><button type="button" onClick={download} style={{ display: 'block', font: 'inherit' }}>Tải log hiệu năng</button></aside>
}
