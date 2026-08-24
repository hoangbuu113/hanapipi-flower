const assetPattern = /\.(?:gif|jpe?g|jfif|mp4|png|svg|webm|webp)$/iu

export async function resolve(specifier, context, nextResolve) {
  if (assetPattern.test(specifier)) {
    return {
      shortCircuit: true,
      url: new URL(specifier, context.parentURL).href,
    }
  }

  try {
    return await nextResolve(specifier, context)
  } catch (error) {
    const isRelativeWithoutExtension = specifier.startsWith('.')
      && !/\.[a-z0-9]+$/iu.test(specifier)
    if (error?.code !== 'ERR_MODULE_NOT_FOUND' || !isRelativeWithoutExtension) throw error
    return nextResolve(`${specifier}.js`, context)
  }
}

export async function load(url, context, nextLoad) {
  if (assetPattern.test(url)) {
    return {
      format: 'module',
      shortCircuit: true,
      source: `export default ${JSON.stringify(url)};`,
    }
  }
  return nextLoad(url, context)
}
