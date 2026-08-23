import { Link } from 'react-router-dom'
import Container from '../components/Container'
import './InformationPages.css'

function FlowerCarePage() {
  return (
    <main className="information-page">
      <Container>
        <header className="information-page__intro">
          <p className="eyebrow">Để hoa ở lại lâu hơn</p>
          <h1>Hướng dẫn chăm hoa</h1>
          <p>Một vài thao tác nhỏ giúp bó hoa giữ được dáng và vẻ tươi mới lâu hơn.</p>
        </header>

        <div className="information-page__sections">
          <section>
            <h2>Khi vừa nhận hoa</h2>
            <p>
              Dùng kéo sạch cắt vát gốc khoảng 1–2 cm, bỏ những lá nằm dưới mặt nước và
              đặt hoa vào bình đã được rửa sạch.
            </p>
          </section>
          <section>
            <h2>Chăm hoa mỗi ngày</h2>
            <p>
              Thay nước sạch hằng ngày, rửa lại bình và cắt thêm một đoạn ngắn ở gốc nếu
              cành hoa bắt đầu mềm.
            </p>
          </section>
          <section>
            <h2>Chọn vị trí phù hợp</h2>
            <p>
              Giữ hoa ở nơi thoáng mát, tránh nắng trực tiếp, luồng gió mạnh và đặt xa
              trái cây đang chín.
            </p>
          </section>
        </div>

        <Link className="button button--secondary information-page__action" to="/shop">
          Khám phá bộ sưu tập
        </Link>
      </Container>
    </main>
  )
}

export default FlowerCarePage
