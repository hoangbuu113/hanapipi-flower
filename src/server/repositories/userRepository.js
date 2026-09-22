const USER_SELECT = `
  SELECT
    id, role, display_name, locale, status, created_at_utc, updated_at_utc
  FROM users
`

function createUserId() {
  return `usr_${globalThis.crypto.randomUUID().replaceAll('-', '')}`
}

function mapUser(row) {
  if (!row) return null
  return {
    createdAtUtc: row.created_at_utc,
    displayName: row.display_name,
    id: row.id,
    locale: row.locale,
    role: row.role,
    status: row.status,
    updatedAtUtc: row.updated_at_utc,
  }
}

function assertIdentity(identity) {
  if (identity?.provider !== 'clerk') throw new TypeError('Unsupported auth provider.')
  if (typeof identity.subject !== 'string'
    || identity.subject.length === 0
    || identity.subject.length > 255) {
    throw new TypeError('A valid provider subject is required.')
  }
}

export function createUserRepository(db, options = {}) {
  if (!db?.prepare) throw new TypeError('A D1-compatible database binding is required.')

  const generateId = options.generateId ?? createUserId
  const now = options.now ?? (() => new Date().toISOString())

  return {
    async getOrCreateByIdentity(identity) {
      assertIdentity(identity)

      const timestamp = now()
      await db.prepare(`
        INSERT INTO users (
          id, auth_provider, provider_subject, role, display_name,
          phone_ciphertext, phone_key_version, locale, status,
          created_at_utc, updated_at_utc, deleted_at_utc
        ) VALUES (?, ?, ?, 'customer', NULL, NULL, NULL, 'vi-VN', 'active', ?, ?, NULL)
        ON CONFLICT(auth_provider, provider_subject) DO NOTHING
      `).bind(
        generateId(),
        identity.provider,
        identity.subject,
        timestamp,
        timestamp,
      ).run()

      const user = await db.prepare(`
        ${USER_SELECT}
        WHERE auth_provider = ? AND provider_subject = ?
        LIMIT 1
      `).bind(identity.provider, identity.subject).first()

      if (!user) throw new Error('Verified identity could not be mapped to a user.')
      return mapUser(user)
    },
  }
}
