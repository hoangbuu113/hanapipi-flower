import { Link } from 'react-router-dom'
import Container from '../components/Container'
import './InformationPages.css'

function DeliveryInformationPage() {
  return (
    <main className="information-page">
      <Container>
        <header className="information-page__intro">
          <p className="eyebrow">Gửi hoa thật chỉn chu</p>
          <h1>Thông tin giao hoa</h1>
          <p>
            Những thông tin ngắn gọn để bạn chủ động chọn thời gian gửi hoa phù hợp.
          </p>
        </header>

        <div className="information-page__sections">
          <section>
            <h2>Giao hoa trong ngày</h2>
            <p>
              Với đơn đặt trước 14:00, bạn có thể chọn mong muốn giao trong ngày. Khả
              năng phục vụ sẽ được xác nhận theo địa chỉ và tình trạng hoa tại thời điểm
              đặt hàng.
            </p>
          </section>
          <section>
            <h2>Ngày và khung giờ</h2>
            <p>
              Ngày cùng khung giờ tại Giỏ hàng và Thanh toán là lựa chọn dự kiến. Hanapipi
              Flower sẽ xác nhận lại thời gian phù hợp dựa trên địa chỉ người nhận.
            </p>
          </section>
          <section>
            <h2>Phạm vi và chi phí</h2>
            <p>
              Website hiện chưa tính phí giao động theo khu vực. Mọi thông tin giao nhận
              cần được xác nhận trước khi đơn hoa được xử lý thực tế.
            </p>
          </section>
        </div>

        <Link className="button button--secondary information-page__action" to="/shop">
          Chọn hoa
        </Link>
      </Container>
    </main>
  )
}

export default DeliveryInformationPage
