import { useEffect, useState } from 'react'
import { PublicCommerceContext } from './publicCommerceStore.js'
import { resolvePublicCommerceMode } from '../utils/publicCommerceMode.js'

export function PublicCommerceProvider({ children }) {
  const [state, setState] = useState({ mode: 'consultation', isLoading: true })
  useEffect(() => {
    const controller = new AbortController()
    let live = true
    fetch('/api/v1/public-commerce', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]), cache: 'no-store' })
      .then(async (response) => response.ok ? (await response.json()).data?.mode : null)
      .then((mode) => { if (live) setState({ mode: resolvePublicCommerceMode(mode), isLoading: false }) })
      .catch(() => { if (live) setState({ mode: 'consultation', isLoading: false }) })
    return () => { live = false; controller.abort() }
  }, [])
  return <PublicCommerceContext.Provider value={state}>{children}</PublicCommerceContext.Provider>
}
