import { createCatalogueRepository } from './repositories/catalogueRepository.js'
import { createUserRepository } from './repositories/userRepository.js'

export function getDatabaseBinding(env) {
  const db = env?.DB
  if (!db?.prepare || !db?.batch) {
    throw new Error('D1 binding DB is unavailable.')
  }
  return db
}

export function createDatabaseRepositories(env) {
  const db = getDatabaseBinding(env)
  return {
    catalogue: createCatalogueRepository(db),
    users: createUserRepository(db),
  }
}
