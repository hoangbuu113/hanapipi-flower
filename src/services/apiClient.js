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

export async function createOrder({ getToken, order, idempotencyKey, requireAuth = false, fetchImpl = globalThis.fetch } = {}) {
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

  if (requireAuth && !token) {
    return {
      error: { code: 'AUTHENTICATION_REQUIRED', message: 'Bạn cần đăng nhập để tiếp tục đặt hoa.' },
      ok: false,
      status: 401,
    }
  }

  if (typeof idempotencyKey !== 'string') {
    return { error: { code: 'INVALID_IDEMPOTENCY_KEY', message: 'Chưa thể chuẩn bị yêu cầu đặt hoa. Vui lòng thử lại.' }, ok: false, status: 400 }
  }

  try {
    const response = await fetchImpl('/api/v1/orders', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

export async function fetchGuestOrderDetail(idOrCode, { guestToken, fetchImpl = globalThis.fetch } = {}) {
  if (!idOrCode || typeof idOrCode !== 'string') throw new TypeError('An order ID or code is required.')
  try {
    const response = await fetchImpl(`/api/v1/orders/${encodeURIComponent(idOrCode)}`, {
      credentials: 'same-origin',
      headers: guestToken ? { 'X-Guest-Order-Token': guestToken } : {},
    })
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      return { error: body?.error ?? { code: 'API_ERROR', message: 'Không thể tải đơn hoa.' }, ok: false, order: null, status: response.status }
    }
    return { error: null, ok: true, order: body?.data?.order ?? null, status: response.status }
  } catch {
    return { error: { code: 'NETWORK_ERROR', message: 'Không thể kết nối đến máy chủ.' }, ok: false, order: null, status: 0 }
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

export async function fetchUserAddresses({ getToken, fetchImpl = globalThis.fetch } = {}) {
  if (typeof getToken !== 'function') {
    throw new TypeError('A token getter function is required.')
  }

  let token = null
  try {
    token = await getToken()
  } catch {
    return {
      addresses: [],
      error: { code: 'TOKEN_ERROR', message: 'Không thể xác thực phiên làm việc.' },
      ok: false,
      status: 401,
    }
  }

  if (!token) {
    return {
      addresses: [],
      error: { code: 'AUTHENTICATION_REQUIRED', message: 'Bạn cần đăng nhập để xem sổ địa chỉ.' },
      ok: false,
      status: 401,
    }
  }

  try {
    const response = await fetchImpl('/api/v1/addresses', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(10000),
    })

    let body = null
    try {
      body = await response.json()
    } catch {
      // Non-JSON response
    }

    if (!response.ok) {
      return {
        addresses: [],
        error: body?.error ?? { code: 'API_ERROR', message: 'Không thể tải sổ địa chỉ.' },
        ok: false,
        status: response.status,
      }
    }

    return {
      addresses: body?.data?.addresses ?? body?.data?.items ?? [],
      error: null,
      ok: true,
      status: response.status,
    }
  } catch (error) {
    return {
      addresses: [],
      error: error?.name === 'TimeoutError' || error?.name === 'AbortError'
        ? { code: 'ADDRESS_TIMEOUT', message: 'Tải sổ địa chỉ quá lâu. Vui lòng thử lại.' }
        : { code: 'NETWORK_ERROR', message: 'Không thể kết nối đến máy chủ.' },
      ok: false,
      status: 0,
    }
  }
}

export async function createUserAddress({ getToken, address, fetchImpl = globalThis.fetch } = {}) {
  if (typeof getToken !== 'function') {
    throw new TypeError('A token getter function is required.')
  }

  let token = null
  try {
    token = await getToken()
  } catch {
    return {
      address: null,
      error: { code: 'TOKEN_ERROR', message: 'Không thể xác thực phiên làm việc.' },
      ok: false,
      status: 401,
    }
  }

  if (!token) {
    return {
      address: null,
      error: { code: 'AUTHENTICATION_REQUIRED', message: 'Bạn cần đăng nhập để lưu địa chỉ.' },
      ok: false,
      status: 401,
    }
  }

  try {
    const response = await fetchImpl('/api/v1/addresses', {
      body: JSON.stringify(address),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })

    let body = null
    try {
      body = await response.json()
    } catch {
      // Non-JSON response
    }

    if (!response.ok) {
      return {
        address: null,
        error: body?.error ?? { code: 'API_ERROR', message: 'Không thể tạo địa chỉ mới.' },
        ok: false,
        status: response.status,
      }
    }

    return {
      address: body?.data?.address ?? null,
      error: null,
      ok: true,
      status: response.status,
    }
  } catch {
    return {
      address: null,
      error: { code: 'NETWORK_ERROR', message: 'Không thể kết nối đến máy chủ.' },
      ok: false,
      status: 0,
    }
  }
}

export async function updateUserAddress({ getToken, id, address, fetchImpl = globalThis.fetch } = {}) {
  if (typeof getToken !== 'function') {
    throw new TypeError('A token getter function is required.')
  }

  let token = null
  try {
    token = await getToken()
  } catch {
    return {
      address: null,
      error: { code: 'TOKEN_ERROR', message: 'Không thể xác thực phiên làm việc.' },
      ok: false,
      status: 401,
    }
  }

  if (!token) {
    return {
      address: null,
      error: { code: 'AUTHENTICATION_REQUIRED', message: 'Bạn cần đăng nhập để cập nhật địa chỉ.' },
      ok: false,
      status: 401,
    }
  }

  try {
    const response = await fetchImpl(`/api/v1/addresses/${encodeURIComponent(id)}`, {
      body: JSON.stringify(address),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'PATCH',
    })

    let body = null
    try {
      body = await response.json()
    } catch {
      // Non-JSON response
    }

    if (!response.ok) {
      return {
        address: null,
        error: body?.error ?? { code: 'API_ERROR', message: 'Không thể cập nhật địa chỉ.' },
        ok: false,
        status: response.status,
      }
    }

    return {
      address: body?.data?.address ?? null,
      error: null,
      ok: true,
      status: response.status,
    }
  } catch {
    return {
      address: null,
      error: { code: 'NETWORK_ERROR', message: 'Không thể kết nối đến máy chủ.' },
      ok: false,
      status: 0,
    }
  }
}

export async function deleteUserAddress({ getToken, id, fetchImpl = globalThis.fetch } = {}) {
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
      error: { code: 'AUTHENTICATION_REQUIRED', message: 'Bạn cần đăng nhập để xóa địa chỉ.' },
      ok: false,
      status: 401,
    }
  }

  try {
    const response = await fetchImpl(`/api/v1/addresses/${encodeURIComponent(id)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      method: 'DELETE',
    })

    let body = null
    try {
      body = await response.json()
    } catch {
      // Non-JSON response
    }

    if (!response.ok) {
      return {
        error: body?.error ?? { code: 'API_ERROR', message: 'Không thể xóa địa chỉ.' },
        ok: false,
        status: response.status,
      }
    }

    return {
      error: null,
      id: body?.data?.id ?? id,
      ok: true,
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

export async function setDefaultUserAddress({ getToken, id, fetchImpl = globalThis.fetch } = {}) {
  if (typeof getToken !== 'function') {
    throw new TypeError('A token getter function is required.')
  }

  let token = null
  try {
    token = await getToken()
  } catch {
    return {
      address: null,
      error: { code: 'TOKEN_ERROR', message: 'Không thể xác thực phiên làm việc.' },
      ok: false,
      status: 401,
    }
  }

  if (!token) {
    return {
      address: null,
      error: { code: 'AUTHENTICATION_REQUIRED', message: 'Bạn cần đăng nhập để đặt địa chỉ mặc định.' },
      ok: false,
      status: 401,
    }
  }

  try {
    const response = await fetchImpl(`/api/v1/addresses/${encodeURIComponent(id)}/default`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      method: 'POST',
    })

    let body = null
    try {
      body = await response.json()
    } catch {
      // Non-JSON response
    }

    if (!response.ok) {
      return {
        address: null,
        error: body?.error ?? { code: 'API_ERROR', message: 'Không thể đặt địa chỉ mặc định.' },
        ok: false,
        status: response.status,
      }
    }

    return {
      address: body?.data?.address ?? null,
      error: null,
      ok: true,
      status: response.status,
    }
  } catch {
    return {
      address: null,
      error: { code: 'NETWORK_ERROR', message: 'Không thể kết nối đến máy chủ.' },
      ok: false,
      status: 0,
    }
  }
}

export {
  fetchProductDetail,
  fetchShopCatalogue,
  normalizeCatalogueProduct,
} from './catalogueClient.js'
