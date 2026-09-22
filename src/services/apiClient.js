export async function fetchCurrentUser({ getToken, fetchImpl = globalThis.fetch } = {}) {
  if (typeof getToken !== 'function') {
    throw new TypeError('A token getter function is required.')
  }

  let token = null
  try {
    token = await getToken()
  } catch {
    return {
      error: { code: 'TOKEN_ERROR', message: 'Không thể xác thực phiên làm việc.' },
      ok: false,
      status: 401,
      user: null,
    }
  }

  if (!token) {
    return {
      error: { code: 'AUTHENTICATION_REQUIRED', message: 'Bạn cần đăng nhập để tiếp tục.' },
      ok: false,
      status: 401,
      user: null,
    }
  }

  try {
    const response = await fetchImpl('/api/v1/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    let body = null
    try {
      body = await response.json()
    } catch {
      // Non-JSON response
    }

    if (!response.ok) {
      return {
        error: body?.error ?? { code: 'API_ERROR', message: 'Không thể tải thông tin tài khoản.' },
        ok: false,
        status: response.status,
        user: null,
      }
    }

    return {
      error: null,
      ok: true,
      status: response.status,
      user: body?.data?.user ?? null,
    }
  } catch {
    return {
      error: { code: 'NETWORK_ERROR', message: 'Không thể kết nối đến máy chủ.' },
      ok: false,
      status: 0,
      user: null,
    }
  }
}

export {
  fetchProductDetail,
  fetchShopCatalogue,
  normalizeCatalogueProduct,
} from './catalogueClient.js'

