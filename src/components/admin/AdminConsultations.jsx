import { useEffect, useRef, useState } from 'react'
import { requestAdminConsultations } from '../../services/consultationClient.js'
import { formatCurrency } from '../../utils/formatCurrency.js'
import AdminModal from './AdminModal.jsx'

const statuses = { new: 'Mới nhận', contacted: 'Đã liên hệ', closed: 'Đã khép lại' }
const notifications = { pending: 'Đang chờ gửi', sent: 'Đã gửi', partial: 'Đã gửi một phần', failed: 'Chưa gửi được' }
const dates = (date) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(date))

export default function AdminConsultations({ getToken }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [detail, setDetail] = useState(null)
  const [busy, setBusy] = useState(false)
  const [detailError, setDetailError] = useState('')
  const detailVersion = useRef(0)
  useEffect(() => {
    const controller = new AbortController()
    let live = true
    requestAdminConsultations('', { getToken, signal: controller.signal }).then((result) => {
      if (!live) return
      if (result.ok) { setItems(result.items); setError('') }
      else setError(result.error)
      setLoading(false)
    })
    return () => { live = false; controller.abort(); detailVersion.current += 1 }
  }, [getToken, reload])
  function refresh() { setLoading(true); setReload((value) => value + 1) }
  async function open(item) {
    const version = ++detailVersion.current
    setDetail({ ...item, items: [] }); setBusy(true); setDetailError('')
    const result = await requestAdminConsultations(`/${encodeURIComponent(item.id)}`, { getToken })
    if (detailVersion.current !== version) return
    if (result.ok) setDetail(result.consultation)
    else setDetailError(result.error)
    setBusy(false)
  }
  function close() { detailVersion.current += 1; setDetail(null); setBusy(false) }
  async function update() {
    if (busy) return
    const version = ++detailVersion.current
    setBusy(true); setDetailError('')
    const result = await requestAdminConsultations(`/${encodeURIComponent(detail.id)}/status`, { getToken, status: detail.status === 'new' ? 'contacted' : 'closed' })
    if (detailVersion.current !== version) return
    if (result.ok) { setDetail(result.consultation); setItems((current) => current.map((item) => item.id === result.consultation.id ? result.consultation : item)) }
    else setDetailError(result.error)
    setBusy(false)
  }
  return <section className="admin-orders-section" aria-labelledby="consultations-title">
    <div className="admin-catalogue-header"><h2 id="consultations-title">Yêu cầu tư vấn</h2><button className="button button--secondary" type="button" onClick={refresh} disabled={loading}>Tải lại</button></div>
    {loading && <p role="status">Đang tải yêu cầu tư vấn...</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && !items.length && <p>Chưa có yêu cầu tư vấn.</p>}
    {items.length > 0 && <div className="admin-table-container"><table className="admin-table"><thead><tr><th>Mã tham chiếu</th><th>Thời gian</th><th>Giá tham khảo</th><th>Trạng thái</th><th>Telegram</th><th>Chi tiết</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.referenceCode}</td><td>{dates(item.createdAt)}</td><td>{formatCurrency(item.referenceTotal)}</td><td>{statuses[item.status]}</td><td>{notifications[item.notificationStatus]}</td><td><button className="button button--text" type="button" onClick={() => open(item)}>Xem chi tiết</button></td></tr>)}</tbody></table></div>}
    {detail && <div className="admin-modal-backdrop" onClick={close} role="presentation"><AdminModal className="admin-modal" onClose={close} aria-labelledby="consultation-detail-title">
      <div className="admin-modal__header"><h2 id="consultation-detail-title">Tư vấn {detail.referenceCode}</h2><button className="button button--text" type="button" onClick={close} aria-label="Đóng chi tiết tư vấn">Đóng</button></div>
      <p>{dates(detail.createdAt)} · {statuses[detail.status]} · Telegram: {notifications[detail.notificationStatus]}</p>
      {busy && <p role="status">Đang cập nhật...</p>}{detailError && <p role="alert">{detailError}</p>}
      <div className="consultation-detail">{detail.items.map((item, index) => <article key={index}>
        {item.image && <img src={item.image} alt={item.name} width="120" height="150" loading="lazy" />}
        <div><h3>{item.name} × {item.quantity}</h3><p>{formatCurrency(item.unitReferencePrice)} / bó · {formatCurrency(item.lineReferenceTotal)}</p>
          {['style', 'palette', 'size', 'wrapping'].map((key) => item.selections[key] && <p key={key}>{item.selections[key].label}</p>)}
          {item.selections.flowers?.length > 0 && <p>Hoa chủ đạo: {item.selections.flowers.map((flower) => flower.label).join(', ')}</p>}
          {item.selections.gifts?.length > 0 && <p>Quà kèm: {item.selections.gifts.map((gift) => `${gift.label} (${formatCurrency(gift.price)})`).join(', ')}</p>}
          {item.selections.message && <p>Lời nhắn: {item.selections.message}</p>}</div>
      </article>)}</div>
      <p><strong>Tổng giá tham khảo: {formatCurrency(detail.referenceTotal)}</strong></p>
      {detail.status !== 'closed' && <button className="button button--primary" type="button" disabled={busy || Boolean(detailError)} onClick={update}>{detail.status === 'new' ? 'Đánh dấu đã liên hệ' : 'Khép lại yêu cầu'}</button>}
    </AdminModal></div>}
  </section>
}
