import { resolveCatalogueMedia } from '../utils/media.js'

export function normalizeAdminProduct(rawProduct) {
  if (!rawProduct || typeof rawProduct !== 'object') return null

  const price = rawProduct.priceVnd !== undefined ? rawProduct.priceVnd : rawProduct.price ?? null
  const purchaseType = rawProduct.purchaseType ?? (price == null ? 'priceless' : 'standard')
  const isPurchasable = rawProduct.isPurchasable
    ?? (rawProduct.active !== false && purchaseType !== 'priceless' && Number.isFinite(price))

  return {
    active: rawProduct.active !== false,
    badges: Array.isArray(rawProduct.badges) ? rawProduct.badges : [],
    careNote: rawProduct.careNote ?? '',
    collection: rawProduct.collection ?? null,
    colors: Array.isArray(rawProduct.colors) ? rawProduct.colors : [],
    composition: Array.isArray(rawProduct.composition) ? rawProduct.composition : [],
    deliveryNote: rawProduct.deliveryNote ?? '',
    description: rawProduct.description ?? '',
    id: rawProduct.id,
    internalNote: rawProduct.internalNote ?? '',
    isBestSeller: Boolean(rawProduct.isBestSeller),
    isPurchasable,
    media: resolveCatalogueMedia(rawProduct.media, { productName: rawProduct.name }),
    moods: Array.isArray(rawProduct.moods) ? rawProduct.moods : [],
    name: rawProduct.name,
    occasions: Array.isArray(rawProduct.occasions) ? rawProduct.occasions : [],
    priceVnd: price,
    purchaseType,
    shortDescription: rawProduct.shortDescription ?? '',
    slug: rawProduct.slug ?? rawProduct.id,
    sortOrder: rawProduct.sortOrder ?? 0,
    status: rawProduct.status ?? 'available',
  }
}

