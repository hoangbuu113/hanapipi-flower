import { useMemo } from 'react'
import { useCommerce } from '../context/commerceStore'
import { isDeliveryDateAvailable } from '../utils/delivery'
import './DeliverySelector.css'

const slots = ['09:00 – 12:00', '13:00 – 17:00', '17:00 – 20:00']

function createDateOptions() {
  const now = new Date()
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now)
    date.setDate(now.getDate() + index)
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const label = index === 0 ? 'Hôm nay' : index === 1 ? 'Ngày mai' : new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', weekday: 'long' }).format(date)
    return { disabled: !isDeliveryDateAvailable(value, now), label, value }
  })
}

function DeliverySelector() {
  const { deliveryDraft, setDeliveryDraft } = useCommerce()
  const dates = useMemo(() => createDateOptions(), [])
  const sameDayUnavailable = dates[0].disabled
  function chooseDate(date) { setDeliveryDraft({ date, slot: null }) }
  return <section className="delivery-selector" aria-labelledby="delivery-title">
    <p className="eyebrow">Một lựa chọn dự kiến</p><h2 id="delivery-title">Thời gian giao hoa</h2>
    <div className="delivery-selector__group"><h3>Chọn ngày giao</h3><div className="delivery-date-list">{dates.map((date) => <button aria-pressed={deliveryDraft.date === date.value} className={deliveryDraft.date === date.value ? 'is-selected' : ''} disabled={date.disabled} key={date.value} type="button" onClick={() => chooseDate(date.value)}>{date.label}{deliveryDraft.date === date.value && <span aria-hidden="true"> ✓</span>}</button>)}</div></div>
    {sameDayUnavailable && <p className="delivery-selector__notice">Khung giờ giao trong ngày đã kết thúc. Bạn có thể chọn ngày gần nhất tiếp theo.</p>}
    <div className="delivery-selector__group"><h3>Chọn khung giờ</h3><div className="delivery-slot-list">{slots.map((slot) => <button aria-pressed={deliveryDraft.slot === slot} className={deliveryDraft.slot === slot ? 'is-selected' : ''} disabled={!deliveryDraft.date} key={slot} type="button" onClick={() => setDeliveryDraft({ ...deliveryDraft, slot })}>{slot}{deliveryDraft.slot === slot && <span aria-hidden="true"> ✓</span>}</button>)}</div></div>
    <p className="delivery-selector__disclosure">Khung giờ sẽ được xác nhận theo địa chỉ giao hàng ở bước thanh toán.</p>
  </section>
}
export default DeliverySelector
