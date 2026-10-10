import worker from './worker.js'
const prefix = 'cinemalab-preview/20261010-a8ae71e/'
const names = new Set(['sequence-rife48-1080p-gop4.mp4', 'sequence-rife48-1080p-gop4-reverse.mp4', 'sequence-rife48-1440p-gop4.mp4', 'sequence-rife48-1440p-gop4-reverse.mp4'])
export default {
  async fetch(request, env, context) {
    const pathname = new URL(request.url).pathname
    const name = pathname.replace('/media/hutflower/scroll-sequence-video/', '')
    if (pathname !== '/media/hutflower/scroll-sequence-video/' + name || !names.has(name)) {
      const response = await worker.fetch(request, env, context)
      if (pathname.startsWith('/api/')) return response
      // Existing cinematic SVG masks use image data URLs. Scope this exception
      // to static responses of this preview wrapper; script policy stays intact.
      const headers = new Headers(response.headers)
      const csp = headers.get('Content-Security-Policy')
      if (csp) headers.set('Content-Security-Policy', csp.replace(/img-src([^;]*)/u, (directive) => directive + ' data:'))
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
    }
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 })
    const key = prefix + name
    const meta = await env.MEDIA_BUCKET.head(key)
    if (!meta) return new Response('Missing preview media', { status: 404 })
    const headers = new Headers({ 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=31536000, immutable', 'ETag': meta.httpEtag })
    let start = 0, end = meta.size - 1, partial = false
    const range = request.headers.get('Range')
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${meta.size}` } })
      start = match[1] ? Number(match[1]) : Math.max(0, meta.size - Number(match[2]))
      end = match[1] && match[2] ? Math.min(Number(match[2]), meta.size - 1) : meta.size - 1
      if (start > end || start >= meta.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${meta.size}` } })
      partial = true
      headers.set('Content-Range', `bytes ${start}-${end}/${meta.size}`)
    }
    headers.set('Content-Length', String(end - start + 1))
    const object = request.method === 'HEAD' ? null : await env.MEDIA_BUCKET.get(key, partial ? { range: { offset: start, length: end - start + 1 } } : {})
    return new Response(object?.body ?? null, { status: partial ? 206 : 200, headers })
  },
}
