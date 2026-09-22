import { products as staticProducts } from '../data/products.js'

export const STATUS_MAP_FROM_API = {
  available: 'Có sẵn',
  preorder: 'Đặt trước',
  seasonal: 'Theo mùa',
}

const staticProductById = new Map(staticProducts.map((product) => [product.id, product]))

function resolveImageSrc(apiSrc, fallbackSrc) {
  if (!apiSrc) return fallbackSrc ?? ''
  if (
    typeof apiSrc === 'string' &&
    (apiSrc.startsWith('http://') ||
      apiSrc.startsWith('https://') ||
      apiSrc.startsWith('data:') ||
      apiSrc.startsWith('/assets/'))
  ) {
    return apiSrc
  }
  return fallbackSrc ?? apiSrc
}

export function normalizeCatalogueProduct(product) {
  if (!product || typeof product !== 'object') {
    throw new TypeError('Invalid product: object expected')
  }

  const staticFallback = staticProductById.get(product.id) ?? staticProductById.get(product.slug)

  // 1. Authoritative price from API (priceVnd)
  const price = product.priceVnd !== undefined ? product.priceVnd : product.price ?? null
  const purchaseType = product.purchaseType ?? (price == null ? 'priceless' : 'standard')
  const isPurchasable = product.isPurchasable ?? (purchaseType !== 'priceless' && Number.isFinite(price))

  // 2. Status mapping
  const status = STATUS_MAP_FROM_API[product.status] ?? product.status ?? 'Có sẵn'

  // 3. Media / Images
  let images = []
  if (Array.isArray(product.media) && product.media.length > 0) {
    images = product.media.map((item, index) => {
      const staticImage = staticFallback?.images?.[index] ?? staticFallback?.images?.[0]
      return {
        alt: item.alt ?? staticImage?.alt ?? '',
        caption: item.caption ?? null,
        fit: item.fit ?? staticImage?.fit ?? 'cover',
        position: item.position ?? staticImage?.position ?? 'center',
        poster: item.poster ?? null,
        src: resolveImageSrc(item.src, staticImage?.src),
        type: item.type ?? 'image',
      }
    })
  } else if (Array.isArray(product.images) && product.images.length > 0) {
    images = product.images.map((item) => ({
      ...item,
      src: resolveImageSrc(item.src, staticFallback?.images?.[0]?.src),
    }))
  } else if (staticFallback?.images) {
    images = staticFallback.images
  }

  // 4. Badges, colors, occasions, moods, composition
  const badges = Array.isArray(product.badges) ? product.badges : (staticFallback?.badges ?? [])
  const colors = Array.isArray(product.colors)
    ? product.colors
    : Array.isArray(product.colorPalette)
      ? product.colorPalette
      : (staticFallback?.colorPalette ?? [])
  const occasions = Array.isArray(product.occasions)
    ? product.occasions
    : (staticFallback?.occasions ?? [])
  const moods = Array.isArray(product.moods)
    ? product.moods
    : (staticFallback?.moods ?? [])
  const composition = Array.isArray(product.composition)
    ? product.composition
    : Array.isArray(product.flowerComposition)
      ? product.flowerComposition
      : (staticFallback?.flowerComposition ?? [])

  return {
    ...staticFallback,
    ...product,
    badges,
    colorPalette: colors,
    colors,
    composition,
    createdAt: product.createdAt ?? product.createdAtUtc ?? staticFallback?.createdAt,
    createdAtUtc: product.createdAtUtc ?? product.createdAt ?? staticFallback?.createdAt,
    flowerComposition: composition,
    id: product.id,
    images,
    isBestSeller: Boolean(product.isBestSeller),
    isPurchasable,
    media: product.media ?? images,
    moods,
    name: product.name,
    occasions,
    price,
    priceVnd: price,
    purchaseType,
    shortDescription: product.shortDescription ?? '',
    slug: product.slug ?? product.id,
    sortOrder: product.sortOrder ?? 0,
    status,
  }
}

export async function fetchShopCatalogue({
  fetchImpl = globalThis.fetch,
  signal,
  endpoint = '/api/v1/catalogue/products',
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

    // 1. Check for intentional gate / API_NOT_FOUND (HTTP 404)
    if (response.status === 404 && (body?.error?.code === 'API_NOT_FOUND' || !body)) {
      return {
        data: staticProducts.map((product) => normalizeCatalogueProduct(product)),
        error: null,
        isFallback: true,
        ok: true,
        status: 404,
      }
    }

    // 2. HTTP error other than the expected 404 gate condition
    if (!response.ok) {
      return {
        data: null,
        error: body?.error ?? {
          code: 'API_ERROR',
          message: 'Không thể tải danh mục sản phẩm từ máy chủ.',
        },
        isFallback: false,
        ok: false,
        status: response.status,
      }
    }

    // 3. Response is OK (200) - validate body
    const rawProducts = body?.data?.items ?? body?.data?.products
    if (!Array.isArray(rawProducts)) {
      return {
        data: null,
        error: {
          code: 'MALFORMED_RESPONSE',
          message: 'Dữ liệu danh mục sản phẩm không hợp lệ.',
        },
        isFallback: false,
        ok: false,
        status: response.status,
      }
    }

    // Normalize each product
    const normalized = rawProducts.map((product) => normalizeCatalogueProduct(product))

    return {
      data: normalized,
      error: null,
      isFallback: false,
      ok: true,
      status: response.status,
      total: body?.data?.total ?? normalized.length,
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
      isFallback: false,
      ok: false,
      status: 0,
    }
  }
}
