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
      error: { code: 'TOKEN_ERROR', message: 'KhÃ´ng thá»ƒ xÃ¡c thá»±c phiÃªn lÃ m viá»‡c.' },
      ok: false,
      status: 401,
      user: null,
    }
  }

  if (!token) {
    return {
      authorized: false,
      error: { code: 'AUTHENTICATION_REQUIRED', message: 'Báº¡n cáº§n Ä‘Äƒng nháº­p Ä‘á»ƒ tiáº¿p tá»¥c.' },
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
          message: 'KhÃ´ng thá»ƒ kiá»ƒm tra quyá»n quáº£n trá»‹.',
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
        message: 'Báº¡n khÃ´ng cÃ³ quyá»n truy cáº­p tÃ i nguyÃªn nÃ y.',
      },
      ok: isAuthorized,
      status: response.status,
      user: body?.data?.user ?? null,
    }
  } catch {
    return {
      authorized: false,
      error: { code: 'NETWORK_ERROR', message: 'KhÃ´ng thá»ƒ káº¿t ná»‘i Ä‘áº¿n mÃ¡y chá»§.' },
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
          message: 'KhÃ´ng thá»ƒ táº£i danh má»¥c sáº£n pháº©m tá»« mÃ¡y chá»§.',
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
          message: 'Dá»¯ liá»‡u danh má»¥c sáº£n pháº©m khÃ´ng há»£p lá»‡.',
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
        message: 'KhÃ´ng thá»ƒ káº¿t ná»‘i Ä‘áº¿n mÃ¡y chá»§ Ä‘á»ƒ táº£i danh má»¥c.',
      },
      ok: false,
      status: 0,
      total: 0,
    }
  }
}

export async function updateAdminProduct(idOrSlug, fields, {
  getToken,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!idOrSlug || typeof idOrSlug !== 'string') {
    return {
      error: { code: 'INVALID_ID', message: 'MÃ£ Ä‘á»‹nh danh sáº£n pháº©m khÃ´ng há»£p lá»‡.' },
      ok: false,
      product: null,
      status: 400,
    }
  }

  if (typeof getToken !== 'function') {
    throw new TypeError('A token getter function is required.')
  }

  let token = null
  try {
    token = await getToken()
  } catch {
    return {
      error: { code: 'TOKEN_ERROR', message: 'KhÃ´ng thá»ƒ xÃ¡c thá»±c phiÃªn lÃ m viá»‡c.' },
      ok: false,
      product: null,
      status: 401,
    }
  }

  if (!token) {
    return {
      error: { code: 'AUTHENTICATION_REQUIRED', message: 'Báº¡n cáº§n Ä‘Äƒng nháº­p Ä‘á»ƒ tiáº¿p tá»¥c.' },
      ok: false,
      product: null,
      status: 401,
    }
  }

  try {
    const response = await fetchImpl(`/api/v1/admin/products/${encodeURIComponent(idOrSlug)}`, {
      body: JSON.stringify(fields),
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
        error: body?.error ?? {
          code: 'API_ERROR',
          message: 'KhÃ´ng thá»ƒ cáº­p nháº­t sáº£n pháº©m.',
        },
        ok: false,
        product: null,
        status: response.status,
      }
    }

    const rawProduct = body?.data?.product
    if (!rawProduct || typeof rawProduct !== 'object') {
      return {
        error: {
          code: 'MALFORMED_RESPONSE',
          message: 'Dá»¯ liá»‡u pháº£n há»“i tá»« mÃ¡y chá»§ khÃ´ng há»£p lá»‡.',
        },
        ok: false,
        product: null,
        status: response.status,
      }
    }

    const price = rawProduct.priceVnd !== undefined ? rawProduct.priceVnd : rawProduct.price ?? null
    const purchaseType = rawProduct.purchaseType ?? (price == null ? 'priceless' : 'standard')
    const isPurchasable = rawProduct.isPurchasable ?? (purchaseType !== 'priceless' && Number.isFinite(price))

    const product = {
      active: rawProduct.active !== false,
      badges: Array.isArray(rawProduct.badges) ? rawProduct.badges : [],
      collection: rawProduct.collection ?? null,
      description: rawProduct.description ?? '',
      id: rawProduct.id,
      isBestSeller: Boolean(rawProduct.isBestSeller),
      isPurchasable,
      media: Array.isArray(rawProduct.media) ? rawProduct.media : [],
      name: rawProduct.name,
      priceVnd: price,
      purchaseType,
      shortDescription: rawProduct.shortDescription ?? '',
      slug: rawProduct.slug ?? rawProduct.id,
      sortOrder: rawProduct.sortOrder ?? 0,
      status: rawProduct.status ?? 'available',
    }

    return {
      error: null,
      ok: true,
      product,
      status: response.status,
    }
  } catch {
    return {
      error: { code: 'NETWORK_ERROR', message: 'KhÃ´ng thá»ƒ káº¿t ná»‘i Ä‘áº¿n mÃ¡y chá»§ Ä‘á»ƒ cáº­p nháº­t sáº£n pháº©m.' },
      ok: false,
      product: null,
      status: 0,
    }
  }
}

