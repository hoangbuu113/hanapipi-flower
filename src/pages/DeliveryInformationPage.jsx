import { Link } from 'react-router-dom'
import Container from '../components/Container'
import { deliveryKnowledge } from '../data/supportKnowledge'
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
          {deliveryKnowledge.sections.map((section) => (
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