async function deleteAdminRecord(path, { getToken, fetchImpl = globalThis.fetch } = {}) {
  if (typeof getToken !== 'function') throw new TypeError('A token getter function is required.')

  let token = null
  try {
    token = await getToken()
  } catch {
    return { error: { code: 'TOKEN_ERROR', message: 'Không thể xác thực phiên làm việc.' }, ok: false, status: 401 }
  }
  if (!token) {
    return { error: { code: 'AUTHENTICATION_REQUIRED', message: 'Bạn cần đăng nhập để tiếp tục.' }, ok: false, status: 401 }
  }

  try {
    const response = await fetchImpl(path, {
      headers: { Authorization: `Bearer ${token}` },
      method: 'DELETE',
    })
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      return {
        error: body?.error ?? { code: 'DELETE_FAILED', message: 'Không thể xóa dữ liệu.' },
        ok: false,
        status: response.status,
      }
    }
    if (!body?.data || typeof body.data !== 'object') {
      return {
        error: { code: 'MALFORMED_RESPONSE', message: 'Phản hồi từ máy chủ không hợp lệ.' },
        ok: false,
        status: response.status,
      }
    }
    return { ...body.data, error: null, ok: true, status: response.status }
  } catch {
    return {
      error: { code: 'NETWORK_ERROR', message: 'Không thể kết nối đến máy chủ.' },
      ok: false,
      status: 0,
    }
  }
}

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
  getToken,
  fetchImpl = globalThis.fetch,
  signal,
  endpoint = '/api/v1/admin/products?limit=50',
} = {}) {
  if (typeof getToken !== 'function') {
    throw new TypeError('A token getter function is required.')
  }

  let token = null
  try {
    token = await getToken()
  } catch {
    return {
      data: null,
      error: { code: 'TOKEN_ERROR', message: 'Không thể xác thực phiên làm việc.' },
      ok: false,
      status: 401,
      total: 0,
    }
  }

  if (!token) {
    return {
      data: null,
      error: { code: 'AUTHENTICATION_REQUIRED', message: 'Bạn cần đăng nhập để tiếp tục.' },
      ok: false,
      status: 401,
      total: 0,
    }
  }

  try {
    const response = await fetchImpl(endpoint, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
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

    const products = rawProducts.map(normalizeAdminProduct)

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

export async function setAdminProductArchived(idOrSlug, archived, {
  getToken,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!idOrSlug || typeof idOrSlug !== 'string') {
    return {
      error: { code: 'INVALID_ID', message: 'Mã định danh sản phẩm không hợp lệ.' },
      ok: false,
      product: null,
      status: 400,
    }
  }
  if (typeof archived !== 'boolean') {
    throw new TypeError('archived must be a boolean.')
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
      product: null,
      status: 401,
    }
  }

  if (!token) {
    return {
      error: { code: 'AUTHENTICATION_REQUIRED', message: 'Bạn cần đăng nhập để tiếp tục.' },
      ok: false,
      product: null,
      status: 401,
    }
  }

  try {
    const action = archived ? 'archive' : 'restore'
    const response = await fetchImpl(
      `/api/v1/admin/products/${encodeURIComponent(idOrSlug)}/${action}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        method: 'PATCH',
      },
    )

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
          message: archived ? 'Không thể lưu trữ sản phẩm.' : 'Không thể khôi phục sản phẩm.',
        },
        ok: false,
        product: null,
        status: response.status,
      }
    }

    const rawProduct = body?.data?.product
    if (!rawProduct || typeof rawProduct !== 'object') {
      return {
        error: { code: 'MALFORMED_RESPONSE', message: 'Dữ liệu phản hồi từ máy chủ không hợp lệ.' },
        ok: false,
        product: null,
        status: response.status,
      }
    }

    return {
      error: null,
      ok: true,
      product: normalizeAdminProduct(rawProduct),
      status: response.status,
    }
  } catch {
    return {
      error: {
        code: 'NETWORK_ERROR',
        message: archived
          ? 'Không thể kết nối đến máy chủ để lưu trữ sản phẩm.'
          : 'Không thể kết nối đến máy chủ để khôi phục sản phẩm.',
      },
      ok: false,
      product: null,
      status: 0,
    }
  }
}

export function deleteAdminProduct(idOrSlug, options = {}) {
  if (!idOrSlug || typeof idOrSlug !== 'string') {
    return Promise.resolve({
      error: { code: 'INVALID_ID', message: 'Mã định danh sản phẩm không hợp lệ.' },
      ok: false,
      status: 400,
    })
  }
  return deleteAdminRecord(`/api/v1/admin/products/${encodeURIComponent(idOrSlug)}`, options)
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

    const product = normalizeAdminProduct(rawProduct)

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

    const product = normalizeAdminProduct(rawProduct)

    return {
      error: null,
      ok: true,
      product,
      status: response.status,
    }
  } catch {
    return {
      error: { code: 'NETWORK_ERROR', message: 'Không thể kết nối đến máy chủ để tạo sản phẩm mới.' },
      ok: false,
      product: null,
      status: 0,
    }
  }
}

export async function uploadAdminMedia(file, {
  getToken,
  fetchImpl = globalThis.fetch,
  endpoint = '/api/v1/admin/media',
} = {}) {
  if (!file) {
    return {
      data: null,
      error: { code: 'INVALID_FILE', message: 'Vui lòng chọn tệp hình ảnh để tải lên.' },
      ok: false,
      status: 400,
    }
  }

  let token = null
  if (typeof getToken === 'function') {
    try {
      token = await getToken()
    } catch {
      return {
        data: null,
        error: { code: 'AUTH_ERROR', message: 'Không thể xác thực quyền quản trị.' },
        ok: false,
        status: 401,
      }
    }
  }

  const headers = {}
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const formData = new FormData()
  formData.append('file', file)

  try {
    const response = await fetchImpl(endpoint, {
      body: formData,
      headers,
      method: 'POST',
    })

    const body = await response.json().catch(() => null)

    if (!response.ok) {
      return {
        data: null,
        error: body?.error || {
          code: 'UPLOAD_FAILED',
          message: 'Không thể tải ảnh lên máy chủ.',
        },
        ok: false,
        status: response.status,
      }
    }

    return {
      data: body?.data || null,
      error: null,
      ok: true,
      status: response.status,
    }
  } catch {
    return {
      data: null,
      error: { code: 'NETWORK_ERROR', message: 'Không thể kết nối đến máy chủ để tải ảnh lên.' },
      ok: false,
      status: 0,
    }
  }
}

export async function deleteAdminMedia(key, {
  getToken,
  fetchImpl = globalThis.fetch,
  endpointPrefix = '/api/v1/admin/media',
} = {}) {
  if (!key || typeof key !== 'string') {
    return {
      data: null,
      error: { code: 'INVALID_KEY', message: 'Mã tệp hình ảnh không hợp lệ.' },
      ok: false,
      status: 400,
    }
  }

  let token = null
  if (typeof getToken === 'function') {
    try {
      token = await getToken()
    } catch {
      return {
        data: null,
        error: { code: 'AUTH_ERROR', message: 'Không thể xác thực quyền quản trị.' },
        ok: false,
        status: 401,
      }
    }
  }

  const headers = {}
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  try {
    const response = await fetchImpl(`${endpointPrefix}/${encodeURIComponent(key)}`, {
      headers,
      method: 'DELETE',
    })

    const body = await response.json().catch(() => null)

    if (!response.ok) {
      return {
        data: null,
        error: body?.error || {
          code: 'DELETE_FAILED',
          message: 'Không thể xóa ảnh khỏi máy chủ.',
        },
        ok: false,
        status: response.status,
      }
    }

    return {
      data: body?.data || null,
      error: null,
      ok: true,
      status: response.status,
    }
  } catch {
    return {
      data: null,
      error: { code: 'NETWORK_ERROR', message: 'Không thể kết nối đến máy chủ để xóa ảnh.' },
      ok: false,
      status: 0,
    }
  }
}

export async function fetchAdminProductVariants(productId, {
  getToken,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!productId || typeof productId !== 'string') {
    return { error: { code: 'INVALID_ID', message: 'Mã sản phẩm không hợp lệ.' }, ok: false, status: 400, variants: [] }
  }
  if (typeof getToken !== 'function') {
    throw new TypeError('A token getter function is required.')
  }

  let token = null
  try {
    token = await getToken()
  } catch {
    return { error: { code: 'TOKEN_ERROR', message: 'Không thể xác thực phiên làm việc.' }, ok: false, status: 401, variants: [] }
  }

  if (!token) {
    return { error: { code: 'AUTHENTICATION_REQUIRED', message: 'Bạn cần đăng nhập để tiếp tục.' }, ok: false, status: 401, variants: [] }
  }

  try {
    const response = await fetchImpl(`/api/v1/admin/products/${encodeURIComponent(productId)}/variants`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    })

    const body = await response.json().catch(() => null)
    if (!response.ok) {
      return {
        error: body?.error ?? { code: 'API_ERROR', message: 'Không thể tải danh sách tùy chọn của sản phẩm.' },
        ok: false,
        status: response.status,
        variants: [],
      }
    }

    return {
      error: null,
      ok: true,
      status: response.status,
      variants: Array.isArray(body?.data?.variants) ? body.data.variants : [],
    }
  } catch {
    return { error: { code: 'NETWORK_ERROR', message: 'Không thể kết nối đến máy chủ.' }, ok: false, status: 0, variants: [] }
  }
}

export async function saveAdminProductVariants(productId, variants, {
  getToken,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!productId || typeof productId !== 'string') {
    return { error: { code: 'INVALID_ID', message: 'Mã sản phẩm không hợp lệ.' }, ok: false, status: 400, variants: [] }
  }
  if (!Array.isArray(variants)) {
    return { error: { code: 'INVALID_PAYLOAD', message: 'Danh sách tùy chọn không hợp lệ.' }, ok: false, status: 400, variants: [] }
  }
  if (typeof getToken !== 'function') {
    throw new TypeError('A token getter function is required.')
  }

  let token = null
  try {
    token = await getToken()
  } catch {
    return { error: { code: 'TOKEN_ERROR', message: 'Không thể xác thực phiên làm việc.' }, ok: false, status: 401, variants: [] }
  }

  if (!token) {
    return { error: { code: 'AUTHENTICATION_REQUIRED', message: 'Bạn cần đăng nhập để tiếp tục.' }, ok: false, status: 401, variants: [] }
  }

  try {
    const response = await fetchImpl(`/api/v1/admin/products/${encodeURIComponent(productId)}/variants`, {
      body: JSON.stringify({ variants }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'PUT',
    })

    const body = await response.json().catch(() => null)
    if (!response.ok) {
      return {
        error: body?.error ?? { code: 'API_ERROR', message: 'Không thể lưu danh sách tùy chọn.' },
        ok: false,
        status: response.status,
        variants: [],
      }
    }

    return {
      error: null,
      ok: true,
      status: response.status,
      variants: Array.isArray(body?.data?.variants) ? body.data.variants : [],
    }
  } catch {
    return { error: { code: 'NETWORK_ERROR', message: 'Không thể kết nối đến máy chủ.' }, ok: false, status: 0, variants: [] }
  }
}

export async function fetchAdminGiftAddOns({
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
    return { error: { code: 'TOKEN_ERROR', message: 'Không thể xác thực phiên làm việc.' }, items: [], ok: false, status: 401, total: 0 }
  }

  if (!token) {
    return { error: { code: 'AUTHENTICATION_REQUIRED', message: 'Bạn cần đăng nhập để tiếp tục.' }, items: [], ok: false, status: 401, total: 0 }
  }

  try {
    const response = await fetchImpl('/api/v1/admin/gift-add-ons', {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    })

    const body = await response.json().catch(() => null)
    if (!response.ok) {
      return {
        error: body?.error ?? { code: 'API_ERROR', message: 'Không thể tải danh sách quà tặng kèm.' },
        items: [],
        ok: false,
        status: response.status,
        total: 0,
      }
    }

    const items = Array.isArray(body?.data?.items) ? body.data.items : []
    return {
      error: null,
      items,
      ok: true,
      status: response.status,
      total: body?.data?.total ?? items.length,
    }
  } catch {
    return { error: { code: 'NETWORK_ERROR', message: 'Không thể kết nối đến máy chủ.' }, items: [], ok: false, status: 0, total: 0 }
  }
}

export async function createAdminGiftAddOn(payload, {
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
    return { error: { code: 'TOKEN_ERROR', message: 'Không thể xác thực phiên làm việc.' }, item: null, ok: false, status: 401 }
  }

  if (!token) {
    return { error: { code: 'AUTHENTICATION_REQUIRED', message: 'Bạn cần đăng nhập để tiếp tục.' }, item: null, ok: false, status: 401 }
  }

  try {
    const response = await fetchImpl('/api/v1/admin/gift-add-ons', {
      body: JSON.stringify(payload),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })

    const body = await response.json().catch(() => null)
    if (!response.ok) {
      return {
        error: body?.error ?? { code: 'API_ERROR', message: 'Không thể tạo món quà mới.' },
        item: null,
        ok: false,
        status: response.status,
      }
    }

    return {
      error: null,
      item: body?.data?.item ?? null,
      ok: true,
      status: response.status,
    }
  } catch {
    return { error: { code: 'NETWORK_ERROR', message: 'Không thể kết nối đến máy chủ.' }, item: null, ok: false, status: 0 }
  }
}

export async function updateAdminGiftAddOn(id, fields, {
  getToken,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!id || typeof id !== 'string') {
    return { error: { code: 'INVALID_ID', message: 'Mã món quà không hợp lệ.' }, item: null, ok: false, status: 400 }
  }
  if (typeof getToken !== 'function') {
    throw new TypeError('A token getter function is required.')
  }

  let token = null
  try {
    token = await getToken()
  } catch {
    return { error: { code: 'TOKEN_ERROR', message: 'Không thể xác thực phiên làm việc.' }, item: null, ok: false, status: 401 }
  }

  if (!token) {
    return { error: { code: 'AUTHENTICATION_REQUIRED', message: 'Bạn cần đăng nhập để tiếp tục.' }, item: null, ok: false, status: 401 }
  }

  try {
    const response = await fetchImpl(`/api/v1/admin/gift-add-ons/${encodeURIComponent(id)}`, {
      body: JSON.stringify(fields),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'PATCH',
    })

    const body = await response.json().catch(() => null)
    if (!response.ok) {
      return {
        error: body?.error ?? { code: 'API_ERROR', message: 'Không thể cập nhật món quà.' },
        item: null,
        ok: false,
        status: response.status,
      }
    }

    return {
      error: null,
      item: body?.data?.item ?? null,
      ok: true,
      status: response.status,
    }
  } catch {
    return { error: { code: 'NETWORK_ERROR', message: 'Không thể kết nối đến máy chủ.' }, item: null, ok: false, status: 0 }
  }
}

export async function toggleAdminGiftAddOnActive(id, active, {
  getToken,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!id || typeof id !== 'string') {
    return { error: { code: 'INVALID_ID', message: 'Mã món quà không hợp lệ.' }, item: null, ok: false, status: 400 }
  }
  if (typeof getToken !== 'function') {
    throw new TypeError('A token getter function is required.')
  }

  let token = null
  try {
    token = await getToken()
  } catch {
    return { error: { code: 'TOKEN_ERROR', message: 'Không thể xác thực phiên làm việc.' }, item: null, ok: false, status: 401 }
  }

  if (!token) {
    return { error: { code: 'AUTHENTICATION_REQUIRED', message: 'Bạn cần đăng nhập để tiếp tục.' }, item: null, ok: false, status: 401 }
  }

  try {
    const response = await fetchImpl(`/api/v1/admin/gift-add-ons/${encodeURIComponent(id)}/toggle-active`, {
      body: JSON.stringify({ active }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'PATCH',
    })

    const body = await response.json().catch(() => null)
    if (!response.ok) {
      return {
        error: body?.error ?? { code: 'API_ERROR', message: 'Không thể thay đổi trạng thái món quà.' },
        item: null,
        ok: false,
        status: response.status,
      }
    }

    return {
      error: null,
      item: body?.data?.item ?? null,
      ok: true,
      status: response.status,
    }
  } catch {
    return { error: { code: 'NETWORK_ERROR', message: 'Không thể kết nối đến máy chủ.' }, item: null, ok: false, status: 0 }
  }
}

export function deleteAdminGiftAddOn(id, options = {}) {
  if (!id || typeof id !== 'string') {
    return Promise.resolve({ error: { code: 'INVALID_ID', message: 'Mã món quà không hợp lệ.' }, ok: false, status: 400 })
  }
  return deleteAdminRecord(`/api/v1/admin/gift-add-ons/${encodeURIComponent(id)}`, options)
}

export async function fetchAdminOrders({
  getToken,
  fetchImpl = globalThis.fetch,
  signal,
} = {}) {
  if (typeof getToken !== 'function') {
    throw new TypeError('A token getter function is required.')
  }

  let token = null
  try {
    token = await getToken()
  } catch {
    return { error: { code: 'TOKEN_ERROR', message: 'Không thể xác thực phiên làm việc.' }, ok: false, orders: [], status: 401 }
  }

  if (!token) {
    return { error: { code: 'AUTHENTICATION_REQUIRED', message: 'Bạn cần đăng nhập để tiếp tục.' }, ok: false, orders: [], status: 401 }
  }

  try {
    const response = await fetchImpl('/api/v1/admin/orders', {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    })
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      return {
        error: body?.error ?? { code: 'API_ERROR', message: 'Không thể tải danh sách đơn hàng.' },
        ok: false,
        orders: [],
        status: response.status,
      }
    }
    return {
      error: null,
      ok: true,
      orders: body?.data?.orders || [],
      status: response.status,
      total: body?.data?.total ?? 0,
    }
  } catch (err) {
    if (signal?.aborted) throw err
    return { error: { code: 'NETWORK_ERROR', message: 'Không thể kết nối đến máy chủ.' }, ok: false, orders: [], status: 0 }
  }
}

export async function fetchAdminOrderDetail(idOrCode, {
  getToken,
  fetchImpl = globalThis.fetch,
  signal,
} = {}) {
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
    return { error: { code: 'TOKEN_ERROR', message: 'Không thể xác thực phiên làm việc.' }, ok: false, order: null, status: 401 }
  }

  if (!token) {
    return { error: { code: 'AUTHENTICATION_REQUIRED', message: 'Bạn cần đăng nhập để tiếp tục.' }, ok: false, order: null, status: 401 }
  }

  try {
    const response = await fetchImpl(`/api/v1/admin/orders/${encodeURIComponent(idOrCode)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    })
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      return {
        error: body?.error ?? { code: 'API_ERROR', message: 'Không thể tải chi tiết đơn hàng.' },
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
  } catch (err) {
    if (signal?.aborted) throw err
    return { error: { code: 'NETWORK_ERROR', message: 'Không thể kết nối đến máy chủ.' }, ok: false, order: null, status: 0 }
  }
}

export function deleteAdminOrder(idOrCode, options = {}) {
  if (!idOrCode || typeof idOrCode !== 'string') {
    return Promise.resolve({
      error: { code: 'INVALID_ID', message: 'Mã định danh đơn hàng không hợp lệ.' },
      ok: false,
      status: 400,
    })
  }
  return deleteAdminRecord(`/api/v1/admin/orders/${encodeURIComponent(idOrCode)}`, options)
}

export async function confirmAdminOrderPayment(idOrCode, {
  getToken,
  fetchImpl = globalThis.fetch,
} = {}) {
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
    return { error: { code: 'TOKEN_ERROR', message: 'Không thể xác thực phiên làm việc.' }, ok: false, order: null, status: 401 }
  }

  if (!token) {
    return { error: { code: 'AUTHENTICATION_REQUIRED', message: 'Bạn cần đăng nhập để tiếp tục.' }, ok: false, order: null, status: 401 }
  }

  try {
    const response = await fetchImpl(`/api/v1/admin/orders/${encodeURIComponent(idOrCode)}/confirm-payment`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      return {
        error: body?.error ?? { code: 'API_ERROR', message: 'Không thể xác nhận thanh toán.' },
        ok: false,
        order: null,
        status: response.status,
      }
    }
    return {
      error: null,
      message: body?.data?.message ?? 'Đã xác nhận thanh toán thành công.',
      ok: true,
      order: body?.data?.order ?? null,
      status: response.status,
    }
  } catch {
    return { error: { code: 'NETWORK_ERROR', message: 'Không thể kết nối đến máy chủ.' }, ok: false, order: null, status: 0 }
  }
}

export async function updateAdminOrderStatus(idOrCode, status, {
  getToken,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!idOrCode || typeof idOrCode !== 'string') {
    throw new TypeError('An order ID or order code is required.')
  }
  if (!status || typeof status !== 'string') {
    throw new TypeError('A target status is required.')
  }
  if (typeof getToken !== 'function') {
    throw new TypeError('A token getter function is required.')
  }

  let token = null
  try {
    token = await getToken()
  } catch {
    return { error: { code: 'TOKEN_ERROR', message: 'Không thể xác thực phiên làm việc.' }, ok: false, order: null, status: 401 }
  }

  if (!token) {
    return { error: { code: 'AUTHENTICATION_REQUIRED', message: 'Bạn cần đăng nhập để tiếp tục.' }, ok: false, order: null, status: 401 }
  }

  try {
    const response = await fetchImpl(`/api/v1/admin/orders/${encodeURIComponent(idOrCode)}/status`, {
      body: JSON.stringify({ status }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      return {
        error: body?.error ?? { code: 'API_ERROR', message: 'Không thể cập nhật trạng thái đơn hoa.' },
        ok: false,
        order: null,
        status: response.status,
      }
    }
    return {
      error: null,
      message: body?.data?.message ?? 'Đã cập nhật trạng thái đơn hoa thành công.',
      ok: true,
      order: body?.data?.order ?? null,
      status: response.status,
    }
  } catch {
    return { error: { code: 'NETWORK_ERROR', message: 'Không thể kết nối đến máy chủ.' }, ok: false, order: null, status: 0 }
  }
}
