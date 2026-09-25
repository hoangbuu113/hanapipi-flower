import { access, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { transformWithEsbuild } from 'vite'

const assetPattern = /\.(?:gif|jpe?g|jfif|mp4|png|svg|webm|webp)$/iu

export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@clerk/clerk-react') {
    return { shortCircuit: true, url: new URL('./mocks/clerkReact.js', import.meta.url).href }
  }
  if (assetPattern.test(specifier)) {
    return { shortCircuit: true, url: new URL(specifier, context.parentURL).href }
  }
  if (specifier.startsWith('.') && !/\.[a-z0-9]+$/iu.test(specifier)) {
    const jsxUrl = new URL(`${specifier}.jsx`, context.parentURL)
    try {
      await access(fileURLToPath(jsxUrl))
      return { shortCircuit: true, url: jsxUrl.href }
    } catch {
      // Let the existing asset loader resolve ordinary .js imports.
    }
  }
  try {
    return await nextResolve(specifier, context)
  } catch (error) {
    const extensionlessRelative = specifier.startsWith('.') && !/\.[a-z0-9]+$/iu.test(specifier)
    if (error?.code !== 'ERR_MODULE_NOT_FOUND' || !extensionlessRelative) throw error
    return nextResolve(`${specifier}.js`, context)
  }
}

export async function load(url, context, nextLoad) {
  if (assetPattern.test(url)) {
    return { format: 'module', shortCircuit: true, source: `export default ${JSON.stringify(url)};` }
  }
  if (url.endsWith('.css')) {
    return { format: 'module', shortCircuit: true, source: '' }
  }
  if (url.endsWith('.jsx')) {
    const source = await readFile(fileURLToPath(url), 'utf8')
    const result = await transformWithEsbuild(source, url, { loader: 'jsx', jsx: 'automatic' })
    return { format: 'module', shortCircuit: true, source: result.code }
  }
  return nextLoad(url, context)
}
