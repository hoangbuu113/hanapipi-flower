import { products as staticProducts } from '../data/products.js'
import { resolveMediaSrc } from '../utils/media.js'

export const STATUS_MAP_FROM_API = {
  available: 'Có sẵn',
  preorder: 'Đặt trước',
  seasonal: 'Theo mùa',
}

const staticProductById = new Map(staticProducts.map((product) => [product.id, product]))

function resolveImageSrc(apiSrc, fallbackSrc) {
  if (!apiSrc) return fallbackSrc ?? ''
  const resolved = resolveMediaSrc(apiSrc)
  // resolveMediaSrc returns the original src (or an R2 URL) when it can
  // resolve; prefer the static fallback when the original was an opaque
  // seeded path that resolveMediaSrc turned into an R2 URL but a Vite-
  // bundled static import is available for the storefront.
  return resolved === apiSrc ? apiSrc : (fallbackSrc ?? resolved)
}

function mapVariantsToSizeOptions(variants) {
  if (!Array.isArray(variants)) return []
  return variants
    .filter((v) => v.optionType === 'size' && v.active)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((v) => ({
      code: v.code,
      id: v.code,
      label: v.label,
      note: v.note,
      price: v.priceVnd,
      priceVnd: v.priceVnd,
      variantId: v.id,
    }))
}

function mapVariantsToWrappingOptions(variants) {
  if (!Array.isArray(variants)) return []
  return variants
    .filter((v) => v.optionType === 'wrapping' && v.active)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((v) => ({
      code: v.code,
      id: v.code,
      label: v.label,
      note: v.note,
      variantId: v.id,
    }))
}

