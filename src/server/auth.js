import { verifyToken as verifyClerkToken } from '@clerk/backend'
import { createDatabaseRepositories } from './database.js'

export const CLERK_AUTH_PROVIDER = 'clerk'

const MAX_AUTHORIZATION_LENGTH = 8192

function parseCommaSeparated(value) {
  if (typeof value !== 'string') return []
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))]
}

function parseAuthorizedParties(value) {
  return parseCommaSeparated(value).filter((party) => {
    if (party === '*' || party.length > 2048) return false
    try {
      const url = new URL(party)
      return ['http:', 'https:'].includes(url.protocol) && url.origin === party
    } catch {
      return false
    }
  })
}

function parseBearerToken(request) {
  const authorization = request.headers.get('Authorization')
  if (!authorization || authorization.length > MAX_AUTHORIZATION_LENGTH) return null
  return authorization.match(/^Bearer ([^\s]+)$/iu)?.[1] ?? null
}

function authFailure(status, code, message) {
  return { code, message, ok: false, status }
}

export function createClerkIdentityVerifier(options = {}) {
  const verifyToken = options.verifyToken ?? verifyClerkToken

  return async function verifyClerkIdentity(request, env = {}) {
    const token = parseBearerToken(request)
    if (!token) {
      return authFailure(
        401,
        'AUTHENTICATION_REQUIRED',
        'Bạn cần đăng nhập để tiếp tục.',
      )
    }

    const jwtKey = typeof env.CLERK_JWT_KEY === 'string'
      ? env.CLERK_JWT_KEY.trim().replaceAll('\\n', '\n')
      : ''
    const authorizedParties = parseAuthorizedParties(env.CLERK_AUTHORIZED_PARTIES)
    if (!jwtKey || authorizedParties.length === 0) {
      return authFailure(
        503,
        'AUTH_UNAVAILABLE',
        'Dịch vụ xác thực hiện chưa sẵn sàng.',
      )
    }

    const audiences = parseCommaSeparated(env.CLERK_JWT_AUDIENCE)

    try {
      const verifiedToken = await verifyToken(token, {
        authorizedParties,
        ...(audiences.length > 0 ? { audience: audiences } : {}),
        jwtKey,
      })
      const subject = typeof verifiedToken?.sub === 'string' ? verifiedToken.sub.trim() : ''
      if (!subject || subject.length > 255 || verifiedToken?.sts === 'pending') {
        return authFailure(
          401,
          'AUTHENTICATION_REQUIRED',
          'Bạn cần đăng nhập để tiếp tục.',
        )
      }

      return {
        identity: {
          provider: CLERK_AUTH_PROVIDER,
          subject,
        },
        ok: true,
      }
    } catch {
      return authFailure(
        401,
        'AUTHENTICATION_REQUIRED',
        'Bạn cần đăng nhập để tiếp tục.',
      )
    }
  }
}

export const verifyClerkIdentity = createClerkIdentityVerifier()

export async function requireAuthenticatedUser(request, env = {}, dependencies = {}) {
  const verifyIdentity = dependencies.verifyIdentity ?? verifyClerkIdentity
  const createRepositories = dependencies.createRepositories ?? createDatabaseRepositories

  const authentication = await verifyIdentity(request, env)
  if (!authentication.ok) {
    return {
      code: authentication.code,
      message: authentication.message,
      ok: false,
      status: authentication.status,
      user: null,
    }
  }

  const repositories = createRepositories(env)
  const user = await repositories.users.getOrCreateByIdentity(authentication.identity)
  if (user.status !== 'active') {
    return {
      code: 'ACCOUNT_UNAVAILABLE',
      message: 'Tài khoản hiện chưa thể sử dụng.',
      ok: false,
      status: 403,
      user: null,
    }
  }

  return {
    ok: true,
    user,
  }
}

export async function requireAdmin(request, env = {}, dependencies = {}) {
  const auth = await requireAuthenticatedUser(request, env, dependencies)
  if (!auth.ok) {
    return auth
  }

  if (auth.user.role !== 'admin') {
    return {
      code: 'FORBIDDEN',
      message: 'Bạn không có quyền truy cập tài nguyên này.',
      ok: false,
      status: 403,
      user: null,
    }
  }

  return {
    ok: true,
    user: auth.user,
  }
}
