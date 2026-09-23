import { useRef, useState } from 'react'
import { deleteAdminMedia, uploadAdminMedia } from '../../services/adminClient'

export default function ProductImageUploader({
  disabled = false,
  deferDelete = false,
  getToken,
  mediaKey = null,
  onChange,
  onBusyChange,
  value = '',
}) {
  const fileInputRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isFadingOut, setIsFadingOut] = useState(false)
  const [error, setError] = useState(null)
  const [tempPreview, setTempPreview] = useState(null)

  const handleSelectFile = () => {
    if (disabled || isUploading || isDeleting) return
    setError(null)
    fileInputRef.current?.click()
  }

  const processUpload = async (file) => {
    if (!file) return

    // Pre-validate file type client-side
    const validTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type)) {
      setError('Định dạng tệp không được hỗ trợ. Vui lòng chọn ảnh JPG, PNG hoặc WebP.')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Dung lượng ảnh vượt quá giới hạn tối đa (10 MB).')
      return
    }

    setError(null)
    setIsUploading(true)
    onBusyChange?.(true)

    // Create temporary local preview
    const tempBlobUrl = URL.createObjectURL(file)
    const previousKey = mediaKey

    setTempPreview(tempBlobUrl)

    const result = await uploadAdminMedia(file, { getToken })

    setIsUploading(false)
    onBusyChange?.(false)
    setTempPreview(null)

    if (result.ok && result.data?.url) {
      const newUrl = result.data.url
      const newKey = result.data.key

      onChange?.({ key: newKey, previousKey, url: newUrl })

      // If we had a previously uploaded remote image, clean it up safely in background
      if (!deferDelete && previousKey && previousKey !== newKey) {
        deleteAdminMedia(previousKey, { getToken }).catch(() => {})
      }
    } else {
      setError(result.error?.message || 'Không thể tải ảnh lên. Vui lòng thử lại.')
    }

    // Clean up temporary blob URL
    URL.revokeObjectURL(tempBlobUrl)
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      processUpload(file)
    }
    // Reset file input value so selecting the same file triggers onChange
    if (e.target) {
      e.target.value = ''
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled && !isUploading && !isDeleting) {
      setIsDragging(true)
    }
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (disabled || isUploading || isDeleting) return

    const file = e.dataTransfer?.files?.[0]
    if (file) {
      processUpload(file)
    }
  }

  const handleDelete = async () => {
    if (disabled || isUploading || isDeleting) return
    setError(null)
    setIsDeleting(true)
    onBusyChange?.(true)

    const keyToDelete = mediaKey

    if (keyToDelete && !deferDelete) {
      const result = await deleteAdminMedia(keyToDelete, { getToken })
      if (!result.ok) {
        setIsDeleting(false)
        onBusyChange?.(false)
        setError(result.error?.message || 'Không thể xóa ảnh. Vui lòng thử lại.')
        return
      }
    }

    // Smooth removal animation
    setIsFadingOut(true)
    setTimeout(() => {
      setTempPreview(null)
      setIsFadingOut(false)
      setIsDeleting(false)
      onBusyChange?.(false)
      onChange?.({ key: null, previousKey: keyToDelete, url: '' })
    }, 200)
  }

  const displayUrl = tempPreview || value || ''
  const hasImage = Boolean(displayUrl)

  return (
    <div className="admin-image-uploader">
      <label className="admin-image-uploader__label">Ảnh sản phẩm</label>

      <input
        ref={fileInputRef}
        accept="image/jpeg,image/png,image/webp"
        aria-label="Tải ảnh sản phẩm từ thiết bị"
        className="admin-image-uploader__input"
        disabled={disabled || isUploading || isDeleting}
        type="file"
        onChange={handleFileChange}
      />

      {hasImage ? (
        <div
          className={`admin-image-uploader__preview-container ${
            isFadingOut ? 'admin-image-uploader__preview--fading' : ''
          }`}
        >
          <div className="admin-image-uploader__thumb-wrapper">
            <img
              alt="Xem trước ảnh sản phẩm"
              className="admin-image-uploader__thumb"
              src={displayUrl}
            />
            {isUploading && (
              <div aria-live="polite" className="admin-image-uploader__overlay" role="status">
                <span className="admin-spinner" />
                <p>Đang tải ảnh...</p>
              </div>
            )}
            {isDeleting && (
              <div aria-live="polite" className="admin-image-uploader__overlay" role="status">
                <span className="admin-spinner" />
                <p>Đang xóa...</p>
              </div>
            )}
          </div>

          <div className="admin-image-uploader__actions">
            <button
              className="button button--secondary button--small"
              disabled={disabled || isUploading || isDeleting}
              type="button"
              onClick={handleSelectFile}
            >
              Thay ảnh
            </button>
            <button
              className="button button--text button--small admin-btn-danger"
              disabled={disabled || isUploading || isDeleting}
              type="button"
              onClick={handleDelete}
            >
              {isDeleting ? 'Đang xóa...' : 'Xóa ảnh'}
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`admin-image-uploader__dropzone ${
            isDragging ? 'admin-image-uploader__dropzone--dragging' : ''
          }`}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {isUploading ? (
            <div aria-live="polite" className="admin-image-uploader__status" role="status">
              <span className="admin-spinner" />
              <p>Đang tải ảnh...</p>
            </div>
          ) : (
            <div className="admin-image-uploader__empty">
              <button
                className="button button--secondary button--small admin-image-uploader__btn"
                disabled={disabled}
                type="button"
                onClick={handleSelectFile}
              >
                + Chọn ảnh
              </button>
              <p className="admin-image-uploader__formats">JPG, PNG hoặc WebP</p>
              <p className="admin-image-uploader__hint">Kéo ảnh vào đây hoặc chọn từ thiết bị</p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="admin-image-uploader__error" role="alert">
          <p>{error}</p>
        </div>
      )}
    </div>
  )
}
