const ASSET_PATTERN = /\.(?:avif|gif|heic|jfif|jpe?g|mp4|png|svg|webp)$/iu

function toSourceReference(url) {
  const normalizedUrl = decodeURIComponent(url).replace(/\\/gu, '/')
  const assetMarker = '/src/assets/'
  const assetIndex = normalizedUrl.lastIndexOf(assetMarker)

  if (assetIndex < 0) {
    throw new Error(`Catalogue media must be located under src/assets: ${url}`)
  }

  return normalizedUrl.slice(assetIndex + 1)
}

export async function resolve(specifier, context, nextResolve) {
  if (ASSET_PATTERN.test(specifier)) {
    return {
      shortCircuit: true,
      url: new URL(specifier, context.parentURL).href,
    }
  }

  try {
    return await nextResolve(specifier, context)
  } catch (error) {
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[a-z0-9]+$/iu.test(specifier)) {
      return nextResolve(`${specifier}.js`, context)
    }
    throw error
  }
}

export async function load(url, context, nextLoad) {
  if (ASSET_PATTERN.test(url)) {
    return {
      format: 'module',
      shortCircuit: true,
      source: `export default ${JSON.stringify(toSourceReference(url))}`,
    }
  }

  return nextLoad(url, context)
}

