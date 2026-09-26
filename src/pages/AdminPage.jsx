import { useEffect, useState, useCallback } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import Container from '../components/Container'
import { useAccount } from '../context/accountStore'
import {
  checkAdminAccess,
  confirmAdminOrderPayment,
  createAdminGiftAddOn,
  createAdminProduct,
  deleteAdminOrder,
  deleteAdminGiftAddOn,
  deleteAdminProduct,
  deleteAdminMedia,
  fetchAdminCatalogue,
  fetchAdminGiftAddOns,
  fetchAdminOrderDetail,
  fetchAdminOrders,
  fetchAdminProductVariants,
  saveAdminProductVariants,
  setAdminProductArchived,
  toggleAdminGiftAddOnActive,
  updateAdminGiftAddOn,
  updateAdminOrderStatus,
  updateAdminProduct,
} from '../services/adminClient'
import {
  formatDeliveryDate,
  formatDeliverySlot,
  formatOrderAuditEvent,
  formatOrderStatus,
  formatPaymentMethod,
  formatPaymentStatus,
} from '../utils/order'
import { formatCurrency } from '../utils/formatCurrency'
import ProductImageUploader from '../components/admin/ProductImageUploader'
import ProductGalleryEditor from '../components/admin/ProductGalleryEditor'
import AdminModal from '../components/admin/AdminModal'
import AdminConsultations from '../components/admin/AdminConsultations.jsx'
import { getPrimaryMediaSrc } from '../utils/media'
import './AdminPage.css'

const STATUS_LABELS = {
  available: 'Có sẵn',
  preorder: 'Đặt trước',
  seasonal: 'Theo mùa',
  archived: 'Lưu trữ',
}

