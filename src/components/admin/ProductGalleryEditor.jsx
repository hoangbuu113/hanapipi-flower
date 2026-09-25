import { useRef, useState } from 'react'
import { uploadAdminMedia } from '../../services/adminClient'
import { MAX_PRODUCT_GALLERY_IMAGES, resolveMediaSrc } from '../../utils/media'

export default function ProductGalleryEditor({ disabled, getToken, media, onBusyChange, onChange, productName }) {
  const fileInputRef = useRef(null)
  const uploadTargetRef = useRef(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState('')

  function chooseFile(index = null) {
    if (disabled || isUploading) return
    uploadTargetRef.current = index
    setError('')
    fileInputRef.current?.click()
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setError('Chọn ảnh JPG, PNG hoặc WebP không quá 10 MB.')
      return
    }

    const targetIndex = uploadTargetRef.current
    setIsUploading(true)
    onBusyChange(true)
    try {
      const result = await uploadAdminMedia(file, { getToken })
      if (!result.ok || !result.data?.url) {
        setError(result.error?.message || 'Không thể tải ảnh lên. Vui lòng thử lại.')
        return
      }
      const item = {
        alt: productName,
        caption: null,
        fit: 'cover',
        position: 'center',
        poster: null,
        src: result.data.url,
        type: 'image',
      }
      const nextMedia = [...media]
      if (targetIndex === null) nextMedia.push(item)
      else nextMedia[targetIndex] = item
      onChange(nextMedia, result.data.key)
    } finally {
      setIsUploading(false)
      onBusyChange(false)
    }
  }

  function moveImage(index, destination) {
    if (disabled || destination < 0 || destination >= media.length) return
    const nextMedia = [...media]
    const [item] = nextMedia.splice(index, 1)
    nextMedia.splice(destination, 0, item)
    onChange(nextMedia)
  }

  return (
    <div className="admin-gallery-editor">
      <p className="admin-gallery-editor__hint">Ảnh đầu tiên là ảnh chính. Thay đổi chỉ có hiệu lực sau khi lưu sản phẩm. Tối đa {MAX_PRODUCT_GALLERY_IMAGES} ảnh.</p>
      <input
        ref={fileInputRef}
        accept="image/jpeg,image/png,image/webp"
        aria-label="Chọn ảnh sản phẩm để tải lên"
        className="admin-image-uploader__input"
        disabled={disabled || isUploading}
        type="file"
        onChange={handleFileChange}
      />
      <div className="admin-gallery-editor__list">
        {media.map((item, index) => (
          <div className="admin-gallery-editor__tile" key={item.src}>
            <img alt={item.alt || `${productName} — ảnh ${index + 1}`} src={resolveMediaSrc(item.type === 'video' ? item.poster : item.src)} />
            <div className="admin-gallery-editor__tile-actions">
              <span>{index === 0 ? 'Ảnh chính' : `Ảnh ${index + 1}`}</span>
              {index > 0 && (
                <button disabled={disabled || isUploading} type="button" onClick={() => moveImage(index, 0)}>Đặt làm ảnh chính</button>
              )}
              <div className="admin-gallery-editor__order">
                <button aria-label={`Đưa ảnh ${index + 1} lên trước`} disabled={disabled || isUploading || index === 0} type="button" onClick={() => moveImage(index, index - 1)}>←</button>
                <button aria-label={`Đưa ảnh ${index + 1} xuống sau`} disabled={disabled || isUploading || index === media.length - 1} type="button" onClick={() => moveImage(index, index + 1)}>→</button>
              </div>
              <button disabled={disabled || isUploading} type="button" onClick={() => chooseFile(index)}>Thay ảnh</button>
              <button className="admin-gallery-editor__remove" disabled={disabled || isUploading} type="button" onClick={() => onChange(media.filter((_, itemIndex) => itemIndex !== index))}>Xóa ảnh</button>
            </div>
          </div>
        ))}
        {media.length < MAX_PRODUCT_GALLERY_IMAGES && (
          <button className="admin-gallery-editor__add" disabled={disabled || isUploading} type="button" onClick={() => chooseFile()}>
            {isUploading ? 'Đang tải ảnh...' : '+ Thêm ảnh'}
          </button>
        )}
      </div>
      {error && <p className="admin-image-uploader__error" role="alert">{error}</p>}
    </div>
  )
}