export async function createAdminProduct(payload, {
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
      error: { code: 'TOKEN_ERROR', message: 'KhÃ´ng thá»ƒ xÃ¡c thá»±c phiÃªn lÃ m viá»‡c.' },
      ok: false,
      product: null,
      status: 401,
    }
  }

  if (!token) {
    return {
      error: { code: 'AUTHENTICATION_REQUIRED', message: 'Báº¡n cáº§n Ä‘Äƒng nháº­p Ä‘á»ƒ tiáº¿p tá»¥c.' },
      ok: false,
      product: null,
      status: 401,
    }
  }

  try {
    const response = await fetchImpl('/api/v1/admin/products', {
      body: JSON.stringify(payload),
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
        error: body?.error ?? {
          code: 'API_ERROR',
          message: 'KhÃ´ng thá»ƒ táº¡o sáº£n pháº©m má»›i.',
        },
        ok: false,
        product: null,
        status: response.status,
      }
    }

    const rawProduct = body?.data?.product
    if (!rawProduct || typeof rawProduct !== 'object') {
      return {
        error: {
          code: 'MALFORMED_RESPONSE',
          message: 'Dá»¯ liá»‡u pháº£n há»“i tá»« mÃ¡y chá»§ khÃ´ng há»£p lá»‡.',
        },
        ok: false,
        product: null,
        status: response.status,
      }
    }

    const price = rawProduct.priceVnd !== undefined ? rawProduct.priceVnd : rawProduct.price ?? null
    const purchaseType = rawProduct.purchaseType ?? (price == null ? 'priceless' : 'standard')
    const isPurchasable = rawProduct.isPurchasable ?? (purchaseType !== 'priceless' && Number.isFinite(price))

    const product = {
      active: rawProduct.active !== false,
      badges: Array.isArray(rawProduct.badges) ? rawProduct.badges : [],
      collection: rawProduct.collection ?? null,
      description: rawProduct.description ?? '',
      id: rawProduct.id,
      isBestSeller: Boolean(rawProduct.isBestSeller),
      isPurchasable,
      media: Array.isArray(rawProduct.media) ? rawProduct.media : [],
      name: rawProduct.name,
      priceVnd: price,
      purchaseType,
      shortDescription: rawProduct.shortDescription ?? '',
      slug: rawProduct.slug ?? rawProduct.id,
      sortOrder: rawProduct.sortOrder ?? 0,
      status: rawProduct.status ?? 'available',
    }

    return {
      error: null,
      ok: true,
      product,
      status: response.status,
    }
  } catch {
    return {
      error: { code: 'NETWORK_ERROR', message: 'KhÃ´ng thá»ƒ káº¿t ná»‘i Ä‘áº¿n mÃ¡y chá»§ Ä‘á»ƒ táº¡o sáº£n pháº©m má»›i.' },
      ok: false,
      product: null,
      status: 0,
    }
  }
}