const generateSlug = (text) => {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function AdminPage() {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const { user: contextUser } = useAccount()

  const [authStatus, setAuthStatus] = useState('loading') // 'loading' | 'authorized' | 'forbidden' | 'unauthenticated' | 'error'
  const [adminUser, setAdminUser] = useState(null)
  const [authError, setAuthError] = useState(null)
  const [authReloadKey, setAuthReloadKey] = useState(0)

  const [isCatalogueLoading, setIsCatalogueLoading] = useState(false)
  const [products, setProducts] = useState([])
  const [catalogueError, setCatalogueError] = useState(null)
  const [catalogueReloadKey, setCatalogueReloadKey] = useState(0)

  const [editingProduct, setEditingProduct] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isEditMediaBusy, setIsEditMediaBusy] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saveSuccess, setSaveSuccess] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const [visibilityBusyId, setVisibilityBusyId] = useState(null)
  const [visibilityError, setVisibilityError] = useState(null)

  const [isCreating, setIsCreating] = useState(false)
  const [createForm, setCreateForm] = useState({
    collection: '',
    imageKey: null,
    imageUrl: '',
    isPurchasable: true,
    name: '',
    priceVnd: '',
    shortDescription: '',
    slug: '',
    status: 'available',
  })
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false)
  const [isCreateMediaBusy, setIsCreateMediaBusy] = useState(false)
  const [createError, setCreateError] = useState(null)
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false)
  const [showCustomSlug, setShowCustomSlug] = useState(false)

  // Product Options Configuration (Sizes & Wrapping)
  const [configuringProduct, setConfiguringProduct] = useState(null)
  const [variantsForm, setVariantsForm] = useState([])
  const [isLoadingVariants, setIsLoadingVariants] = useState(false)
  const [variantsError, setVariantsError] = useState(null)
  const [isSavingVariants, setIsSavingVariants] = useState(false)
  const [variantsSuccess, setVariantsSuccess] = useState(null)

  // Gift Add-ons Management
  const [giftAddOns, setGiftAddOns] = useState([])
  const [isLoadingGiftAddOns, setIsLoadingGiftAddOns] = useState(true)
  const [giftAddOnsError, setGiftAddOnsError] = useState(null)
  const [giftAddOnsReloadKey, setGiftAddOnsReloadKey] = useState(0)
  const [editingGiftAddOnId, setEditingGiftAddOnId] = useState(null)
  const [editGiftAddOnForm, setEditGiftAddOnForm] = useState(null)
  const [isSavingGiftAddOn, setIsSavingGiftAddOn] = useState(false)
  const [giftAddOnSaveError, setGiftAddOnSaveError] = useState(null)
  const [giftAddOnToggleError, setGiftAddOnToggleError] = useState(null)
  const [togglingGiftAddOnId, setTogglingGiftAddOnId] = useState(null)
  const [isCreatingGiftAddOn, setIsCreatingGiftAddOn] = useState(false)
  const [createGiftAddOnForm, setCreateGiftAddOnForm] = useState({
    active: true,
    name: '',
    priceVnd: 0,
    shortDescription: '',
  })
  const [isSubmittingGiftAddOn, setIsSubmittingGiftAddOn] = useState(false)
  const [createGiftAddOnError, setCreateGiftAddOnError] = useState(null)

  // Orders Fulfilment Management
  const [orders, setOrders] = useState([])
  const [isLoadingOrders, setIsLoadingOrders] = useState(true)
  const [ordersError, setOrdersError] = useState(null)
  const [ordersReloadKey, setOrdersReloadKey] = useState(0)

  const [selectedOrderDetail, setSelectedOrderDetail] = useState(null)
  const [isLoadingOrderDetail, setIsLoadingOrderDetail] = useState(false)
  const [orderDetailError, setOrderDetailError] = useState(null)
  const [isUpdatingOrder, setIsUpdatingOrder] = useState(false)
  const [orderActionError, setOrderActionError] = useState(null)
  const [orderActionSuccess, setOrderActionSuccess] = useState(null)

  const handleOpenCreate = () => {
    setIsCreating(true)
    setIsCreateMediaBusy(false)
    setCreateForm({
      collection: '',
      imageKey: null,
      imageUrl: '',
      isPurchasable: true,
      name: '',
      priceVnd: '',
      shortDescription: '',
      slug: '',
      status: 'available',
    })
    setCreateError(null)
    setSaveSuccess(null)
    setIsSlugManuallyEdited(false)
    setShowCustomSlug(false)
  }

  const handleCancelCreate = () => {
    if (createForm.imageKey) {
      void cleanupAdminMediaKeys([createForm.imageKey])
    }
    setIsCreating(false)
    setIsCreateMediaBusy(false)
    setCreateError(null)
    setIsSlugManuallyEdited(false)
    setShowCustomSlug(false)
  }

  const handleNameChange = (name) => {
    setCreateForm((prev) => {
      const next = { ...prev, name }
      if (!isSlugManuallyEdited) {
        next.slug = generateSlug(name)
      }
      return next
    })
  }

  const handleSlugChange = (slug) => {
    setIsSlugManuallyEdited(true)
    setCreateForm((prev) => ({ ...prev, slug: slug.toLowerCase() }))
  }

  const handleResetSlugToName = () => {
    setIsSlugManuallyEdited(false)
    setCreateForm((prev) => ({ ...prev, slug: generateSlug(prev.name) }))
  }

  const handleSaveCreate = async (e) => {
    e?.preventDefault()
    if (!createForm.name.trim()) {
      setCreateError('Tên sản phẩm không được để trống.')
      return
    }

    const slug = createForm.slug.trim().toLowerCase()
    const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
    if (!slug || !SLUG_REGEX.test(slug)) {
      setCreateError('Slug sản phẩm không hợp lệ (chỉ chứa chữ thường, số và dấu gạch ngang).')
      return
    }

    if (slug === 'no-watering-flower') {
      setCreateError('Không thể tạo sản phẩm trùng slug với sản phẩm được bảo vệ.')
      return
    }

    const price = Number(createForm.priceVnd)
    if (!Number.isInteger(price) || price <= 0) {
      setCreateError('Giá sản phẩm phải là số nguyên dương hợp lệ.')
      return
    }

    setIsSubmittingCreate(true)
    setCreateError(null)

    const payload = {
      collection: createForm.collection.trim() || undefined,
      imageUrl: createForm.imageUrl.trim() || undefined,
      isPurchasable: createForm.isPurchasable,
      name: createForm.name.trim(),
      priceVnd: price,
      shortDescription: createForm.shortDescription.trim() || undefined,
      slug,
      status: createForm.status,
    }

    const result = await createAdminProduct(payload, { getToken })
    setIsSubmittingCreate(false)

    if (!result.ok || !result.product) {
      if (createForm.imageKey) {
        await cleanupAdminMediaKeys([createForm.imageKey])
        setCreateForm((prev) => ({ ...prev, imageKey: null, imageUrl: '' }))
      }
    }

    if (result.ok && result.product) {
      setProducts((prev) => [result.product, ...prev])
      setIsCreating(false)
      setIsCreateMediaBusy(false)
      setSaveSuccess(`Đã tạo thành công sản phẩm "${result.product.name}".`)
    } else {
      setCreateError(result.error?.message || 'Không thể tạo sản phẩm mới.')
    }
  }

  const getManagedMediaKey = (src) => {
    if (typeof src !== 'string') return null
    const match = /^\/api\/v1\/media\/(prod_media_[A-Za-z0-9_-]+\.(?:jpg|png|webp))$/u.exec(src)
    return match?.[1] ?? null
  }

  const cleanupAdminMediaKeys = async (keys) => {
    const uniqueKeys = [...new Set(Array.isArray(keys) ? keys : [])].filter(Boolean)
    await Promise.all(uniqueKeys.map((key) => deleteAdminMedia(key, { getToken }).catch(() => null)))
  }

  const handleStartEdit = (product) => {
    const originalMedia = Array.isArray(product.media) ? product.media : []
    setEditingProduct(product)
    setIsEditMediaBusy(false)
    setEditForm({
      careNote: product.careNote ?? '',
      collection: product.collection ?? '',
      colors: Array.isArray(product.colors) ? product.colors.join(', ') : '',
      composition: Array.isArray(product.composition) ? product.composition.join(', ') : '',
      deliveryNote: product.deliveryNote ?? '',
      description: product.description ?? '',
      mediaChanged: false,
      media: [...originalMedia],
      internalNote: product.internalNote ?? '',
      isPurchasable: Boolean(product.isPurchasable),
      moods: Array.isArray(product.moods) ? product.moods.join(', ') : '',
      name: product.name ?? '',
      occasions: Array.isArray(product.occasions) ? product.occasions.join(', ') : '',
      originalMedia,
      priceVnd: product.priceVnd ?? '',
      shortDescription: product.shortDescription ?? '',
      stagedMediaKeys: [],
      status: product.status ?? 'available',
    })
    setSaveError(null)
    setSaveSuccess(null)
  }

  const handleCancelEdit = () => {
    if (isSaving || isEditMediaBusy) return
    if (editForm?.stagedMediaKeys?.length) {
      void cleanupAdminMediaKeys(editForm.stagedMediaKeys)
    }
    setEditingProduct(null)
    setIsEditMediaBusy(false)
    setEditForm(null)
    setSaveError(null)
  }

  const handleSaveEdit = async (e) => {
    e?.preventDefault()
    if (!editingProduct || !editForm) return

    const isPriceless = editingProduct.purchaseType === 'priceless' || editingProduct.slug === 'no-watering-flower'

    if (!editForm.name.trim()) {
      setSaveError('Tên sản phẩm không được để trống.')
      return
    }

    let price = null
    if (!isPriceless) {
      price = Number(editForm.priceVnd)
      if (!Number.isInteger(price) || price <= 0) {
        setSaveError('Giá sản phẩm phải là số nguyên dương hợp lệ.')
        return
      }
    }

    if (editForm.shortDescription.length > 320) {
      setSaveError('Mô tả ngắn tối đa 320 ký tự.')
      return
    }

    if (editForm.description.length > 1200) {
      setSaveError('Mô tả chi tiết tối đa 1200 ký tự.')
      return
    }

    if (editForm.collection.length > 160) {
      setSaveError('Bộ sưu tập tối đa 160 ký tự.')
      return
    }

    if (editForm.careNote.length > 800) {
      setSaveError('Hướng dẫn chăm sóc tối đa 800 ký tự.')
      return
    }

    if (editForm.deliveryNote.length > 800) {
      setSaveError('Thông tin giao hoa tối đa 800 ký tự.')
      return
    }

    if (editForm.internalNote.length > 800) {
      setSaveError('Ghi chú nội bộ tối đa 800 ký tự.')
      return
    }

    setIsSaving(true)
    setSaveError(null)

    const parseCommaList = (str) =>
      typeof str === 'string'
        ? str.split(/[,;\n]/u).map((s) => s.trim()).filter(Boolean)
        : []

    const payload = {
      careNote: editForm.careNote.trim(),
      collection: editForm.collection.trim(),
      colors: parseCommaList(editForm.colors),
      composition: parseCommaList(editForm.composition),
      deliveryNote: editForm.deliveryNote.trim(),
      description: editForm.description.trim(),
      internalNote: editForm.internalNote.trim(),
      name: editForm.name.trim(),
      moods: parseCommaList(editForm.moods),
      occasions: parseCommaList(editForm.occasions),
      shortDescription: editForm.shortDescription.trim(),
      status: editForm.status,
    }

    if (!isPriceless) {
      payload.priceVnd = price
      // Preserve archived state (active = 0) unless product is active and user checked isPurchasable
      payload.isPurchasable = editingProduct.active ? editForm.isPurchasable : (editForm.isPurchasable && editingProduct.active)
    }

    if (editForm.mediaChanged) {
      payload.media = editForm.media
    }

    const productId = editingProduct.id
    const result = await updateAdminProduct(productId, payload, { getToken })

    if (!result.ok || !result.product) {
      await cleanupAdminMediaKeys(editForm.stagedMediaKeys)
      setEditForm((prev) => ({
        ...prev,
        mediaChanged: false,
        media: [...prev.originalMedia],
        stagedMediaKeys: [],
      }))
    }

    if (result.ok && result.product) {
      const retained = new Set(result.product.media.map((item) => item.src))
      const removedKeys = editForm.originalMedia
        .filter((item) => !retained.has(item.src))
        .map((item) => getManagedMediaKey(item.src))
      const abandonedKeys = editForm.stagedMediaKeys
        .filter((key) => !retained.has(`/api/v1/media/${key}`))
      await cleanupAdminMediaKeys([...removedKeys, ...abandonedKeys])
      setProducts((prev) => prev.map((p) => (p.id === result.product.id ? result.product : p)))
      setEditingProduct(null)
      setIsEditMediaBusy(false)
      setEditForm(null)
      setSaveSuccess(`Đã cập nhật thành công "${result.product.name}".`)
    } else {
      setSaveError(result.error?.message || 'Không thể cập nhật sản phẩm.')
    }
    setIsSaving(false)
  }

  const requestPermanentDelete = (kind, record) => {
    if (kind === 'product' && record.slug === 'no-watering-flower') return
    setDeleteError(null)
    setDeleteTarget({ id: record.id, kind, label: kind === 'order' ? record.orderCode : record.name })
  }

  const cancelPermanentDelete = () => {
    if (isDeleting) return
    setDeleteTarget(null)
    setDeleteError(null)
  }

  const confirmPermanentDelete = async () => {
    if (!deleteTarget || isDeleting) return
    setIsDeleting(true)
    setDeleteError(null)

    const result = deleteTarget.kind === 'order'
      ? await deleteAdminOrder(deleteTarget.id, { getToken })
      : deleteTarget.kind === 'gift'
        ? await deleteAdminGiftAddOn(deleteTarget.id, { getToken })
        : await deleteAdminProduct(deleteTarget.id, { getToken })

    setIsDeleting(false)
    if (!result.ok) {
      setDeleteError(result.error?.message || 'Không thể xóa dữ liệu.')
      return
    }

    if (deleteTarget.kind === 'order') {
      setOrders((current) => current.filter((order) => order.id !== deleteTarget.id))
      if (selectedOrderDetail?.id === deleteTarget.id) handleCloseOrderDetail()
    } else if (deleteTarget.kind === 'gift') {
      setGiftAddOns((current) => current.filter((item) => item.id !== deleteTarget.id))
      setSaveSuccess(`Đã xóa vĩnh viễn món quà “${deleteTarget.label}”.`)
    } else {
      setProducts((current) => current.filter((product) => product.id !== deleteTarget.id))
      setSaveSuccess(result.mediaCleanupComplete === false
        ? 'Đã xóa sản phẩm. Một số tệp ảnh chưa thể xóa khỏi kho lưu trữ.'
        : `Đã xóa vĩnh viễn sản phẩm “${deleteTarget.label}”.`)
    }

    setDeleteTarget(null)
    setDeleteError(null)
  }

  const handleProtectedVisibility = async (product) => {
    if (product.slug !== 'no-watering-flower' || visibilityBusyId) return
    setVisibilityBusyId(product.id)
    setVisibilityError(null)
    setSaveSuccess(null)
    const result = await setAdminProductArchived(product.id, product.active, { getToken })
    setVisibilityBusyId(null)
    if (!result.ok || !result.product) {
      setVisibilityError(result.error?.message || 'Không thể thay đổi hiển thị sản phẩm.')
      return
    }
    setProducts((current) => current.map((item) => item.id === result.product.id ? result.product : item))
    setSaveSuccess(product.active ? 'Đã ẩn sản phẩm khỏi cửa hàng.' : 'Đã hiện lại sản phẩm trong cửa hàng.')
  }

  // 1. Authoritative Server Permission Verification
  useEffect(() => {
    let isCancelled = false

    if (!isLoaded || !isSignedIn) {
      return undefined
    }

    checkAdminAccess({ getToken })
      .then((result) => {
        if (isCancelled) return

        if (result.ok && result.authorized) {
          setAdminUser(result.user)
          setAuthStatus('authorized')
          setIsCatalogueLoading(true)
          setAuthError(null)
        } else if (result.status === 403) {
          setAdminUser(null)
          setAuthStatus('forbidden')
          setAuthError(result.error)
        } else {
          setAdminUser(null)
          setAuthStatus('error')
          setAuthError(result.error)
        }
      })
      .catch(() => {
        if (isCancelled) return
        setAdminUser(null)
        setAuthStatus('error')
        setAuthError({ code: 'NETWORK_ERROR', message: 'Không thể kết nối đến máy chủ xác thực.' })
      })

    return () => {
      isCancelled = true
    }
  }, [isLoaded, isSignedIn, getToken, authReloadKey])

  // 2. Fetch D1 Catalogue strictly after Admin Authorization
  useEffect(() => {
    let isCancelled = false

    if (authStatus !== 'authorized') {
      return undefined
    }

    const controller = new AbortController()

    fetchAdminCatalogue({ getToken, signal: controller.signal })
      .then((result) => {
        if (isCancelled) return

        if (result.ok && Array.isArray(result.data)) {
          setProducts(result.data)
          setCatalogueError(null)
        } else {
          setProducts([])
          setCatalogueError(result.error)
        }
      })
      .catch((err) => {
        if (isCancelled || err?.name === 'AbortError') return
        setProducts([])
        setCatalogueError({ code: 'NETWORK_ERROR', message: 'Không thể kết nối đến máy chủ để tải danh mục.' })
      })
      .finally(() => {
        if (!isCancelled) {
          setIsCatalogueLoading(false)
        }
      })

    return () => {
      isCancelled = true
      controller.abort()
    }
  }, [authStatus, catalogueReloadKey, getToken])

  const handleRetryAuth = useCallback(() => {
    setAuthReloadKey((k) => k + 1)
  }, [])

  const handleRetryCatalogue = useCallback(() => {
    setIsCatalogueLoading(true)
    setCatalogueError(null)
    setCatalogueReloadKey((k) => k + 1)
  }, [])

  // 3. Fetch D1 Gift Add-Ons strictly after Admin Authorization
  useEffect(() => {
    let isCancelled = false
    if (authStatus !== 'authorized') return undefined

    fetchAdminGiftAddOns({ getToken })
      .then((result) => {
        if (isCancelled) return
        if (result.ok && Array.isArray(result.items)) {
          setGiftAddOns(result.items)
          setGiftAddOnsError(null)
        } else {
          setGiftAddOns([])
          setGiftAddOnsError(result.error)
        }
      })
      .catch(() => {
        if (isCancelled) return
        setGiftAddOns([])
        setGiftAddOnsError({ code: 'NETWORK_ERROR', message: 'Không thể kết nối đến máy chủ để tải quà tặng kèm.' })
      })
      .finally(() => {
        if (!isCancelled) setIsLoadingGiftAddOns(false)
      })

    return () => {
      isCancelled = true
    }
  }, [authStatus, giftAddOnsReloadKey, getToken])

  const handleRetryGiftAddOns = useCallback(() => {
    setIsLoadingGiftAddOns(true)
    setGiftAddOnsError(null)
    setGiftAddOnsReloadKey((k) => k + 1)
  }, [])

  // 4. Fetch Orders strictly after Admin Authorization
  useEffect(() => {
    let isCancelled = false
    if (authStatus !== 'authorized') return undefined

    const controller = new AbortController()

    fetchAdminOrders({ getToken, signal: controller.signal })
      .then((result) => {
        if (isCancelled) return
        if (result.ok && Array.isArray(result.orders)) {
          setOrders(result.orders)
          setOrdersError(null)
        } else {
          setOrders([])
          setOrdersError(result.error)
        }
      })
      .catch((err) => {
        if (isCancelled || err?.name === 'AbortError') return
        setOrders([])
        setOrdersError({ code: 'NETWORK_ERROR', message: 'Không thể kết nối đến máy chủ để tải danh sách đơn hàng.' })
      })
      .finally(() => {
        if (!isCancelled) setIsLoadingOrders(false)
      })

    return () => {
      isCancelled = true
      controller.abort()
    }
  }, [authStatus, ordersReloadKey, getToken])

  const handleRetryOrders = useCallback(() => {
    setIsLoadingOrders(true)
    setOrdersError(null)
    setOrdersReloadKey((k) => k + 1)
  }, [])

  const handleOpenOrderDetail = async (order) => {
    setSelectedOrderDetail(order)
    setIsLoadingOrderDetail(true)
    setOrderDetailError(null)
    setOrderActionError(null)
    setOrderActionSuccess(null)

    const result = await fetchAdminOrderDetail(order.id, { getToken })
    setIsLoadingOrderDetail(false)

    if (result.ok && result.order) {
      setSelectedOrderDetail(result.order)
    } else {
      setOrderDetailError(result.error?.message || 'Không thể tải chi tiết đơn hàng.')
    }
  }

  const handleCloseOrderDetail = () => {
    setSelectedOrderDetail(null)
    setIsLoadingOrderDetail(false)
    setOrderDetailError(null)
    setOrderActionError(null)
    setOrderActionSuccess(null)
  }

  const handleConfirmOrderPayment = async (orderId) => {
    setIsUpdatingOrder(true)
    setOrderActionError(null)
    setOrderActionSuccess(null)

    const result = await confirmAdminOrderPayment(orderId, { getToken })
    setIsUpdatingOrder(false)

    if (result.ok && result.order) {
      setSelectedOrderDetail(result.order)
      setOrders((prev) => prev.map((o) => (o.id === result.order.id ? { ...o, paymentStatus: result.order.paymentStatus, status: result.order.status } : o)))
      setOrderActionSuccess('Đã xác nhận thanh toán thành công. Đơn hàng chuyển sang trạng thái Đang chuẩn bị.')
    } else {
      setOrderActionError(result.error?.message || 'Không thể xác nhận thanh toán.')
    }
  }

  const handleUpdateOrderStatus = async (orderId, nextStatus) => {
    setIsUpdatingOrder(true)
    setOrderActionError(null)
    setOrderActionSuccess(null)

    const result = await updateAdminOrderStatus(orderId, nextStatus, { getToken })
    setIsUpdatingOrder(false)

    if (result.ok && result.order) {
      setSelectedOrderDetail(result.order)
      setOrders((prev) => prev.map((o) => (o.id === result.order.id ? { ...o, status: result.order.status } : o)))
      setOrderActionSuccess(`Đã chuyển trạng thái đơn hàng sang: ${formatOrderStatus(nextStatus)}.`)
    } else {
      setOrderActionError(result.error?.message || 'Không thể cập nhật trạng thái đơn hoa.')
    }
  }

  // Product Variants Handlers
  const handleOpenVariants = async (product) => {
    setConfiguringProduct(product)
    setIsLoadingVariants(true)
    setVariantsError(null)
    setVariantsSuccess(null)

    const result = await fetchAdminProductVariants(product.id, { getToken })
    setIsLoadingVariants(false)

    if (result.ok && Array.isArray(result.variants)) {
      setVariantsForm(result.variants)
    } else {
      setVariantsForm([])
      setVariantsError(result.error?.message || 'Không thể tải tùy chọn của sản phẩm.')
    }
  }

  const handleCloseVariants = () => {
    setConfiguringProduct(null)
    setVariantsForm([])
    setVariantsError(null)
    setVariantsSuccess(null)
  }

  const handleAddSizeVariant = () => {
    setVariantsForm((prev) => [
      ...prev,
      {
        active: true,
        code: `size-${Date.now().toString(36)}`,
        label: 'Cỡ mới',
        note: '',
        optionType: 'size',
        priceVnd: configuringProduct?.priceVnd ?? 500000,
        sortOrder: prev.filter((v) => v.optionType === 'size').length,
      },
    ])
  }

  const handleAddWrappingVariant = () => {
    setVariantsForm((prev) => [
      ...prev,
      {
        active: true,
        code: `wrap-${Date.now().toString(36)}`,
        label: 'Kiểu gói mới',
        note: '',
        optionType: 'wrapping',
        priceVnd: null,
        sortOrder: prev.filter((v) => v.optionType === 'wrapping').length,
      },
    ])
  }

  const handleVariantChange = (index, field, value) => {
    setVariantsForm((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const handleRemoveVariant = (index) => {
    setVariantsForm((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSaveVariants = async () => {
    if (!configuringProduct) return
    setIsSavingVariants(true)
    setVariantsError(null)
    setVariantsSuccess(null)

    for (const v of variantsForm) {
      if (!v.label?.trim()) {
        setVariantsError('Tên tùy chọn không được để trống.')
        setIsSavingVariants(false)
        return
      }
      if (v.optionType === 'size') {
        const price = Number(v.priceVnd)
        if (!Number.isInteger(price) || price < 0) {
          setVariantsError('Giá kích thước phải là số nguyên không âm.')
          setIsSavingVariants(false)
          return
        }
      }
    }

    const payload = variantsForm.map((v) => ({
      ...v,
      label: v.label.trim(),
      note: v.note?.trim() || null,
      priceVnd: v.optionType === 'size' ? Number(v.priceVnd) : null,
    }))

    const result = await saveAdminProductVariants(configuringProduct.id, payload, { getToken })
    setIsSavingVariants(false)

    if (result.ok && Array.isArray(result.variants)) {
      setVariantsForm(result.variants)
      setVariantsSuccess('Đã lưu thành công các tùy chọn sản phẩm.')
    } else {
      setVariantsError(result.error?.message || 'Không thể lưu tùy chọn sản phẩm.')
    }
  }

  // Gift Add-ons Handlers
  const handleOpenCreateGiftAddOn = () => {
    setIsCreatingGiftAddOn(true)
    setCreateGiftAddOnForm({
      active: true,
      name: '',
      priceVnd: 0,
      shortDescription: '',
    })
    setCreateGiftAddOnError(null)
  }

  const handleCancelCreateGiftAddOn = () => {
    setIsCreatingGiftAddOn(false)
    setCreateGiftAddOnError(null)
  }

  const handleSaveCreateGiftAddOn = async (e) => {
    e?.preventDefault()
    if (!createGiftAddOnForm.name.trim()) {
      setCreateGiftAddOnError('Tên món quà không được để trống.')
      return
    }
    const price = Number(createGiftAddOnForm.priceVnd)
    if (!Number.isInteger(price) || price < 0) {
      setCreateGiftAddOnError('Giá món quà phải là số nguyên không âm (0 là miễn phí).')
      return
    }

    setIsSubmittingGiftAddOn(true)
    setCreateGiftAddOnError(null)

    const result = await createAdminGiftAddOn({
      active: createGiftAddOnForm.active,
      name: createGiftAddOnForm.name.trim(),
      priceVnd: price,
      shortDescription: createGiftAddOnForm.shortDescription.trim() || undefined,
    }, { getToken })

    setIsSubmittingGiftAddOn(false)

    if (result.ok && result.item) {
      setGiftAddOns((prev) => [...prev, result.item])
      setIsCreatingGiftAddOn(false)
      setSaveSuccess(`Đã tạo thành công món quà "${result.item.name}".`)
    } else {
      setCreateGiftAddOnError(result.error?.message || 'Không thể tạo món quà mới.')
    }
  }

  const handleStartEditGiftAddOn = (item) => {
    setEditingGiftAddOnId(item.id)
    setEditGiftAddOnForm({
      active: Boolean(item.active),
      name: item.name,
      priceVnd: item.priceVnd ?? 0,
      shortDescription: item.shortDescription ?? '',
    })
    setGiftAddOnSaveError(null)
  }

  const handleCancelEditGiftAddOn = () => {
    setEditingGiftAddOnId(null)
    setEditGiftAddOnForm(null)
    setGiftAddOnSaveError(null)
  }

  const handleSaveEditGiftAddOn = async (id) => {
    if (!editGiftAddOnForm) return
    if (!editGiftAddOnForm.name.trim()) {
      setGiftAddOnSaveError('Tên món quà không được để trống.')
      return
    }
    const price = Number(editGiftAddOnForm.priceVnd)
    if (!Number.isInteger(price) || price < 0) {
      setGiftAddOnSaveError('Giá món quà phải là số nguyên không âm.')
      return
    }

    setIsSavingGiftAddOn(true)
    setGiftAddOnSaveError(null)

    const result = await updateAdminGiftAddOn(id, {
      active: editGiftAddOnForm.active,
      name: editGiftAddOnForm.name.trim(),
      priceVnd: price,
      shortDescription: editGiftAddOnForm.shortDescription.trim(),
    }, { getToken })

    setIsSavingGiftAddOn(false)

    if (result.ok && result.item) {
      setGiftAddOns((prev) => prev.map((g) => (g.id === result.item.id ? result.item : g)))
      setEditingGiftAddOnId(null)
      setEditGiftAddOnForm(null)
      setSaveSuccess(`Đã cập nhật món quà "${result.item.name}".`)
    } else {
      setGiftAddOnSaveError(result.error?.message || 'Không thể cập nhật món quà.')
    }
  }

  const handleToggleGiftAddOnActive = async (item) => {
    const nextActive = !item.active
    setTogglingGiftAddOnId(item.id)
    setGiftAddOnToggleError(null)
    setSaveSuccess(null)
    const result = await toggleAdminGiftAddOnActive(item.id, nextActive, { getToken })
    setTogglingGiftAddOnId(null)
    if (!result.ok || !result.item) {
      setGiftAddOnToggleError(result.error?.message || 'Không thể thay đổi trạng thái món quà.')
      return
    }
    if (result.ok && result.item) {
      setGiftAddOns((prev) => prev.map((g) => (g.id === result.item.id ? result.item : g)))
      setSaveSuccess(`Đã ${nextActive ? 'hiện' : 'ẩn'} món quà "${item.name}".`)
    }
  }

  // Guard: Unauthenticated when Clerk loaded -> redirect to /login
  if (isLoaded && !isSignedIn) {
    return <Navigate to="/login" replace />
  }

  // Guard / View: Loading permission check (NO catalogue content is rendered)
  if (!isLoaded || authStatus === 'loading') {
    return (
      <main className="admin-page">
        <Container>
          <header className="admin-page__header">
            <p className="eyebrow">Hệ thống quản trị</p>
            <h1>Quản lý Hut Flower</h1>
          </header>
          <div className="admin-state-container admin-loading" role="status">
            <h2>Đang kiểm tra quyền truy cập...</h2>
            <p>Hệ thống đang xác thực quyền quản trị từ máy chủ. Vui lòng chờ trong giây lát.</p>
          </div>
        </Container>
      </main>
    )
  }

  // View: Customer / Forbidden (403) (NO catalogue content is rendered)
  if (authStatus === 'forbidden') {
    return (
      <main className="admin-page">
        <Container>
          <header className="admin-page__header">
            <p className="eyebrow">Quyền truy cập</p>
            <h1>Không có quyền truy cập</h1>
          </header>
          <div className="admin-state-container admin-forbidden" role="alert">
            <h2>Khu vực dành riêng cho quản trị viên</h2>
            <p>
              {authError?.message || 'Tài khoản của bạn không có quyền truy cập vào bảng điều khiển quản trị.'}
            </p>
            <div className="admin-state-actions">
              <Link className="button button--primary" to="/">
                Về trang chủ
              </Link>
              <Link className="button button--secondary" to="/account">
                Tài khoản của bạn
              </Link>
            </div>
          </div>
        </Container>
      </main>
    )
  }

  // View: Auth Error (NO catalogue content is rendered)
  if (authStatus === 'error') {
    return (
      <main className="admin-page">
        <Container>
          <header className="admin-page__header">
            <p className="eyebrow">Lỗi xác thực</p>
            <h1>Không thể xác thực quyền quản trị</h1>
          </header>
          <div className="admin-state-container admin-error" role="alert">
            <h2>Đã xảy ra lỗi khi kiểm tra quyền</h2>
            <p>
              {authError?.message || 'Không thể kết nối đến máy chủ để xác thực quyền quản trị.'}
            </p>
            <button className="button button--primary" onClick={handleRetryAuth} type="button">
              Thử lại
            </button>
          </div>
        </Container>
      </main>
    )
  }

  // View: Authorized Admin Dashboard
  return (
    <main className="admin-page">
      <Container>
        <header className="admin-page__header">
          <p className="eyebrow">Hệ thống quản trị</p>
          <h1>Quản lý Hut Flower</h1>
        </header>

        {/* Admin Identity Summary */}
        <section aria-label="Thông tin tài khoản quản trị" className="admin-identity">
          <div className="admin-identity__item">
            <span className="admin-identity__label">Mã quản trị viên (D1 ID)</span>
            <span className="admin-identity__value">
              <code>{adminUser?.id || '—'}</code>
            </span>
          </div>
          <div className="admin-identity__item">
            <span className="admin-identity__label">Vai trò hệ thống</span>
            <span className="admin-identity__value">
              <span className="admin-badge admin-badge--available">
                {adminUser?.role === 'admin' ? 'Quản trị viên (admin)' : adminUser?.role}
              </span>
            </span>
          </div>
          <div className="admin-identity__item">
            <span className="admin-identity__label">Trạng thái tài khoản</span>
            <span className="admin-identity__value">
              {adminUser?.status === 'active' ? 'Hoạt động (active)' : adminUser?.status}
            </span>
          </div>
          {contextUser?.email && (
            <div className="admin-identity__item">
              <span className="admin-identity__label">Email liên kết</span>
              <span className="admin-identity__value">{contextUser.email}</span>
            </div>
          )}
        </section>

        <AdminConsultations getToken={getToken} />

        {/* Orders Fulfilment Section */}
        <section aria-labelledby="orders-mgmt-title" className="admin-orders-section">
          <div className="admin-catalogue-header">
            <div>
              <h2 id="orders-mgmt-title">Quản lý đơn hàng (Fulfilment)</h2>
              <p className="admin-section-sub">
                Theo dõi đơn hoa, xác nhận thanh toán chuyển khoản và điều phối quy trình giao hàng.
              </p>
            </div>
            <div className="admin-catalogue-header-actions">
              {!isLoadingOrders && !ordersError && (
                <span className="admin-catalogue-count">
                  {orders.length} đơn hàng
                </span>
              )}
              <button
                className="button button--secondary button--small"
                disabled={isLoadingOrders}
                type="button"
                onClick={handleRetryOrders}
              >
                Làm mới
              </button>
            </div>
          </div>

          {isLoadingOrders && (
            <div className="admin-catalogue-loading" role="status">
              <p>Đang tải danh sách đơn hàng từ D1...</p>
            </div>
          )}

          {!isLoadingOrders && ordersError && (
            <div className="admin-catalogue-error" role="alert">
              <h3>Không thể tải danh sách đơn hàng</h3>
              <p>{ordersError?.message || 'Lỗi kết nối máy chủ.'}</p>
              <button className="button button--secondary" type="button" onClick={handleRetryOrders}>
                Thử lại
              </button>
            </div>
          )}

          {!isLoadingOrders && !ordersError && orders.length === 0 && (
            <div className="admin-orders-empty" role="status">
              <p>Chưa có đơn hàng nào trong hệ thống.</p>
            </div>
          )}

          {!isLoadingOrders && !ordersError && orders.length > 0 && (
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Mã đơn hàng</th>
                    <th scope="col">Thời gian đặt</th>
                    <th scope="col">Giao hoa</th>
                    <th scope="col">Số lượng</th>
                    <th scope="col">Tổng tiền</th>
                    <th scope="col">Thanh toán</th>
                    <th scope="col">Trạng thái</th>
                    <th scope="col">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => {
                    const isPaid = order.paymentStatus === 'paid'
                    return (
                      <tr key={order.id}>
                        <td>
                          <code className="admin-order-code">{order.orderCode}</code>
                          {order.customerType === 'guest' && <span className="admin-order-date">Khách không tài khoản</span>}
                        </td>
                        <td>
                          <span className="admin-order-date">
                            {order.createdAtUtc ? new Date(order.createdAtUtc).toLocaleString('vi-VN', {
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                            }) : '—'}
                          </span>
                        </td>
                        <td>
                          <div className="admin-order-delivery-cell">
                            <span>{formatDeliveryDate(order.deliveryDate)}</span>
                            {order.deliverySlot && (
                              <span className="admin-order-delivery-slot">{formatDeliverySlot(order.deliverySlot)}</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span>{order.itemCount ?? order.items?.length ?? 1} bó</span>
                        </td>
                        <td>
                          <span className="admin-price">{formatCurrency(order.totalVnd)}</span>
                        </td>
                        <td>
                          <span className={`admin-badge admin-badge--payment-${isPaid ? 'paid' : 'pending'}`}>
                            {formatPaymentStatus(order.paymentStatus)}
                          </span>
                        </td>
                        <td>
                          <span className={`admin-badge admin-badge--order-${order.status || 'received'}`}>
                            {formatOrderStatus(order.status)}
                          </span>
                        </td>
                        <td>
                          <button
                            className="button button--text button--small admin-delete-btn"
                            disabled={isDeleting}
                            type="button"
                            onClick={() => requestPermanentDelete('order', order)}
                          >
                            Xóa
                          </button>
                          <button
                            className="button button--secondary button--small admin-view-order-btn"
                            type="button"
                            onClick={() => handleOpenOrderDetail(order)}
                          >
                            Xem chi tiết
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Catalogue Management Section */}
        <section aria-labelledby="catalogue-mgmt-title" className="admin-catalogue-section">
          <div className="admin-catalogue-header">
            <div>
              <h2 id="catalogue-mgmt-title">Danh mục sản phẩm D1</h2>
            </div>
            <div className="admin-catalogue-header-actions">
              {!isCatalogueLoading && !catalogueError && (
                <span className="admin-catalogue-count">
                  {products.length} sản phẩm
                </span>
              )}
              {!isCatalogueLoading && !catalogueError && !isCreating && (
                <button
                  className="button button--primary button--small admin-add-btn"
                  type="button"
                  onClick={handleOpenCreate}
                >
                  Thêm sản phẩm
                </button>
              )}
            </div>
          </div>

          {isCatalogueLoading && (
            <div className="admin-catalogue-loading" role="status">
              <p>Đang tải danh mục sản phẩm từ máy chủ D1...</p>
            </div>
          )}

          {!isCatalogueLoading && catalogueError && (
            <div className="admin-catalogue-error" role="alert">
              <h3>Không thể tải danh mục sản phẩm D1</h3>
              <p>{catalogueError?.message || 'Lỗi kết nối máy chủ danh mục.'}</p>
              <button className="button button--secondary" onClick={handleRetryCatalogue} type="button">
                Thử lại
              </button>
            </div>
          )}

          {saveSuccess && (
            <div className="admin-save-success" role="status">
              <p>{saveSuccess}</p>
            </div>
          )}
          {visibilityError && (
            <div className="admin-catalogue-error admin-catalogue-error--compact" role="alert">
              <p>{visibilityError}</p>
            </div>
          )}

          {isCreating && (
            <section aria-label="Tạo sản phẩm mới" className="admin-create-panel">
              <div className="admin-create-panel__header">
                <h3>Thêm sản phẩm mới vào D1</h3>
                <p>Điền thông tin để tạo sản phẩm bán thông thường.</p>
              </div>
              <form className="admin-create-form" onSubmit={handleSaveCreate}>
                <div className="admin-form-grid">
                  <div className="admin-form-group">
                    <label htmlFor="create-name">
                      Tên sản phẩm <span className="admin-required">*</span>
                    </label>
                    <input
                      id="create-name"
                      className="admin-input-text"
                      disabled={isSubmittingCreate}
                      maxLength={160}
                      placeholder="Ví dụ: Nắng Dịu Ban Mai"
                      required
                      type="text"
                      value={createForm.name}
                      onChange={(e) => handleNameChange(e.target.value)}
                    />
                    <div className="admin-slug-preview-row">
                      <span className="admin-slug-preview">
                        Đường dẫn: <code>/san-pham/{createForm.slug || '...'}</code>
                      </span>
                      {!showCustomSlug ? (
                        <button
                          className="button button--text button--small admin-slug-toggle"
                          type="button"
                          onClick={() => setShowCustomSlug(true)}
                        >
                          Tùy chỉnh đường dẫn
                        </button>
                      ) : (
                        <button
                          className="button button--text button--small admin-slug-reset"
                          title="Tạo lại đường dẫn dựa trên tên sản phẩm hiện tại"
                          type="button"
                          onClick={handleResetSlugToName}
                        >
                          Đặt lại theo tên sản phẩm
                        </button>
                      )}
                    </div>
                  </div>

                  {showCustomSlug && (
                    <div className="admin-form-group admin-custom-slug-panel">
                      <label htmlFor="create-slug">Đường dẫn</label>
                      <input
                        id="create-slug"
                        className="admin-input-text"
                        disabled={isSubmittingCreate}
                        maxLength={100}
                        placeholder="nang-diu-ban-mai"
                        type="text"
                        value={createForm.slug}
                        onChange={(e) => handleSlugChange(e.target.value)}
                      />
                      <span className="admin-helper-text">
                        Đường dẫn được tự tạo từ tên sản phẩm.
                      </span>
                    </div>
                  )}

                  <div className="admin-form-group">
                    <label htmlFor="create-price">
                      Giá niêm yết (VND) <span className="admin-required">*</span>
                    </label>
                    <input
                      id="create-price"
                      className="admin-input-text"
                      disabled={isSubmittingCreate}
                      min="1000"
                      placeholder="Ví dụ: 650000"
                      required
                      step="1000"
                      type="number"
                      value={createForm.priceVnd}
                      onChange={(e) => setCreateForm((f) => ({ ...f, priceVnd: e.target.value }))}
                    />
                  </div>

                  <div className="admin-form-group">
                    <label htmlFor="create-status">Trạng thái</label>
                    <select
                      id="create-status"
                      className="admin-select-status"
                      disabled={isSubmittingCreate}
                      value={createForm.status}
                      onChange={(e) => setCreateForm((f) => ({ ...f, status: e.target.value }))}
                    >
                      <option value="available">Có sẵn</option>
                      <option value="seasonal">Theo mùa</option>
                      <option value="preorder">Đặt trước</option>
                    </select>
                  </div>

                  <div className="admin-form-group">
                    <label htmlFor="create-collection">Bộ sưu tập</label>
                    <input
                      id="create-collection"
                      className="admin-input-text"
                      disabled={isSubmittingCreate}
                      maxLength={160}
                      placeholder="Ví dụ: Những ngày tươi sáng"
                      type="text"
                      value={createForm.collection}
                      onChange={(e) => setCreateForm((f) => ({ ...f, collection: e.target.value }))}
                    />
                  </div>

                  <div className="admin-form-group admin-form-group--uploader">
                    <ProductImageUploader
                      disabled={isSubmittingCreate || isCreateMediaBusy}
                      getToken={getToken}
                      mediaKey={createForm.imageKey}
                      onBusyChange={setIsCreateMediaBusy}
                      value={createForm.imageUrl}
                      onChange={({ key, url }) =>
                        setCreateForm((f) => ({ ...f, imageKey: key, imageUrl: url }))
                      }
                    />
                  </div>
                </div>

                <div className="admin-form-group admin-form-group--full">
                  <label htmlFor="create-short-desc">Mô tả ngắn</label>
                  <input
                    id="create-short-desc"
                    className="admin-input-text"
                    disabled={isSubmittingCreate || isCreateMediaBusy}
                    maxLength={320}
                    placeholder="Mô tả tóm tắt về loại hoa, màu sắc..."
                    type="text"
                    value={createForm.shortDescription}
                    onChange={(e) => setCreateForm((f) => ({ ...f, shortDescription: e.target.value }))}
                  />
                </div>

                <div className="admin-form-group admin-form-group--checkbox">
                  <label className="admin-checkbox-label">
                    <input
                      checked={createForm.isPurchasable}
                      disabled={isSubmittingCreate}
                      type="checkbox"
                      onChange={(e) => setCreateForm((f) => ({ ...f, isPurchasable: e.target.checked }))}
                    />
                    <span>Có thể mua (Hiển thị & mở bán trên cửa hàng)</span>
                  </label>
                </div>

                {createError && (
                  <div className="admin-create-error" role="alert">
                    <p>{createError}</p>
                  </div>
                )}

                <div className="admin-create-actions">
                  <button
                    className="button button--primary"
                    disabled={isSubmittingCreate || isCreateMediaBusy}
                    type="submit"
                  >
                    {isSubmittingCreate ? 'Đang tạo sản phẩm...' : 'Tạo sản phẩm'}
                  </button>
                  <button
                    className="button button--text"
                    disabled={isSubmittingCreate || isCreateMediaBusy}
                    type="button"
                    onClick={handleCancelCreate}
                  >
                    Hủy
                  </button>
                </div>
              </form>
            </section>
          )}

          {!isCatalogueLoading && !catalogueError && (
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Sản phẩm</th>
                    <th scope="col">Slug định danh</th>
                    <th scope="col">Giá niêm yết</th>
                    <th scope="col">Khả năng mua</th>
                    <th scope="col">Trạng thái</th>
                    <th scope="col">Ghi chú nội bộ</th>
                    <th scope="col">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    const isPriceless = product.purchaseType === 'priceless' || product.priceVnd == null
                    const isProtected = product.slug === 'no-watering-flower' || isPriceless
                    const isDeleteProtected = product.slug === 'no-watering-flower'
                    const imageSrc = getPrimaryMediaSrc(product)
                    const statusLabel = STATUS_LABELS[product.status] || product.status

                    return (
                      <tr
                        key={product.id}
                        className={!product.active ? 'admin-row--archived' : undefined}
                      >
                        <td>
                          <div className="admin-product-cell">
                            {imageSrc && (
                              <img
                                alt=""
                                aria-hidden="true"
                                className="admin-product-thumb"
                                loading="lazy"
                                src={imageSrc}
                              />
                            )}
                            <div className="admin-product-info">
                              <span className="admin-product-name">{product.name}</span>
                              <div className="admin-product-badges">
                                {isProtected && (
                                  <span className="admin-badge admin-badge--priceless">
                                    Được bảo vệ
                                  </span>
                                )}
                                {product.isBestSeller && (
                                  <span className="admin-badge admin-badge--bestseller">
                                    Bán chạy
                                  </span>
                                )}
                                {!product.active && (
                                  <span className="admin-badge admin-badge--archived">
                                    Đã lưu trữ
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <code className="admin-slug-code">{product.slug}</code>
                        </td>
                        <td>
                          {isProtected ? (
                            <span className="admin-price admin-price--priceless">Vô giá</span>
                          ) : (
                            <span className="admin-price">{formatCurrency(product.priceVnd)}</span>
                          )}
                        </td>
                        <td>
                          {isProtected || !product.isPurchasable ? (
                            <span className="admin-badge admin-badge--not-purchasable">
                              Không mở bán
                            </span>
                          ) : (
                            <span className="admin-badge admin-badge--purchasable">
                              Có thể mua
                            </span>
                          )}
                        </td>
                        <td>
                          <span
                            className={`admin-badge admin-badge--${product.status || 'available'}`}
                          >
                            {statusLabel}
                          </span>
                        </td>
                        <td>
                          {product.internalNote ? (
                            <span className="admin-internal-note-cell" title={product.internalNote}>
                              {product.internalNote}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>
                        <td>
                          <div className="admin-inline-actions">
                            <button
                              className="button button--secondary button--small admin-edit-btn"
                              disabled={isDeleting}
                              type="button"
                              onClick={() => handleStartEdit(product)}
                            >
                              Chỉnh sửa
                            </button>
                            <button
                              className="button button--secondary button--small admin-variants-btn"
                              disabled={isDeleting}
                              type="button"
                              onClick={() => handleOpenVariants(product)}
                            >
                              Tùy chọn
                            </button>
                            {product.slug === 'no-watering-flower' && (
                              <button
                                className="button button--text button--small"
                                disabled={visibilityBusyId === product.id || isDeleting}
                                type="button"
                                onClick={() => handleProtectedVisibility(product)}
                              >
                                {visibilityBusyId === product.id ? 'Đang lưu...' : product.active ? 'Ẩn khỏi cửa hàng' : 'Hiện lại'}
                              </button>
                            )}
                            <button
                              className="button button--text button--small admin-delete-btn"
                              disabled={isDeleting || isDeleteProtected}
                              title={isDeleteProtected ? 'Sản phẩm này được bảo vệ.' : undefined}
                              type="button"
                              onClick={() => requestPermanentDelete('product', product)}
                            >
                              Xóa
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Product Full Content Edit Modal */}
        {editingProduct && editForm && (
          <div className="admin-modal-backdrop" onClick={handleCancelEdit} role="presentation">
            <AdminModal
              aria-labelledby="edit-product-modal-title"
              className="admin-modal admin-modal--edit-product"
              onClose={handleCancelEdit}
            >
              <div className="admin-modal__header">
                <div>
                  <h3 id="edit-product-modal-title">Chỉnh sửa sản phẩm: {editingProduct.name}</h3>
                  <p>Cập nhật nội dung hiển thị, thông tin hoa và ghi chú quản trị.</p>
                </div>
                <button
                  className="button button--text button--small"
                  type="button"
                  onClick={handleCancelEdit}
                >
                  Đóng
                </button>
              </div>

              <form className="admin-modal__body admin-edit-form" onSubmit={handleSaveEdit}>
                {saveError && (
                  <div className="admin-catalogue-error admin-catalogue-error--compact" role="alert">
                    <p>{saveError}</p>
                  </div>
                )}

                {/* Group 1: Thông tin cơ bản */}
                <fieldset className="admin-edit-fieldset">
                  <legend>Thông tin cơ bản</legend>
                  <div className="admin-form-grid">
                    <div className="admin-form-group">
                      <label htmlFor="edit-name">
                        Tên sản phẩm <span className="admin-required">*</span>
                      </label>
                      <input
                        id="edit-name"
                        className="admin-input-text"
                        disabled={isSaving}
                        maxLength={160}
                        required
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                      />
                    </div>

                    <div className="admin-form-group">
                      <label>Đường dẫn (URL)</label>
                      <input
                        className="admin-input-text admin-input-readonly"
                        readOnly
                        type="text"
                        value={`/san-pham/${editingProduct.slug}`}
                      />
                      <span className="admin-helper-text">Đường dẫn sản phẩm được giữ cố định để bảo vệ liên kết.</span>
                    </div>

                    <div className="admin-form-group">
                      <label htmlFor="edit-price">
                        Giá niêm yết (VND) <span className="admin-required">*</span>
                      </label>
                      {editingProduct.purchaseType === 'priceless' || editingProduct.slug === 'no-watering-flower' ? (
                        <input
                          className="admin-input-text admin-input-readonly"
                          readOnly
                          type="text"
                          value="Vô giá (Không mở bán)"
                        />
                      ) : (
                        <input
                          id="edit-price"
                          className="admin-input-text"
                          disabled={isSaving}
                          min="1000"
                          required
                          step="1000"
                          type="number"
                          value={editForm.priceVnd}
                          onChange={(e) => setEditForm((f) => ({ ...f, priceVnd: e.target.value }))}
                        />
                      )}
                    </div>

                    <div className="admin-form-group">
                      <label htmlFor="edit-status">Trạng thái</label>
                      <select
                        id="edit-status"
                        className="admin-select-status"
                        disabled={isSaving}
                        value={editForm.status}
                        onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                      >
                        <option value="available">Có sẵn</option>
                        <option value="preorder">Đặt trước</option>
                        <option value="seasonal">Theo mùa</option>
                        <option value="archived">Lưu trữ</option>
                      </select>
                    </div>

                    <div className="admin-form-group">
                      <label htmlFor="edit-collection">Bộ sưu tập</label>
                      <input
                        id="edit-collection"
                        className="admin-input-text"
                        disabled={isSaving}
                        maxLength={160}
                        placeholder="Ví dụ: Những ngày tươi sáng"
                        type="text"
                        value={editForm.collection}
                        onChange={(e) => setEditForm((f) => ({ ...f, collection: e.target.value }))}
                      />
                    </div>

                    {!(editingProduct.purchaseType === 'priceless' || editingProduct.slug === 'no-watering-flower') && (
                      <div className="admin-form-group admin-form-group--checkbox">
                        <label className="admin-checkbox-label">
                          <input
                            checked={editForm.isPurchasable}
                            disabled={isSaving}
                            type="checkbox"
                            onChange={(e) => setEditForm((f) => ({ ...f, isPurchasable: e.target.checked }))}
                          />
                          <span>Có thể mua (Mở bán cho khách hàng)</span>
                        </label>
                      </div>
                    )}
                  </div>
                </fieldset>

                {editingProduct.slug !== 'no-watering-flower' && (
                  <fieldset className="admin-edit-fieldset">
                    <legend>Ảnh sản phẩm</legend>
                    <ProductGalleryEditor
                      disabled={isSaving || isEditMediaBusy}
                      getToken={getToken}
                      media={editForm.media}
                      onBusyChange={setIsEditMediaBusy}
                      productName={editForm.name}
                      onChange={(media, key) => setEditForm((prev) => {
                        const stagedMediaKeys = key
                          ? [...new Set([...prev.stagedMediaKeys, key])]
                          : prev.stagedMediaKeys
                        return {
                          ...prev,
                          mediaChanged: true,
                          media,
                          stagedMediaKeys,
                        }
                      })}
                    />
                  </fieldset>
                )}

                {/* Group 2: Nội dung hiển thị */}
                <fieldset className="admin-edit-fieldset">
                  <legend>Nội dung hiển thị</legend>
                  <div className="admin-form-group">
                    <label htmlFor="edit-short-description">Mô tả ngắn</label>
                    <textarea
                      id="edit-short-description"
                      className="admin-textarea"
                      disabled={isSaving}
                      maxLength={320}
                      rows={3}
                      value={editForm.shortDescription}
                      onChange={(e) => setEditForm((f) => ({ ...f, shortDescription: e.target.value }))}
                    />
                    <span className="admin-helper-text">Hiển thị trực tiếp dưới giá trên trang sản phẩm.</span>
                  </div>

                  <div className="admin-form-group">
                    <label htmlFor="edit-description">Mô tả chi tiết / Câu chuyện</label>
                    <textarea
                      id="edit-description"
                      className="admin-textarea"
                      disabled={isSaving}
                      maxLength={1200}
                      rows={4}
                      value={editForm.description}
                      onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                    />
                  </div>
                </fieldset>

                {/* Group 3: Thông tin hoa */}
                <fieldset className="admin-edit-fieldset">
                  <legend>Thông tin hoa</legend>
                  <div className="admin-form-grid">
                    <div className="admin-form-group">
                      <label htmlFor="edit-composition">Thành phần hoa</label>
                      <input
                        id="edit-composition"
                        className="admin-input-text"
                        disabled={isSaving}
                        placeholder="Cách nhau bởi dấu phẩy (Ví dụ: Hướng dương, Hoa nhỏ trắng)"
                        type="text"
                        value={editForm.composition}
                        onChange={(e) => setEditForm((f) => ({ ...f, composition: e.target.value }))}
                      />
                    </div>

                    <div className="admin-form-group">
                      <label htmlFor="edit-occasions">Dịp tặng</label>
                      <input
                        id="edit-occasions"
                        className="admin-input-text"
                        disabled={isSaving}
                        placeholder="Cách nhau bởi dấu phẩy (Ví dụ: Sinh nhật, Lời cảm ơn)"
                        type="text"
                        value={editForm.occasions}
                        onChange={(e) => setEditForm((f) => ({ ...f, occasions: e.target.value }))}
                      />
                    </div>

                    <div className="admin-form-group">
                      <label htmlFor="edit-moods">Phong cách / Cảm xúc</label>
                      <input
                        id="edit-moods"
                        className="admin-input-text"
                        disabled={isSaving}
                        placeholder="Cách nhau bởi dấu phẩy (Ví dụ: Ấm áp, Rạng rỡ)"
                        type="text"
                        value={editForm.moods}
                        onChange={(e) => setEditForm((f) => ({ ...f, moods: e.target.value }))}
                      />
                    </div>

                    <div className="admin-form-group">
                      <label htmlFor="edit-colors">Bảng màu</label>
                      <input
                        id="edit-colors"
                        className="admin-input-text"
                        disabled={isSaving}
                        placeholder="Cách nhau bởi dấu phẩy (Ví dụ: Vàng ấm, Trắng)"
                        type="text"
                        value={editForm.colors}
                        onChange={(e) => setEditForm((f) => ({ ...f, colors: e.target.value }))}
                      />
                    </div>
                  </div>
                </fieldset>

                {/* Group 4: Thông tin giao/chăm sóc */}
                <fieldset className="admin-edit-fieldset">
                  <legend>Thông tin giao/chăm sóc</legend>
                  <div className="admin-form-grid">
                    <div className="admin-form-group">
                      <label htmlFor="edit-care-note">Hướng dẫn chăm sóc</label>
                      <textarea
                        id="edit-care-note"
                        className="admin-textarea"
                        disabled={isSaving}
                        maxLength={800}
                        rows={3}
                        value={editForm.careNote}
                        onChange={(e) => setEditForm((f) => ({ ...f, careNote: e.target.value }))}
                      />
                    </div>

                    <div className="admin-form-group">
                      <label htmlFor="edit-delivery-note">Thông tin giao hoa</label>
                      <textarea
                        id="edit-delivery-note"
                        className="admin-textarea"
                        disabled={isSaving}
                        maxLength={800}
                        rows={3}
                        value={editForm.deliveryNote}
                        onChange={(e) => setEditForm((f) => ({ ...f, deliveryNote: e.target.value }))}
                      />
                    </div>
                  </div>
                </fieldset>

                {/* Group 5: Ghi chú nội bộ */}
                <fieldset className="admin-edit-fieldset">
                  <legend>Ghi chú nội bộ</legend>
                  <div className="admin-form-group">
                    <label htmlFor="edit-internal-note">Ghi chú nội bộ</label>
                    <textarea
                      id="edit-internal-note"
                      className="admin-textarea"
                      disabled={isSaving}
                      maxLength={800}
                      placeholder="Ví dụ: Chỉ nhận đặt trước 2 ngày, Hoa theo mùa..."
                      rows={3}
                      value={editForm.internalNote}
                      onChange={(e) => setEditForm((f) => ({ ...f, internalNote: e.target.value }))}
                    />
                    <span className="admin-helper-text">Chỉ quản trị viên nhìn thấy. Không hiển thị cho khách hàng.</span>
                  </div>
                </fieldset>

                <div className="admin-modal__actions">
                  <button
                    className="button button--primary"
                    disabled={isSaving || isEditMediaBusy}
                    type="submit"
                  >
                    {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
                  </button>
                  <button
                    className="button button--text"
                    disabled={isSaving || isEditMediaBusy}
                    type="button"
                    onClick={handleCancelEdit}
                  >
                    Hủy
                  </button>
                </div>
              </form>
            </AdminModal>
          </div>
        )}

        {/* Product Options Modal (Sizes & Wrapping) */}
        {configuringProduct && (
          <div className="admin-modal-backdrop" onClick={handleCloseVariants} role="presentation">
            <AdminModal
              aria-labelledby="variants-modal-title"
              className="admin-modal"
              onClose={handleCloseVariants}
            >
              <div className="admin-modal__header">
                <div>
                  <h3 id="variants-modal-title">Cấu hình tùy chọn: {configuringProduct.name}</h3>
                  <p>Quản lý các kích thước và kiểu gói hiển thị trên trang chi tiết bó hoa.</p>
                </div>
                <button
                  className="button button--text button--small"
                  type="button"
                  onClick={handleCloseVariants}
                >
                  Đóng
                </button>
              </div>

              {isLoadingVariants ? (
                <div className="admin-modal__loading">
                  <div className="admin-spinner" />
                  <p>Đang tải danh sách tùy chọn...</p>
                </div>
              ) : (
                <div className="admin-modal__body">
                  {/* Size Options Section */}
                  <section className="admin-options-section">
                    <div className="admin-options-section__header">
                      <h4>Chọn kích thước ({variantsForm.filter((v) => v.optionType === 'size').length})</h4>
                      <button
                        className="button button--secondary button--small"
                        type="button"
                        onClick={handleAddSizeVariant}
                      >
                        + Thêm kích thước
                      </button>
                    </div>

                    <div className="admin-options-list">
                      {variantsForm.filter((v) => v.optionType === 'size').length === 0 ? (
                        <p className="admin-options-empty">Chưa có kích thước nào cho sản phẩm này.</p>
                      ) : (
                        variantsForm.map((variant, index) => {
                          if (variant.optionType !== 'size') return null
                          return (
                            <div className="admin-option-item" key={variant.id || `size-${index}`}>
                              <div className="admin-option-item__fields">
                                <div className="admin-option-field">
                                  <label>Tên kích thước</label>
                                  <input
                                    className="admin-input-text"
                                    placeholder="Ví dụ: Tiêu chuẩn, Lớn..."
                                    type="text"
                                    value={variant.label}
                                    onChange={(e) => handleVariantChange(index, 'label', e.target.value)}
                                  />
                                </div>
                                <div className="admin-option-field admin-option-field--price">
                                  <label>Giá niêm yết (VND)</label>
                                  <input
                                    className="admin-input-text"
                                    min="0"
                                    step="1000"
                                    type="number"
                                    value={variant.priceVnd ?? ''}
                                    onChange={(e) => handleVariantChange(index, 'priceVnd', Number(e.target.value))}
                                  />
                                </div>
                                <div className="admin-option-field admin-option-field--note">
                                  <label>Ghi chú (tùy chọn)</label>
                                  <input
                                    className="admin-input-text"
                                    placeholder="Ví dụ: 12-15 cành..."
                                    type="text"
                                    value={variant.note || ''}
                                    onChange={(e) => handleVariantChange(index, 'note', e.target.value)}
                                  />
                                </div>
                              </div>
                              <div className="admin-option-item__actions">
                                <label className="admin-checkbox-label">
                                  <input
                                    checked={variant.active !== false}
                                    type="checkbox"
                                    onChange={(e) => handleVariantChange(index, 'active', e.target.checked)}
                                  />
                                  <span>Hoạt động</span>
                                </label>
                                <button
                                  className="button button--text button--small admin-option-remove"
                                  title="Xóa tùy chọn này"
                                  type="button"
                                  onClick={() => handleRemoveVariant(index)}
                                >
                                  Xóa
                                </button>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </section>

                  {/* Wrapping Options Section */}
                  <section className="admin-options-section">
                    <div className="admin-options-section__header">
                      <h4>Kiểu gói ({variantsForm.filter((v) => v.optionType === 'wrapping').length})</h4>
                      <button
                        className="button button--secondary button--small"
                        type="button"
                        onClick={handleAddWrappingVariant}
                      >
                        + Thêm kiểu gói
                      </button>
                    </div>

                    <div className="admin-options-list">
                      {variantsForm.filter((v) => v.optionType === 'wrapping').length === 0 ? (
                        <p className="admin-options-empty">Chưa có kiểu gói nào cho sản phẩm này.</p>
                      ) : (
                        variantsForm.map((variant, index) => {
                          if (variant.optionType !== 'wrapping') return null
                          return (
                            <div className="admin-option-item" key={variant.id || `wrap-${index}`}>
                              <div className="admin-option-item__fields">
                                <div className="admin-option-field">
                                  <label>Tên kiểu gói</label>
                                  <input
                                    className="admin-input-text"
                                    placeholder="Ví dụ: Giấy ivory mờ..."
                                    type="text"
                                    value={variant.label}
                                    onChange={(e) => handleVariantChange(index, 'label', e.target.value)}
                                  />
                                </div>
                                <div className="admin-option-field admin-option-field--note">
                                  <label>Mô tả / Ghi chú</label>
                                  <input
                                    className="admin-input-text"
                                    placeholder="Ví dụ: Thanh lịch, làm nổi bật màu hoa..."
                                    type="text"
                                    value={variant.note || ''}
                                    onChange={(e) => handleVariantChange(index, 'note', e.target.value)}
                                  />
                                </div>
                              </div>
                              <div className="admin-option-item__actions">
                                <label className="admin-checkbox-label">
                                  <input
                                    checked={variant.active !== false}
                                    type="checkbox"
                                    onChange={(e) => handleVariantChange(index, 'active', e.target.checked)}
                                  />
                                  <span>Hoạt động</span>
                                </label>
                                <button
                                  className="button button--text button--small admin-option-remove"
                                  title="Xóa tùy chọn này"
                                  type="button"
                                  onClick={() => handleRemoveVariant(index)}
                                >
                                  Xóa
                                </button>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </section>

                  {variantsError && (
                    <div className="admin-create-error" role="alert">
                      <p>{variantsError}</p>
                    </div>
                  )}

                  {variantsSuccess && (
                    <div className="admin-save-success" role="status">
                      <p>{variantsSuccess}</p>
                    </div>
                  )}

                  <div className="admin-modal__footer">
                    <button
                      className="button button--primary"
                      disabled={isSavingVariants}
                      type="button"
                      onClick={handleSaveVariants}
                    >
                      {isSavingVariants ? 'Đang lưu tùy chọn...' : 'Lưu tùy chọn'}
                    </button>
                    <button
                      className="button button--text"
                      disabled={isSavingVariants}
                      type="button"
                      onClick={handleCloseVariants}
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              )}
            </AdminModal>
          </div>
        )}

        {/* Gift Add-ons Management Section */}
        <section aria-labelledby="gift-addons-mgmt-title" className="admin-gift-addons-section">
          <div className="admin-catalogue-header">
            <div>
              <h2 id="gift-addons-mgmt-title">Quà tặng kèm (Dùng chung cho bó hoa)</h2>
              <p className="admin-section-sub">
                Quản lý các món quà tặng hiển thị ở mục "Thêm một món quà nhỏ" trên tất cả sản phẩm.
              </p>
            </div>
            <div className="admin-catalogue-header-actions">
              {!isLoadingGiftAddOns && !giftAddOnsError && (
                <span className="admin-catalogue-count">
                  {giftAddOns.length} món quà
                </span>
              )}
              {!isLoadingGiftAddOns && !giftAddOnsError && !isCreatingGiftAddOn && (
                <button
                  className="button button--primary button--small admin-add-gift-btn"
                  type="button"
                  onClick={handleOpenCreateGiftAddOn}
                >
                  Thêm món quà
                </button>
              )}
            </div>
          </div>

          {isLoadingGiftAddOns && (
            <div className="admin-catalogue-loading" role="status">
              <p>Đang tải danh sách quà tặng kèm từ D1...</p>
            </div>
          )}

          {!isLoadingGiftAddOns && giftAddOnsError && (
            <div className="admin-catalogue-error" role="alert">
              <h3>Không thể tải quà tặng kèm</h3>
              <p>{giftAddOnsError?.message || 'Lỗi kết nối máy chủ.'}</p>
              <button className="button button--secondary" onClick={handleRetryGiftAddOns} type="button">
                Thử lại
              </button>
            </div>
          )}

          {isCreatingGiftAddOn && (
            <section aria-label="Tạo món quà mới" className="admin-create-panel">
              <div className="admin-create-panel__header">
                <h3>Thêm món quà tặng kèm mới</h3>
                <p>Khách hàng có thể chọn gửi kèm khi mua bó hoa.</p>
              </div>
              <form className="admin-create-form" onSubmit={handleSaveCreateGiftAddOn}>
                <div className="admin-form-grid">
                  <div className="admin-form-group">
                    <label htmlFor="gift-name">
                      Tên món quà <span className="admin-required">*</span>
                    </label>
                    <input
                      id="gift-name"
                      className="admin-input-text"
                      disabled={isSubmittingGiftAddOn}
                      maxLength={120}
                      placeholder="Ví dụ: Nến thơm mini"
                      required
                      type="text"
                      value={createGiftAddOnForm.name}
                      onChange={(e) => setCreateGiftAddOnForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>

                  <div className="admin-form-group">
                    <label htmlFor="gift-price">
                      Đơn giá (VND, 0 nếu miễn phí) <span className="admin-required">*</span>
                    </label>
                    <input
                      id="gift-price"
                      className="admin-input-text"
                      disabled={isSubmittingGiftAddOn}
                      min="0"
                      placeholder="0"
                      required
                      step="1000"
                      type="number"
                      value={createGiftAddOnForm.priceVnd}
                      onChange={(e) => setCreateGiftAddOnForm((f) => ({ ...f, priceVnd: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="admin-form-group admin-form-group--full">
                  <label htmlFor="gift-desc">Mô tả ngắn</label>
                  <input
                    id="gift-desc"
                    className="admin-input-text"
                    disabled={isSubmittingGiftAddOn}
                    maxLength={320}
                    placeholder="Mô tả về món quà (ví dụ: Hương dịu, được chuẩn bị cùng bó hoa)..."
                    type="text"
                    value={createGiftAddOnForm.shortDescription}
                    onChange={(e) => setCreateGiftAddOnForm((f) => ({ ...f, shortDescription: e.target.value }))}
                  />
                </div>

                <div className="admin-form-group admin-form-group--checkbox">
                  <label className="admin-checkbox-label">
                    <input
                      checked={createGiftAddOnForm.active}
                      disabled={isSubmittingGiftAddOn}
                      type="checkbox"
                      onChange={(e) => setCreateGiftAddOnForm((f) => ({ ...f, active: e.target.checked }))}
                    />
                    <span>Hoạt động (Hiển thị cho khách hàng chọn)</span>
                  </label>
                </div>

                {createGiftAddOnError && (
                  <div className="admin-create-error" role="alert">
                    <p>{createGiftAddOnError}</p>
                  </div>
                )}

                <div className="admin-create-actions">
                  <button
                    className="button button--primary"
                    disabled={isSubmittingGiftAddOn}
                    type="submit"
                  >
                    {isSubmittingGiftAddOn ? 'Đang tạo món quà...' : 'Tạo món quà'}
                  </button>
                  <button
                    className="button button--text"
                    disabled={isSubmittingGiftAddOn}
                    type="button"
                    onClick={handleCancelCreateGiftAddOn}
                  >
                    Hủy
                  </button>
                </div>
              </form>
            </section>
          )}

          {!isLoadingGiftAddOns && !giftAddOnsError && (
            <>
              {giftAddOnToggleError && (
                <div className="admin-catalogue-error admin-catalogue-error--compact" role="alert">
                  <p>{giftAddOnToggleError}</p>
                </div>
              )}
              <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Tên món quà</th>
                    <th scope="col">Mô tả ngắn</th>
                    <th scope="col">Đơn giá</th>
                    <th scope="col">Trạng thái</th>
                    <th scope="col">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {giftAddOns.map((item) => {
                    const isEditing = editingGiftAddOnId === item.id
                    return (
                      <tr key={item.id} className={!item.active ? 'admin-row--archived' : undefined}>
                        <td>
                          {isEditing ? (
                            <input
                              className="admin-input-text"
                              disabled={isSavingGiftAddOn}
                              type="text"
                              value={editGiftAddOnForm.name}
                              onChange={(e) => setEditGiftAddOnForm((f) => ({ ...f, name: e.target.value }))}
                            />
                          ) : (
                            <strong>{item.name}</strong>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input
                              className="admin-input-text"
                              disabled={isSavingGiftAddOn}
                              type="text"
                              value={editGiftAddOnForm.shortDescription}
                              onChange={(e) => setEditGiftAddOnForm((f) => ({ ...f, shortDescription: e.target.value }))}
                            />
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>{item.shortDescription || '—'}</span>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input
                              className="admin-input-price"
                              disabled={isSavingGiftAddOn}
                              min="0"
                              step="1000"
                              type="number"
                              value={editGiftAddOnForm.priceVnd}
                              onChange={(e) => setEditGiftAddOnForm((f) => ({ ...f, priceVnd: e.target.value }))}
                            />
                          ) : item.priceVnd === 0 ? (
                            <span className="admin-badge admin-badge--available">Miễn phí</span>
                          ) : (
                            <span className="admin-price">{formatCurrency(item.priceVnd)}</span>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <label className="admin-checkbox-label">
                              <input
                                checked={editGiftAddOnForm.active}
                                disabled={isSavingGiftAddOn}
                                type="checkbox"
                                onChange={(e) => setEditGiftAddOnForm((f) => ({ ...f, active: e.target.checked }))}
                              />
                              <span>Hoạt động</span>
                            </label>
                          ) : item.active ? (
                            <span className="admin-badge admin-badge--available">Hoạt động</span>
                          ) : (
                            <span className="admin-badge admin-badge--archived">Đã ẩn</span>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <div className="admin-inline-actions">
                              <button
                                className="button button--primary button--small"
                                disabled={isSavingGiftAddOn}
                                type="button"
                                onClick={() => handleSaveEditGiftAddOn(item.id)}
                              >
                                {isSavingGiftAddOn ? 'Đang lưu...' : 'Lưu'}
                              </button>
                              <button
                                className="button button--text button--small"
                                disabled={isSavingGiftAddOn}
                                type="button"
                                onClick={handleCancelEditGiftAddOn}
                              >
                                Hủy
                              </button>
                              {giftAddOnSaveError && (
                                <span className="admin-edit-error" role="alert">
                                  {giftAddOnSaveError}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="admin-inline-actions">
                              <button
                                className="button button--secondary button--small"
                                type="button"
                                onClick={() => handleStartEditGiftAddOn(item)}
                              >
                                Sửa
                              </button>
                              <button
                                className={`button button--small ${item.active ? 'button--text' : 'button--primary'}`}
                                disabled={togglingGiftAddOnId === item.id}
                                type="button"
                                onClick={() => handleToggleGiftAddOnActive(item)}
                              >
                                {item.active ? 'Tạm ẩn' : 'Hiện lại'}
                              </button>
                              <button
                                className="button button--text button--small admin-delete-btn"
                                disabled={isDeleting || togglingGiftAddOnId === item.id}
                                type="button"
                                onClick={() => requestPermanentDelete('gift', item)}
                              >
                                Xóa
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
            </>
          )}
        </section>

        {deleteTarget && (
          <div className="admin-modal-backdrop" onClick={cancelPermanentDelete} role="presentation">
            <AdminModal
              aria-describedby="permanent-delete-description"
              aria-labelledby="permanent-delete-title"
              className="admin-modal admin-modal--delete-confirmation"
              onClose={cancelPermanentDelete}
            >
              <div className="admin-modal__header">
                <div>
                  <h3 id="permanent-delete-title">Xóa vĩnh viễn</h3>
                  <p id="permanent-delete-description">
                    {deleteTarget.kind === 'order'
                      ? 'Xóa vĩnh viễn đơn hàng này? Hành động này không thể hoàn tác.'
                      : deleteTarget.kind === 'gift'
                        ? 'Xóa vĩnh viễn món quà này? Hành động này không thể hoàn tác.'
                        : `Xóa vĩnh viễn sản phẩm “${deleteTarget.label}”?`}
                  </p>
                </div>
                <button
                  className="button button--text button--small"
                  disabled={isDeleting}
                  type="button"
                  onClick={cancelPermanentDelete}
                >
                  Đóng
                </button>
              </div>
              <p className="admin-delete-warning">Không thể hoàn tác</p>
              {deleteError && (
                <div className="admin-catalogue-error admin-catalogue-error--compact" role="alert">
                  <p>{deleteError}</p>
                </div>
              )}
              <div className="admin-modal__footer">
                <button
                  className="button button--secondary"
                  disabled={isDeleting}
                  type="button"
                  onClick={cancelPermanentDelete}
                >
                  Hủy
                </button>
                <button
                  className="button button--text admin-delete-confirm-btn"
                  disabled={isDeleting}
                  type="button"
                  onClick={confirmPermanentDelete}
                >
                  {isDeleting ? 'Đang xóa...' : 'Xóa vĩnh viễn'}
                </button>
              </div>
            </AdminModal>
          </div>
        )}

        {/* Order Detail & Fulfilment Modal */}
        {selectedOrderDetail && (
          <div className="admin-modal-backdrop" onClick={handleCloseOrderDetail} role="presentation">
            <AdminModal
              aria-labelledby="order-detail-modal-title"
              className="admin-modal admin-modal--order-detail"
              onClose={handleCloseOrderDetail}
            >
              <div className="admin-modal__header">
                <div>
                  <h3 id="order-detail-modal-title">
                    Đơn hàng: <code className="admin-order-code-header">{selectedOrderDetail.orderCode}</code>
                  </h3>
                  <p>
                    Đặt lúc:{' '}
                    {selectedOrderDetail.createdAtUtc
                      ? new Date(selectedOrderDetail.createdAtUtc).toLocaleString('vi-VN', {
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })
                      : '—'}
                  </p>
                </div>
                <button
                  className="button button--text button--small"
                  type="button"
                  onClick={handleCloseOrderDetail}
                >
                  Đóng
                </button>
              </div>

              {isLoadingOrderDetail ? (
                <div className="admin-modal__loading">
                  <div className="admin-spinner" />
                  <p>Đang tải chi tiết đơn hàng và giải mã thông tin giao nhận...</p>
                </div>
              ) : orderDetailError ? (
                <div className="admin-catalogue-error admin-catalogue-error--compact" role="alert">
                  <p>{orderDetailError}</p>
                </div>
              ) : (
                <div className="admin-modal__body admin-order-modal-body">
                  {/* Status Banner & Fulfilment Action Controls */}
                  <div className="admin-order-status-banner">
                    <div className="admin-order-status-badges">
                      <div className="admin-order-status-item">
                        <span className="admin-order-status-label">Thanh toán:</span>
                        <span className={`admin-badge admin-badge--payment-${selectedOrderDetail.paymentStatus === 'paid' ? 'paid' : 'pending'}`}>
                          {formatPaymentStatus(selectedOrderDetail.paymentStatus)}
                        </span>
                      </div>
                      <div className="admin-order-status-item">
                        <span className="admin-order-status-label">Đơn hàng:</span>
                        <span className={`admin-badge admin-badge--order-${selectedOrderDetail.status || 'received'}`}>
                          {formatOrderStatus(selectedOrderDetail.status)}
                        </span>
                      </div>
                    </div>

                    <div className="admin-order-actions-bar">
                      {selectedOrderDetail.paymentStatus === 'pending' && (
                        <button
                          className="button button--primary button--small admin-action-confirm-payment"
                          disabled={isUpdatingOrder}
                          type="button"
                          onClick={() => handleConfirmOrderPayment(selectedOrderDetail.id)}
                        >
                          {isUpdatingOrder ? 'Đang xử lý...' : 'Xác nhận đã nhận thanh toán'}
                        </button>
                      )}

                      {selectedOrderDetail.paymentStatus === 'paid' && selectedOrderDetail.status === 'preparing' && (
                        <button
                          className="button button--primary button--small admin-action-start-delivery"
                          disabled={isUpdatingOrder}
                          type="button"
                          onClick={() => handleUpdateOrderStatus(selectedOrderDetail.id, 'delivering')}
                        >
                          {isUpdatingOrder ? 'Đang cập nhật...' : 'Bắt đầu giao hàng'}
                        </button>
                      )}

                      {selectedOrderDetail.status === 'delivering' && (
                        <button
                          className="button button--primary button--small admin-action-complete-order"
                          disabled={isUpdatingOrder}
                          type="button"
                          onClick={() => handleUpdateOrderStatus(selectedOrderDetail.id, 'completed')}
                        >
                          {isUpdatingOrder ? 'Đang cập nhật...' : 'Đánh dấu hoàn tất'}
                        </button>
                      )}

                      {selectedOrderDetail.status === 'completed' && (
                        <span className="admin-order-completed-indicator">
                          Đơn hàng đã hoàn tất giao hoa
                        </span>
                      )}
                    </div>
                  </div>

                  {orderActionSuccess && (
                    <div className="admin-save-success" role="status">
                      <p>{orderActionSuccess}</p>
                    </div>
                  )}

                  {orderActionError && (
                    <div className="admin-catalogue-error admin-catalogue-error--compact" role="alert">
                      <p>{orderActionError}</p>
                    </div>
                  )}

                  {/* Customer, Recipient & Delivery Info Grid */}
                  <div className="admin-order-grid">
                    <div className="admin-order-card">
                      <h4>Người đặt hàng</h4>
                      {selectedOrderDetail.customerType === 'guest' && <p>Khách không tài khoản</p>}
                      <p><strong>{selectedOrderDetail.buyer?.name || '—'}</strong></p>
                      <p>Số điện thoại: {selectedOrderDetail.buyer?.phone || '—'}</p>
                      {selectedOrderDetail.buyer?.email && <p>Email: {selectedOrderDetail.buyer.email}</p>}
                    </div>

                    <div className="admin-order-card">
                      <h4>Người nhận hoa</h4>
                      <p><strong>{selectedOrderDetail.recipient?.name || selectedOrderDetail.receiver?.name || '—'}</strong></p>
                      <p>Số điện thoại: {selectedOrderDetail.recipient?.phone || selectedOrderDetail.receiver?.phone || '—'}</p>
                    </div>

                    <div className="admin-order-card admin-order-card--full">
                      <h4>Địa chỉ giao nhận & Thời gian</h4>
                      <p>
                        <strong>Địa chỉ: </strong>
                        {[
                          selectedOrderDetail.address?.detail,
                          selectedOrderDetail.address?.ward,
                          selectedOrderDetail.address?.district,
                          selectedOrderDetail.address?.city,
                        ].filter(Boolean).join(', ') || '—'}
                      </p>
                      <p>
                        <strong>Thời gian giao: </strong>
                        {formatDeliveryDate(selectedOrderDetail.delivery?.date || selectedOrderDetail.deliveryDate)}
                        {selectedOrderDetail.delivery?.slot || selectedOrderDetail.deliverySlot
                          ? ` · ${formatDeliverySlot(selectedOrderDetail.delivery?.slot || selectedOrderDetail.deliverySlot)}`
                          : ''}
                      </p>
                    </div>

                    {(selectedOrderDetail.gifting?.message || selectedOrderDetail.gifting?.senderName || selectedOrderDetail.gifting?.anonymous) && (
                      <div className="admin-order-card admin-order-card--full admin-order-card--gifting">
                        <h4>Thông điệp & Thiệp đính kèm</h4>
                        {selectedOrderDetail.gifting?.anonymous ? (
                          <p className="admin-order-anonymous-badge">Gửi ẩn danh</p>
                        ) : (
                          selectedOrderDetail.gifting?.senderName && (
                            <p><strong>Người gửi:</strong> {selectedOrderDetail.gifting.senderName}</p>
                          )
                        )}
                        {selectedOrderDetail.gifting?.message && (
                          <blockquote className="admin-order-gift-message">
                            "{selectedOrderDetail.gifting.message}"
                          </blockquote>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Ordered Items Table */}
                  <div className="admin-order-items-section">
                    <h4>Sản phẩm trong đơn</h4>
                    <div className="admin-table-container">
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th scope="col">Tên hoa / Tùy chọn</th>
                            <th scope="col">Đơn giá</th>
                            <th scope="col">Số lượng</th>
                            <th scope="col">Thành tiền</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(selectedOrderDetail.items || []).map((item, idx) => (
                            <tr key={item.id || item.key || idx}>
                              <td>
                                <div className="admin-order-item-desc">
                                  <strong>{item.name}</strong>
                                  <div className="admin-order-item-sub">
                                    {[
                                      item.size?.label || item.size,
                                      item.wrapping?.label || item.wrapping,
                                    ].filter(Boolean).join(' · ')}
                                  </div>
                                  {Array.isArray(item.giftAddOns) && item.giftAddOns.length > 0 && (
                                    <div className="admin-order-item-addons">
                                      + Quà kèm: {item.giftAddOns.map((g) => `${g.name} (${g.priceVnd === 0 ? 'Miễn phí' : formatCurrency(g.priceVnd || g.price)})`).join(', ')}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td>{formatCurrency(item.unitTotalVnd || item.unitPrice)}</td>
                              <td>x {item.quantity}</td>
                              <td>
                                <strong>{formatCurrency(item.lineTotalVnd || item.lineTotal)}</strong>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan={3} style={{ fontWeight: 600, textAlign: 'right' }}>Tổng tiền đơn hoa:</td>
                            <td>
                              <strong className="admin-price">{formatCurrency(selectedOrderDetail.totalVnd)}</strong>
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {/* Payment Details */}
                  <div className="admin-order-card admin-order-card--payment">
                    <h4>Thông tin thanh toán</h4>
                    <dl className="admin-order-payment-summary">
                      <div>
                        <dt>Phương thức</dt>
                        <dd>{formatPaymentMethod(selectedOrderDetail.payment?.method ?? selectedOrderDetail.paymentMethod)}</dd>
                      </div>
                      <div>
                        <dt>Trạng thái</dt>
                        <dd>{formatPaymentStatus(selectedOrderDetail.paymentStatus)}</dd>
                      </div>
                    </dl>
                    {selectedOrderDetail.payment?.transferContent && (
                      <p>Nội dung chuyển khoản: <code>{selectedOrderDetail.payment.transferContent}</code></p>
                    )}
                    {selectedOrderDetail.payment?.bank && selectedOrderDetail.payment.bank.available && (
                      <p>
                        Ngân hàng nhận: {selectedOrderDetail.payment.bank.bankName} - STK: {selectedOrderDetail.payment.bank.accountNumber} ({selectedOrderDetail.payment.bank.accountName})
                      </p>
                    )}
                    {selectedOrderDetail.payment?.momo && selectedOrderDetail.payment.momo.available && (
                      <p>
                        Ví MoMo: {selectedOrderDetail.payment.momo.accountName} - SĐT: {selectedOrderDetail.payment.momo.phoneNumber}
                      </p>
                    )}
                  </div>

                  {/* Audit History Timeline */}
                  {Array.isArray(selectedOrderDetail.auditHistory) && selectedOrderDetail.auditHistory.length > 0 && (
                    <div className="admin-order-audit-section">
                      <h4>Lịch sử xử lý đơn hàng</h4>
                      <ul className="admin-order-audit-list">
                        {selectedOrderDetail.auditHistory.map((event) => (
                          <li key={event.id} className="admin-order-audit-item">
                            <span className="admin-order-audit-time">
                              {event.createdAtUtc
                                ? new Date(event.createdAtUtc).toLocaleString('vi-VN', {
                                    day: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                  })
                                : '—'}
                            </span>
                            <span className="admin-order-audit-desc">
                              {formatOrderAuditEvent(event)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="admin-modal__footer">
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={handleCloseOrderDetail}
                >
                  Đóng
                </button>
              </div>
            </AdminModal>
          </div>
        )}
      </Container>
    </main>
  )
}

export default AdminPage
