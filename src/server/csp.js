// Public build configuration, identical to the key used by src/main.jsx.
// No provider secret or request-supplied origin is used to construct this policy.
const buildPublishableKey = typeof import.meta.env === 'object'
  ? import.meta.env.VITE_CLERK_PUBLISHABLE_KEY : undefined

export function getClerkFrontendOrigin(publishableKey) {
  if (typeof publishableKey !== 'string' || !/^pk_(?:test|live)_[A-Za-z0-9+/=_-]+$/u.test(publishableKey)) return null
  try {
    const host = atob(publishableKey.slice(8))
    if (!host.endsWith('$')) return null
    const hostname = host.slice(0, -1)
    if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9-]+$/iu.test(hostname)) return null
    return new URL(`https://${hostname}`).origin
  } catch {
    return null
  }
}

export function createReportOnlyPolicy(publishableKey = buildPublishableKey) {
  const clerk = getClerkFrontendOrigin(publishableKey)
  const clerkSource = clerk ? [clerk] : []
  const directives = {
    'default-src': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
    'script-src': ["'self'", ...clerkSource, 'https://challenges.cloudflare.com'],
    // Existing React style props and Clerk runtime CSS require inline styles.
    // This does NOT authorize inline scripts or eval. See docs/csp-report-only.md.
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'img-src': ["'self'", 'blob:', 'https://img.clerk.com'],
    'media-src': ["'self'"],
    'font-src': ["'self'", 'https://fonts.gstatic.com'],
    'connect-src': ["'self'", ...clerkSource, 'https://clerk-telemetry.com',
      'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
    'frame-src': ["'self'", ...clerkSource, 'https://challenges.cloudflare.com'],
    'worker-src': ["'self'", 'blob:'],
  }
  return Object.entries(directives).map(([name, sources]) => `${name} ${sources.join(' ')}`).join('; ')
}

export const REPORT_ONLY_POLICY = createReportOnlyPolicy()
