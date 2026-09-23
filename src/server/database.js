import { createCatalogueRepository } from './repositories/catalogueRepository.js'
import { createOrderRepository } from './repositories/orderRepository.js'
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
  const catalogue = createCatalogueRepository(db)
  return {
    catalogue,
    orders: createOrderRepository(db, {
      bankConfig: {
        accountName: env?.BANK_TRANSFER_ACCOUNT_NAME,
        accountNumber: env?.BANK_TRANSFER_ACCOUNT_NUMBER,
        bankBin: env?.BANK_TRANSFER_BIN,
        bankCode: env?.BANK_TRANSFER_BANK_CODE,
        bankName: env?.BANK_TRANSFER_BANK_NAME,
      },
      catalogue,
      fulfilmentKey: env?.ORDER_FULFILMENT_KEY,
    }),
    users: createUserRepository(db),
  }
}
