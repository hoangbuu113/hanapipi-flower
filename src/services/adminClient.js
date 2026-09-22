export async function checkAdminAccess({
  getToken,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof getToken !== 'function') {
    throw new TypeError('A token getter function is required.')
  }

  let token = null
  try {
    token = await getToken()
  } catch {
    return {
      authorized: false,
      error: { code: 'TOKEN_ERROR', message: 'Không thể xác thực phiên làm việc.' },
      ok: false,
      status: 401,
      user: null,
    }
  }

  if (!token) {
    return {
      authorized: false,
      error: { code: 'AUTHENTICATION_REQUIRED', message: 'Bạn cần đăng nhập để tiếp tục.' },
      ok: false,
      status: 401,
      user: null,
    }
  }

  try {
    const response = await fetchImpl('/api/v1/admin/me', {
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
        authorized: false,
        error: body?.error ?? {
          code: 'API_ERROR',
          message: 'Không thể kiểm tra quyền quản trị.',
        },
        ok: false,
        status: response.status,
        user: null,
      }
    }

    const isAuthorized = body?.data?.authorized === true && body?.data?.user?.role === 'admin'

    return {
      authorized: isAuthorized,
      error: isAuthorized ? null : {
        code: 'FORBIDDEN',
        message: 'Bạn không có quyền truy cập tài nguyên này.',
      },
      ok: isAuthorized,
      status: response.status,
      user: body?.data?.user ?? null,
    }
  } catch {
    return {
      authorized: false,
      error: { code: 'NETWORK_ERROR', message: 'Không thể kết nối đến máy chủ.' },
      ok: false,
      status: 0,
      user: null,
    }
  }
}

export async function fetchAdminCatalogue({
  fetchImpl = globalThis.fetch,
  signal,
  endpoint = '/api/v1/catalogue/products?limit=50',
} = {}) {
  try {
    const response = await fetchImpl(endpoint, {
      headers: {
        Accept: 'application/json',
      },
      signal,
    })

    let body = null
    try {
      body = await response.json()
    } catch {
      // Non-JSON response
    }

    // Admin catalogue strictly requires D1 API and does NOT use static fallback
    if (!response.ok) {
      return {
        data: null,
        error: body?.error ?? {
          code: 'API_ERROR',
          message: 'Không thể tải danh mục sản phẩm từ máy chủ.',
        },
        ok: false,
        status: response.status,
        total: 0,
      }
    }

    const rawProducts = body?.data?.items ?? body?.data?.products
    if (!Array.isArray(rawProducts)) {
      return {
        data: null,
        error: {
          code: 'MALFORMED_RESPONSE',
          message: 'Dữ liệu danh mục sản phẩm không hợp lệ.',
        },
        ok: false,
        status: response.status,
        total: 0,
      }
    }

    const products = rawProducts.map((p) => {
      const price = p.priceVnd !== undefined ? p.priceVnd : p.price ?? null
      const purchaseType = p.purchaseType ?? (price == null ? 'priceless' : 'standard')
      const isPurchasable = p.isPurchasable ?? (purchaseType !== 'priceless' && Number.isFinite(price))

      return {
        active: p.active !== false,
        badges: Array.isArray(p.badges) ? p.badges : [],
        collection: p.collection ?? null,
        description: p.description ?? '',
        id: p.id,
        isBestSeller: Boolean(p.isBestSeller),
        isPurchasable,
        media: Array.isArray(p.media) ? p.media : [],
        name: p.name,
        priceVnd: price,
        purchaseType,
        shortDescription: p.shortDescription ?? '',
        slug: p.slug ?? p.id,
        sortOrder: p.sortOrder ?? 0,
        status: p.status ?? 'available',
      }
    })

    return {
      data: products,
      error: null,
      ok: true,
      status: response.status,
      total: body?.data?.total ?? products.length,
      version: body?.data?.version ?? null,
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw error
    }
    return {
      data: null,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Không thể kết nối đến máy chủ để tải danh mục.',
      },
      ok: false,
      status: 0,
      total: 0,
    }
  }
}
