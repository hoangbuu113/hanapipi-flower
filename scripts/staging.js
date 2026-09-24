import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyStagingBuild } from './verify-staging-build.js'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const npmCommand = process.env.npm_execpath
  ? process.execPath
  : process.platform === 'win32' ? 'npm.cmd' : 'npm'
const npmPrefix = process.env.npm_execpath ? [process.env.npm_execpath] : []
const wranglerCli = path.resolve(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    ...(command.endsWith('.cmd') ? { shell: true } : {}),
    ...options,
  })

  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with code ${result.status ?? 1}`)
  }
}

async function buildStaging() {
  // Vite's default build mode is production, which loads .env.production.local.
  // The staging Worker must instead load the Clerk TEST publishable key.
  run(npmCommand, [...npmPrefix, 'run', 'build', '--', '--mode', 'staging'], {
    env: { ...process.env, CLOUDFLARE_ENV: 'staging' },
  })
  return verifyStagingBuild()
}

async function deployStaging() {
  run(npmCommand, [...npmPrefix, 'run', 'build:staging'], {
    env: { ...process.env, CLOUDFLARE_ENV: 'staging' },
  })
  const verified = await verifyStagingBuild()
  const deployEnv = { ...process.env }
  // CLOUDFLARE_ENV selects a Wrangler environment at deploy time. The generated
  // snapshot already contains the resolved staging target, so do not re-select it.
  delete deployEnv.CLOUDFLARE_ENV

  run(process.execPath, [wranglerCli, 'deploy', '--config', path.relative(projectRoot, verified.configPath)], {
    env: deployEnv,
  })
}

const mode = process.argv[2]

try {
  if (mode === 'build') {
    const result = await buildStaging()
    process.stdout.write(`Staging Worker: ${result.worker}\n`)
    process.stdout.write(`Staging D1: ${result.d1}\n`)
    process.stdout.write(`Staging R2: ${result.r2}\n`)
    process.stdout.write(`Staging API_V1_ENABLED: ${result.apiV1Enabled}\n`)
  } else if (mode === 'deploy') {
    await deployStaging()
  } else {
    throw new Error('Usage: node scripts/staging.js <build|deploy>')
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
}
