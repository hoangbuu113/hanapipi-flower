import { useEffect, useState, useCallback } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import Container from '../components/Container'
import { useAccount } from '../context/accountStore'
import { checkAdminAccess, fetchAdminCatalogue, updateAdminProduct } from '../services/adminClient'
import { formatCurrency } from '../utils/formatCurrency'
import './AdminPage.css'

const STATUS_LABELS = {
  available: 'Có sẵn',
  preorder: 'Đặt trước',
  seasonal: 'Theo mùa',
  archived: 'Lưu trữ',
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

  const [editingProductId, setEditingProductId] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saveSuccess, setSaveSuccess] = useState(null)

  const handleStartEdit = (product) => {
    setEditingProductId(product.id)
    setEditForm({
      isPurchasable: Boolean(product.isPurchasable),
      priceVnd: product.priceVnd ?? 0,
      status: product.status ?? 'available',
    })
    setSaveError(null)
    setSaveSuccess(null)
  }

  const handleCancelEdit = () => {
    setEditingProductId(null)
    setEditForm(null)
    setSaveError(null)
  }

  const handleSaveEdit = async (productId) => {
    if (!editForm) return

    const price = Number(editForm.priceVnd)
    if (!Number.isInteger(price) || price <= 0) {
      setSaveError('Giá sản phẩm phải là số nguyên dương hợp lệ.')
      return
    }

    setIsSaving(true)
    setSaveError(null)

    const result = await updateAdminProduct(productId, {
      isPurchasable: editForm.isPurchasable,
      priceVnd: price,
      status: editForm.status,
    }, { getToken })

    setIsSaving(false)

    if (result.ok && result.product) {
      setProducts((prev) => prev.map((p) => (p.id === result.product.id ? result.product : p)))
      setEditingProductId(null)
      setEditForm(null)
      setSaveSuccess(`Đã cập nhật thành công "${result.product.name}".`)
    } else {
      setSaveError(result.error?.message || 'Không thể cập nhật sản phẩm.')
    }
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

    fetchAdminCatalogue({ signal: controller.signal })
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
  }, [authStatus, catalogueReloadKey])

  const handleRetryAuth = useCallback(() => {
    setAuthReloadKey((k) => k + 1)
  }, [])

  const handleRetryCatalogue = useCallback(() => {
    setIsCatalogueLoading(true)
    setCatalogueError(null)
    setCatalogueReloadKey((k) => k + 1)
  }, [])

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
            <h1>Quản lý Hanapipi</h1>
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
          <h1>Quản lý Hanapipi</h1>
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

        {/* Catalogue Management Section */}
        <section aria-labelledby="catalogue-mgmt-title" className="admin-catalogue-section">
          <div className="admin-catalogue-header">
            <div>
              <h2 id="catalogue-mgmt-title">Danh mục sản phẩm D1</h2>
            </div>
            {!isCatalogueLoading && !catalogueError && (
              <span className="admin-catalogue-count">
                {products.length} sản phẩm
              </span>
            )}
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
                    <th scope="col">Đặc biệt / Ghi chú</th>
                    <th scope="col">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    const isPriceless = product.purchaseType === 'priceless' || product.priceVnd == null
                    const isEditing = editingProductId === product.id
                    const imageSrc = product.media?.[0]?.src
                    const statusLabel = STATUS_LABELS[product.status] || product.status

                    return (
                      <tr key={product.id} className={isEditing ? 'admin-row--editing' : undefined}>
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
                                {product.isBestSeller && (
                                  <span className="admin-badge admin-badge--bestseller">
                                    Bán chạy
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
                          {isPriceless ? (
                            <span className="admin-price admin-price--priceless">Vô giá</span>
                          ) : isEditing ? (
                            <input
                              aria-label={`Giá niêm yết cho ${product.name}`}
                              className="admin-input-price"
                              disabled={isSaving}
                              min="1000"
                              step="1000"
                              type="number"
                              value={editForm.priceVnd}
                              onChange={(e) => setEditForm((f) => ({ ...f, priceVnd: e.target.value }))}
                            />
                          ) : (
                            <span className="admin-price">{formatCurrency(product.priceVnd)}</span>
                          )}
                        </td>
                        <td>
                          {isPriceless ? (
                            <span className="admin-badge admin-badge--not-purchasable">
                              Không mở bán
                            </span>
                          ) : isEditing ? (
                            <label className="admin-checkbox-label">
                              <input
                                checked={editForm.isPurchasable}
                                disabled={isSaving}
                                type="checkbox"
                                onChange={(e) => setEditForm((f) => ({ ...f, isPurchasable: e.target.checked }))}
                              />
                              <span>Có thể mua</span>
                            </label>
                          ) : product.isPurchasable ? (
                            <span className="admin-badge admin-badge--purchasable">
                              Có thể mua
                            </span>
                          ) : (
                            <span className="admin-badge admin-badge--not-purchasable">
                              Không mở bán
                            </span>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <select
                              aria-label={`Trạng thái cho ${product.name}`}
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
                          ) : (
                            <span
                              className={`admin-badge admin-badge--${product.status || 'available'}`}
                            >
                              {statusLabel}
                            </span>
                          )}
                        </td>
                        <td>
                          {isPriceless ? (
                            <span className="admin-badge admin-badge--priceless">
                              Sản phẩm vô giá - Được bảo vệ
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>
                        <td>
                          {isPriceless ? (
                            <span className="admin-badge admin-badge--priceless">
                              Được bảo vệ
                            </span>
                          ) : isEditing ? (
                            <div className="admin-inline-actions">
                              <button
                                className="button button--primary button--small"
                                disabled={isSaving}
                                type="button"
                                onClick={() => handleSaveEdit(product.id)}
                              >
                                {isSaving ? 'Đang lưu...' : 'Lưu'}
                              </button>
                              <button
                                className="button button--text button--small"
                                disabled={isSaving}
                                type="button"
                                onClick={handleCancelEdit}
                              >
                                Hủy
                              </button>
                              {saveError && (
                                <span className="admin-edit-error" role="alert">
                                  {saveError}
                                </span>
                              )}
                            </div>
                          ) : (
                            <button
                              className="button button--secondary button--small admin-edit-btn"
                              type="button"
                              onClick={() => handleStartEdit(product)}
                            >
                              Chỉnh sửa
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </Container>
    </main>
  )
}

export default AdminPage
