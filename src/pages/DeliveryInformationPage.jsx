import { Link } from 'react-router-dom'
import Container from '../components/Container'
import { deliveryKnowledge } from '../data/supportKnowledge'
import { usePublicCommerce } from '../context/publicCommerceStore.js'
import './InformationPages.css'

function DeliveryInformationPage() {
  const { mode } = usePublicCommerce()
  const sections = mode === 'checkout' ? deliveryKnowledge.sections : [
    { title: 'Trao đổi thời gian gửi hoa', text: 'Bạn có thể trao đổi ngày và khung giờ mong muốn khi liên hệ tư vấn. Hut Flower sẽ xác nhận khả năng phục vụ theo địa chỉ và tình trạng hoa.' },
    { title: 'Lựa chọn dự kiến', text: 'Ngày và khung giờ trong Giỏ hàng chỉ là gợi ý để bạn cân nhắc, không phải xác nhận giao hoa.' },
    { title: 'Phạm vi và chi phí', text: 'Thông tin giao nhận tại TP. Hồ Chí Minh và chi phí được trao đổi trực tiếp khi tư vấn.' },
  ]
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
          {sections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              <p>{section.text}</p>
            </section>
          ))}
        </div>

        <Link className="button button--secondary information-page__action" to="/shop">
          Chọn hoa
        </Link>
      </Container>
    </main>
  )
}

export default DeliveryInformationPage
