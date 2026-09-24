import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const configPath = path.resolve(projectRoot, 'dist', 'server', 'wrangler.json')

const expected = {
  apiV1Enabled: 'true',
  name: 'hanapipi-flower',
  d1: 'hanapipi-flower-staging',
  r2: 'hanapipi-media-staging',
}

export function validateStagingClientBundle(scripts, publishableKey) {
  if (!publishableKey?.startsWith('pk_test_')) {
    throw new Error('Staging requires a Clerk TEST publishable key.')
  }
  if (!scripts.some((script) => script.includes(publishableKey))) {
    throw new Error('Staging client bundle does not contain the configured Clerk TEST key.')
  }
  if (scripts.some((script) => /pk_live_[A-Za-z0-9_-]{20,}/u.test(script))) {
    throw new Error('Staging client bundle contains a Clerk production publishable key.')
  }
}

export async function verifyStagingBuild() {
  let rawConfig
  try {
    rawConfig = await readFile(configPath, 'utf8')
  } catch (error) {
    throw new Error(`Staging build artifact is missing: ${configPath}`, { cause: error })
  }

  let config
  try {
    config = JSON.parse(rawConfig)
  } catch (error) {
    throw new Error(`Staging build artifact is not valid JSON: ${configPath}`, { cause: error })
  }

  const d1 = Array.isArray(config.d1_databases)
    ? config.d1_databases.find((binding) => binding?.binding === 'DB')
    : undefined
  const r2 = Array.isArray(config.r2_buckets)
    ? config.r2_buckets.find((binding) => binding?.binding === 'MEDIA_BUCKET')
    : undefined
  const mismatches = []

  if (config.name !== expected.name) {
    mismatches.push(`Worker name is ${JSON.stringify(config.name)}, expected ${JSON.stringify(expected.name)}`)
  }
  if (d1?.database_name !== expected.d1) {
    mismatches.push(`D1 DB is ${JSON.stringify(d1?.database_name)}, expected ${JSON.stringify(expected.d1)}`)
  }
  if (r2?.bucket_name !== expected.r2) {
    mismatches.push(`R2 MEDIA_BUCKET is ${JSON.stringify(r2?.bucket_name)}, expected ${JSON.stringify(expected.r2)}`)
  }
  if (config.vars?.API_V1_ENABLED !== expected.apiV1Enabled) {
    mismatches.push(`API_V1_ENABLED is ${JSON.stringify(config.vars?.API_V1_ENABLED)}, expected ${JSON.stringify(expected.apiV1Enabled)}`)
  }

  if (mismatches.length > 0) {
    throw new Error(`Staging build verification failed:\n- ${mismatches.join('\n- ')}`)
  }

  const clientAssetsPath = path.resolve(projectRoot, 'dist', 'client', 'assets')
  const clientScripts = (await readdir(clientAssetsPath))
    .filter((entry) => entry.endsWith('.js'))
  const scriptContents = await Promise.all(clientScripts.map((entry) =>
    readFile(path.resolve(clientAssetsPath, entry), 'utf8')))
  const publishableKey = loadEnv('staging', projectRoot, 'VITE_').VITE_CLERK_PUBLISHABLE_KEY
  validateStagingClientBundle(scriptContents, publishableKey)

  return {
    configPath,
    worker: config.name,
    d1: d1.database_name,
    r2: r2.bucket_name,
    apiV1Enabled: config.vars.API_V1_ENABLED,
  }
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  try {
    const result = await verifyStagingBuild()
    process.stdout.write(`Staging Worker: ${result.worker}\n`)
    process.stdout.write(`Staging D1: ${result.d1}\n`)
    process.stdout.write(`Staging R2: ${result.r2}\n`)
    process.stdout.write(`Staging API_V1_ENABLED: ${result.apiV1Enabled}\n`)
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
