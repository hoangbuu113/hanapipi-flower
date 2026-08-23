import { Link, useParams } from 'react-router-dom'
import Container from '../components/Container'
import { useAccount } from '../context/accountStore'
import { formatCurrency } from '../utils/formatCurrency'
import { formatDeliveryDate } from '../utils/order'
import './CheckoutSuccessPage.css'

function CheckoutSuccessPage() {
  const { orderCode } = useParams()
  const { orders, user } = useAccount()
  const order = orders.find((entry) => entry.code === orderCode)
  if (!order) return <main className="success-page"><Container><p className="eyebrow">Chưa tìm thấy đơn hoa</p><h1>Đơn hoa này không còn trong dữ liệu demo.</h1><Link className="button button--secondary" to="/shop">Tiếp tục chọn hoa</Link></Container></main>
  return <main className="success-page"><Container><div className="success-page__content"><p className="eyebrow">Cảm ơn bạn đã chọn Hanapipi Flower</p><h1>Đơn hoa đã được ghi nhận</h1><p className="success-page__code">Mã đơn: <strong>{order.code}</strong></p><dl><div><dt>Người nhận</dt><dd>{order.receiver.name}</dd></div><div><dt>Giao dự kiến</dt><dd>{formatDeliveryDate(order.delivery.date)} · {order.delivery.slot}</dd></div><div><dt>Tổng tiền</dt><dd>{formatCurrency(order.total)}</dd></div></dl><p className="success-page__note">Đây là đơn hàng demo. Thời gian giao và phương thức thanh toán sẽ cần được xác nhận trước khi xử lý thực tế.</p><div className="success-page__actions"><Link className="button button--primary" to="/account">Xem đơn hàng</Link><Link className="button button--secondary" to="/shop">Tiếp tục chọn hoa</Link>{!user && <Link className="button button--text" to="/register">Tạo tài khoản để lưu thông tin</Link>}</div></div></Container></main>
}
export default CheckoutSuccessPage
