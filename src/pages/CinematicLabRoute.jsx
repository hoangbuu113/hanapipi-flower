import { lazy } from 'react'
import { useLocation } from 'react-router-dom'
import { smokePreviewRequested } from '../components/cinematic/smokePreviewConfig.js'

const CinematicLabPage = lazy(() => import('./CinematicLabPage.jsx'))
const SmokePreviewPage = import.meta.env.DEV ? lazy(() => import('./SmokePreviewPage.jsx')) : null

const SmokeInspect = import.meta.env.DEV ? lazy(() => import('../../qa/cinematic-smoke-forensics/SmokeInspect.jsx')) : null

export default function CinematicLabRoute() {
  const { search } = useLocation()
  if (import.meta.env.DEV && new URLSearchParams(search).get('smokeInspect') === '1') return <SmokeInspect />
  return smokePreviewRequested(Boolean(import.meta.env.DEV), search)
    ? <SmokePreviewPage />
    : <CinematicLabPage />
}
