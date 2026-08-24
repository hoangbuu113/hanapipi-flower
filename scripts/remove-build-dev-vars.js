import { copyFile, lstat, mkdir, readdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputRoot = path.resolve(projectRoot, 'dist', 'server')
const outputPrefix = `${outputRoot}${path.sep}`

let entries = []
try {
  entries = await readdir(outputRoot)
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}

for (const entry of entries) {
  if (!/^\.dev\.vars(?:\..+)?$/u.test(entry)) continue

  const target = path.resolve(outputRoot, entry)
  if (!target.startsWith(outputPrefix)) {
    throw new Error('Refusing to clean a file outside the Worker build directory.')
  }

  const stats = await lstat(target)
  if (stats.isDirectory()) {
    throw new Error('Refusing to remove a directory while cleaning Worker build output.')
  }

  await unlink(target)
  process.stdout.write('Removed generated local secret file from Worker build output.\n')
}

const migrationSource = path.resolve(projectRoot, 'drizzle')
const migrationOutput = path.resolve(projectRoot, 'dist', '.openai', 'drizzle')
const migrationOutputPrefix = `${path.resolve(projectRoot, 'dist')}${path.sep}`
if (!migrationOutput.startsWith(migrationOutputPrefix)) {
  throw new Error('Refusing to package migrations outside the build directory.')
}

const migrationFiles = (await readdir(migrationSource))
  .filter((entry) => /^\d+_.+\.sql$/u.test(entry))
  .sort()
if (migrationFiles.length === 0) {
  throw new Error('No D1 migration files were found for deployment packaging.')
}

await mkdir(migrationOutput, { recursive: true })
for (const migrationFile of migrationFiles) {
  await copyFile(
    path.resolve(migrationSource, migrationFile),
    path.resolve(migrationOutput, migrationFile),
  )
}
process.stdout.write(`Packaged ${migrationFiles.length} D1 migration files.\n`)
