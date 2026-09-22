import { fetchProductDetail } from './catalogueClient'

export async function resolveCartItems(storedItems, {
  fetchProductDetailImpl = fetchProductDetail,
  signal,
} = {}) {
  if (!Array.isArray(storedItems) || storedItems.length === 0) {
    return {
      error: null,
      hasUnavailableItems: false,
      isFallback: false,
      items: [],
      ok: true,
      subtotal: 0,
    }
  }

  // 1. Extract unique product identifiers from non-custom lines
  const uniqueProductIds = [...new Set(
    storedItems
      .filter((item) => item && !item.custom && typeof item.productId === 'string' && item.productId.trim().length > 0)
      .map((item) => item.productId.trim()),
  )]

  // 2. Fetch product details for all unique products in parallel
  let fetchResults
  try {
    fetchResults = await Promise.all(
      uniqueProductIds.map(async (productId) => {
        const result = await fetchProductDetailImpl(productId, { signal })
        return [productId, result]
      }),
    )
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    return {
      error: { code: 'CLIENT_ERROR', message: 'Đã có lỗi xảy ra khi tải thông tin giỏ hàng.' },
      hasUnavailableItems: false,
      isFallback: false,
      items: [],
      ok: false,
      subtotal: 0,
    }
  }

  const resultMap = new Map(fetchResults)

  // 3. Check for server errors (HTTP 500, network errors, malformed responses)
  for (const [, result] of resultMap) {
    if (!result.ok && !result.notFound) {
      return {
        error: result.error ?? { code: 'API_ERROR', message: 'Không thể kết nối máy chủ để tải giỏ hàng.' },
        hasUnavailableItems: false,
        isFallback: false,
        items: [],
        ok: false,
        subtotal: 0,
      }
    }
  }

  // 4. Resolve each stored cart line
  const resolvedItems = storedItems.map((item) => {
    if (!item) return null

    // Custom bouquet lines remain client-defined
    if (item.custom) {
      const unitPrice = Number.isFinite(Number(item.price ?? item.unitPrice))
        ? Math.max(0, Number(item.price ?? item.unitPrice))
        : 0
      const quantity = Math.max(1, Number(item.quantity) || 1)
      const lineTotal = unitPrice * quantity

      return {
        ...item,
        custom: true,
        isAvailable: true,
        isPriceless: false,
        lineTotal,
        name: item.name ?? 'Bó hoa theo ý bạn',
        quantity,
        unavailableReason: null,
        unitPrice,
      }
    }

    const productId = item.productId
    const result = resultMap.get(productId)

    // Product archived, missing, or genuine 404 from backend
    if (!result || result.notFound || !result.ok || !result.data) {
      return {
        ...item,
        custom: false,
        giftAddOns: item.giftAddOns ?? [],
        image: null,
        isAvailable: false,
        isPriceless: false,
        lineTotal: 0,
        name: item.name ?? 'Bó hoa không còn mở bán',
        product: null,
        size: null,
        slug: productId,
        unavailableReason: 'Sản phẩm hiện không còn mở bán',
        unitPrice: 0,
        wrapping: null,
      }
    }

    const product = result.data

    // Invariant: no-watering-flower or priceless product can never be purchased
    const isPriceless = product.purchaseType === 'priceless'
      || !product.isPurchasable
      || product.slug === 'no-watering-flower'

    if (isPriceless) {
      return {
        ...item,
        custom: false,
        giftAddOns: [],
        image: product.media?.[0] ?? product.images?.[0] ?? null,
        isAvailable: false,
        isPriceless: true,
        lineTotal: 0,
        name: product.name,
        product,
        size: null,
        slug: product.slug,
        unavailableReason: 'Bó hoa vô giá không thể đặt mua',
        unitPrice: null,
        wrapping: null,
      }
    }

    // Resolve size / variant
    const size = (product.sizeOptions || []).find((opt) => opt.id === item.sizeId
      || opt.code === item.sizeId
      || opt.variantId === item.sizeId)

    if (!size) {
      return {
        ...item,
        custom: false,
        giftAddOns: item.giftAddOns ?? [],
        image: product.media?.[0] ?? product.images?.[0] ?? null,
        isAvailable: false,
        isPriceless: false,
        lineTotal: 0,
        name: product.name,
        product,
        size: null,
        slug: product.slug,
        unavailableReason: 'Kích thước đã chọn không còn khả dụng.',
        unitPrice: 0,
        wrapping: null,
      }
    }

    // Resolve wrapping
    let wrapping = null
    if (item.wrappingId) {
      wrapping = (product.wrappingOptions || []).find((opt) => opt.id === item.wrappingId
        || opt.code === item.wrappingId
        || opt.variantId === item.wrappingId)

      if (!wrapping) {
        return {
          ...item,
          custom: false,
          giftAddOns: item.giftAddOns ?? [],
          image: product.media?.[0] ?? product.images?.[0] ?? null,
          isAvailable: false,
          isPriceless: false,
          lineTotal: 0,
          name: product.name,
          product,
          size,
          slug: product.slug,
          unavailableReason: 'Kiểu gói đã chọn không còn khả dụng.',
          unitPrice: 0,
          wrapping: null,
        }
      }
    }

    // Resolve gift add-ons against active catalogue add-ons
    const activeGiftAddOns = Array.isArray(product.giftAddOns) ? product.giftAddOns : []
    const resolvedGiftAddOns = (item.giftAddOns || []).map((storedAddOn) => {
      const activeAddOn = activeGiftAddOns.find((g) => g.id === storedAddOn.id && g.active !== false)
      if (activeAddOn) {
        return {
          active: true,
          id: activeAddOn.id,
          name: activeAddOn.name,
          price: Number.isFinite(Number(activeAddOn.price)) ? Number(activeAddOn.price) : 0,
        }
      }
      return {
        active: false,
        id: storedAddOn.id,
        name: storedAddOn.name ?? storedAddOn.id,
        notice: 'Quà tặng kèm không còn khả dụng và không tính phí',
        price: 0,
      }
    })

    const unitPrice = size.price
    const activeGiftsTotal = resolvedGiftAddOns
      .filter((addOn) => addOn.active)
      .reduce((sum, addOn) => sum + addOn.price, 0)
    const quantity = Math.max(1, Number(item.quantity) || 1)
    const lineTotal = (unitPrice + activeGiftsTotal) * quantity

    return {
      ...item,
      custom: false,
      giftAddOns: resolvedGiftAddOns,
      image: product.media?.[0] ?? product.images?.[0] ?? null,
      isAvailable: true,
      isPriceless: false,
      lineTotal,
      name: product.name,
      product,
      quantity,
      size,
      slug: product.slug,
      unavailableReason: null,
      unitPrice,
      wrapping,
    }
  }).filter(Boolean)

  const isFallback = Array.from(resultMap.values()).some((res) => res.isFallback)
  const subtotal = resolvedItems
    .filter((item) => item.isAvailable)
    .reduce((sum, item) => sum + item.lineTotal, 0)
  const hasUnavailableItems = resolvedItems.some((item) => !item.isAvailable)

  return {
    error: null,
    hasUnavailableItems,
    isFallback,
    items: resolvedItems,
    ok: true,
    subtotal,
  }
}
