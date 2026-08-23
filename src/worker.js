const isNavigationRequest = (request, url) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return false
  }

  const accept = request.headers.get('accept') ?? ''
  const lastSegment = url.pathname.split('/').pop() ?? ''

  return accept.includes('text/html') || !lastSegment.includes('.')
}

export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request)

    if (response.status !== 404) {
      return response
    }

    const url = new URL(request.url)

    if (!isNavigationRequest(request, url)) {
      return response
    }

    url.pathname = '/index.html'
    return env.ASSETS.fetch(new Request(url, request))
  },
}