export function normalizeCatalogueProduct(product, variantsArg = null, relatedProductsArg = null) {
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

  // 3. Variants (sizeOptions, wrappingOptions)
  const allVariants = Array.isArray(variantsArg)
    ? variantsArg
    : Array.isArray(product.variants)
      ? product.variants
      : null

  let sizeOptions = []
  let wrappingOptions = []
  if (purchaseType === 'priceless') {
    sizeOptions = []
    wrappingOptions = []
  } else if (allVariants && allVariants.length > 0) {
    sizeOptions = mapVariantsToSizeOptions(allVariants)
    wrappingOptions = mapVariantsToWrappingOptions(allVariants)
  } else {
    sizeOptions = staticFallback?.sizeOptions ?? []
    wrappingOptions = staticFallback?.wrappingOptions ?? []
  }

  // 4. Related products
  const rawRelated = Array.isArray(relatedProductsArg)
    ? relatedProductsArg
    : Array.isArray(product.relatedProducts)
      ? product.relatedProducts
      : null

  let relatedProducts = []
  if (rawRelated) {
    relatedProducts = rawRelated.map((p) => normalizeCatalogueProduct(p, null, []))
  } else if (relatedProductsArg === null && staticFallback?.relatedProductIds) {
    relatedProducts = staticFallback.relatedProductIds
      .map((id) => staticProductById.get(id))
      .filter(Boolean)
      .map((p) => normalizeCatalogueProduct(p, null, []))
  }

  // 5. Media / Images
  let images = []
  if (Array.isArray(product.media) && product.media.length > 0) {
    images = product.media.map((item, index) => {
      const staticImage = staticFallback?.media?.[index] ?? staticFallback?.images?.[index] ?? staticFallback?.images?.[0]
      return {
        alt: item.alt ?? staticImage?.alt ?? '',
        caption: item.caption ?? staticImage?.caption ?? null,
        fit: item.fit ?? staticImage?.fit ?? 'cover',
        position: item.position ?? staticImage?.position ?? 'center',
        poster: resolveImageSrc(item.poster, staticImage?.poster),
        src: resolveImageSrc(item.src, staticImage?.src),
        type: item.type ?? staticImage?.type ?? 'image',
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

  if (images.length === 0) {
    images = [{
      alt: product.name ?? 'Hanapipi Flower',
      caption: null,
      fit: 'cover',
      position: 'center',
      poster: null,
      src: '',
      type: 'image',
    }]
  }

  // 6. Badges, colors, occasions, moods, composition
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
    careNote: product.careNote ?? staticFallback?.careNote ?? '',
    colorPalette: colors,
    colors,
    composition,
    createdAt: product.createdAt ?? product.createdAtUtc ?? staticFallback?.createdAt,
    createdAtUtc: product.createdAtUtc ?? product.createdAt ?? staticFallback?.createdAt,
    deliveryNote: product.deliveryNote ?? staticFallback?.deliveryNote ?? '',
    flowerComposition: composition,
    id: product.id,
    images,
    isBestSeller: Boolean(product.isBestSeller),
    isPurchasable,
    media: images,
    moods,
    name: product.name,
    occasions,
    price,
    priceVnd: price,
    purchaseType,
    relatedProducts,
    shortDescription: product.shortDescription ?? '',
    sizeOptions,
    slug: product.slug ?? product.id,
    sortOrder: product.sortOrder ?? 0,
    status,
    variants: allVariants ?? product.variants ?? [],
    wrappingOptions,
    giftAddOns: Array.isArray(product.giftAddOns)
      ? product.giftAddOns
          .filter((g) => g.active !== false)
          .map((g) => ({
            active: g.active !== false,
            id: g.id,
            name: g.name,
            note: g.shortDescription ?? g.note ?? '',
            price: g.priceVnd !== undefined ? g.priceVnd : g.price ?? 0,
            priceVnd: g.priceVnd !== undefined ? g.priceVnd : g.price ?? 0,
            sortOrder: g.sortOrder ?? 0,
          }))
      : undefined,
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

export async function fetchProductDetail(slug, {
  fetchImpl = globalThis.fetch,
  signal,
  endpoint = `/api/v1/catalogue/products/${encodeURIComponent(slug)}`,
} = {}) {
  if (!slug || typeof slug !== 'string') {
    return {
      data: null,
      error: { code: 'INVALID_SLUG', message: 'Mã định danh sản phẩm không hợp lệ.' },
      isFallback: false,
      notFound: true,
      ok: false,
      status: 400,
    }
  }

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

    // 1. Intentional gate condition (HTTP 404 with API_NOT_FOUND)
    if (response.status === 404 && (body?.error?.code === 'API_NOT_FOUND' || !body)) {
      const staticProduct = staticProductById.get(slug)
        ?? staticProducts.find((p) => p.slug === slug || p.id === slug)
      if (!staticProduct) {
        return {
          data: null,
          error: { code: 'PRODUCT_NOT_FOUND', message: 'Không tìm thấy sản phẩm được yêu cầu.' },
          isFallback: true,
          notFound: true,
          ok: false,
          status: 404,
        }
      }
      return {
        data: normalizeCatalogueProduct(staticProduct),
        error: null,
        isFallback: true,
        notFound: false,
        ok: true,
        status: 404,
      }
    }

    // 2. Genuine backend product not found
    if (response.status === 404 && body?.error?.code === 'PRODUCT_NOT_FOUND') {
      return {
        data: null,
        error: body.error,
        isFallback: false,
        notFound: true,
        ok: false,
        status: 404,
      }
    }

    // 3. Other HTTP errors (500, etc.)
    if (!response.ok) {
      return {
        data: null,
        error: body?.error ?? {
          code: 'API_ERROR',
          message: 'Không thể tải thông tin sản phẩm từ máy chủ.',
        },
        isFallback: false,
        notFound: response.status === 404,
        ok: false,
        status: response.status,
      }
    }

    // 4. Successful response (200) - validate body
    const rawProduct = body?.data?.product
    if (!rawProduct || typeof rawProduct !== 'object') {
      return {
        data: null,
        error: {
          code: 'MALFORMED_RESPONSE',
          message: 'Dữ liệu sản phẩm không hợp lệ.',
        },
        isFallback: false,
        notFound: false,
        ok: false,
        status: response.status,
      }
    }

    const rawVariants = body?.data?.variants ?? rawProduct.variants ?? []
    const rawRelated = body?.data?.relatedProducts ?? rawProduct.relatedProducts ?? []
    const normalized = normalizeCatalogueProduct(rawProduct, rawVariants, rawRelated)

    return {
      data: normalized,
      error: null,
      isFallback: false,
      notFound: false,
      ok: true,
      status: response.status,
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw error
    }
    return {
      data: null,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Không thể kết nối đến máy chủ để tải thông tin sản phẩm.',
      },
      isFallback: false,
      notFound: false,
      ok: false,
      status: 0,
    }
  }
}
