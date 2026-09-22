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

export async function createOrder({ getToken, order, fetchImpl = globalThis.fetch } = {}) {
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
    }
  }

  if (!token) {
    return {
      error: { code: 'AUTHENTICATION_REQUIRED', message: 'Bạn cần đăng nhập để tiếp tục đặt hoa.' },
      ok: false,
      status: 401,
    }
  }

  try {
    const response = await fetchImpl('/api/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(order),
    })

    let body = null
    try {
      body = await response.json()
    } catch {
      // Non-JSON response
    }

    if (!response.ok) {
      return {
        error: body?.error ?? { code: 'API_ERROR', message: 'Không thể tạo đơn hoa.' },
        ok: false,
        status: response.status,
      }
    }

    return {
      error: null,
      ok: true,
      order: body?.data?.order ?? null,
      status: response.status,
    }
  } catch {
    return {
      error: { code: 'NETWORK_ERROR', message: 'Không thể kết nối đến máy chủ.' },
      ok: false,
      status: 0,
    }
  }
}

export async function fetchUserOrders({ getToken, fetchImpl = globalThis.fetch } = {}) {
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
      orders: [],
      status: 401,
    }
  }

  if (!token) {
    return {
      error: { code: 'AUTHENTICATION_REQUIRED', message: 'Bạn cần đăng nhập để xem danh sách đơn hoa.' },
      ok: false,
      orders: [],
      status: 401,
    }
  }

  try {
    const response = await fetchImpl('/api/v1/orders', {
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
        error: body?.error ?? { code: 'API_ERROR', message: 'Không thể tải danh sách đơn hoa.' },
        ok: false,
        orders: [],
        status: response.status,
      }
    }

    return {
      error: null,
      ok: true,
      orders: body?.data?.orders ?? body?.data?.items ?? [],
      status: response.status,
    }
  } catch {
    return {
      error: { code: 'NETWORK_ERROR', message: 'Không thể kết nối đến máy chủ.' },
      ok: false,
      orders: [],
      status: 0,
    }
  }
}

export async function fetchUserOrderDetail(idOrCode, { getToken, fetchImpl = globalThis.fetch } = {}) {
  if (!idOrCode || typeof idOrCode !== 'string') {
    throw new TypeError('An order ID or order code is required.')
  }
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
      order: null,
      status: 401,
    }
  }

  if (!token) {
    return {
      error: { code: 'AUTHENTICATION_REQUIRED', message: 'Bạn cần đăng nhập để xem thông tin đơn hoa.' },
      ok: false,
      order: null,
      status: 401,
    }
  }

  try {
    const response = await fetchImpl(`/api/v1/orders/${encodeURIComponent(idOrCode)}`, {
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
        error: body?.error ?? { code: 'API_ERROR', message: 'Không thể tải thông tin đơn hoa.' },
        ok: false,
        order: null,
        status: response.status,
      }
    }

    return {
      error: null,
      ok: true,
      order: body?.data?.order ?? null,
      status: response.status,
    }
  } catch {
    return {
      error: { code: 'NETWORK_ERROR', message: 'Không thể kết nối đến máy chủ.' },
      ok: false,
      order: null,
      status: 0,
    }
  }
}

export {
  fetchProductDetail,
  fetchShopCatalogue,
  normalizeCatalogueProduct,
} from './catalogueClient.js'

