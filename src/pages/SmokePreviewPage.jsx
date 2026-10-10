import { useRef, useState } from 'react'
import { SMOKE_PREVIEW_SOURCES } from '../components/cinematic/smokePreviewConfig.js'
import '../components/cinematic/smoke-preview.css'

function PreviewPlayer({ source }) {
  const videoRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(true)
  const [status, setStatus] = useState('loading')
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackError, setPlaybackError] = useState('')
  const [autoplay] = useState(() => typeof window !== 'undefined' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

  async function play() {
    try {
      await videoRef.current.play()
      setPlaybackError('')
    } catch {
      setPlaybackError('Chưa phát được video. Bạn có thể bấm Phát để thử lại.')
    }
  }

  function restart() {
    const video = videoRef.current
    video.currentTime = 0
    setPosition(0)
    if (!video.paused) void play()
  }

  return <>
    <video ref={videoRef} data-source={source.id} src={source.src} muted playsInline autoPlay={autoplay} loop={loop} preload="auto"
      aria-label={source.label}
      onLoadedMetadata={event => setDuration(event.currentTarget.duration)}
      onCanPlay={() => setStatus('ready')}
      onWaiting={() => setStatus('loading')}
      onPlaying={() => setStatus('ready')}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
      onTimeUpdate={event => setPosition(event.currentTarget.currentTime)}
      onError={() => { setStatus('error'); setPlaying(false) }} />
    {status === 'loading' && <p className="smoke-preview-status" role="status">Đang tải preview…</p>}
    {status === 'error' && <div className="smoke-preview-status" role="alert">
      <p>Không tải được preview này.</p>
      <button type="button" onClick={() => { setStatus('loading'); videoRef.current.load() }}>Thử lại</button>
    </div>}
    <section className="smoke-preview-controls" aria-label="Điều khiển preview">
      <p className="smoke-preview-source">{source.label}</p>
      <p className="smoke-preview-note">{source.detail}</p>
      <div className="smoke-preview-playback">
        <button type="button" data-action="play" disabled={status === 'error' || !duration}
          onClick={() => playing ? videoRef.current.pause() : void play()}>{playing ? 'Tạm dừng' : 'Phát'}</button>
        <button type="button" data-action="restart" disabled={status === 'error' || !duration} onClick={restart}>Xem từ đầu</button>
        <button type="button" data-action="loop" aria-pressed={loop} onClick={() => setLoop(value => !value)}>Lặp</button>
        <output aria-label="Thời gian video">{position.toFixed(2)} / {duration.toFixed(2)}s</output>
      </div>
      {playbackError && <p role="alert">{playbackError}</p>}
    </section>
  </>
}

export default function SmokePreviewPage() {
  const [selected, setSelected] = useState('h-final')
  const source = SMOKE_PREVIEW_SOURCES.find(item => item.id === selected)
  return <main className="smoke-preview-stage" data-smoke-preview="dev-only">
    <PreviewPlayer key={source.id} source={source} />
    <header className="smoke-preview-header">
      <a href="/">Hanapipi Flower</a>
      <span>SMOKE · DEV PREVIEW</span>
      <a href="/cinematic-lab">Về cinematic</a>
    </header>
    <nav className="smoke-preview-sources" aria-label="Chọn nguồn preview">
      {SMOKE_PREVIEW_SOURCES.map(item => <button type="button" key={item.id} data-source={item.id}
        aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}>{item.name}</button>)}
    </nav>
  </main>
}
