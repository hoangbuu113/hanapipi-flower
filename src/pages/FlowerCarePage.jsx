import { Link } from 'react-router-dom'
import Container from '../components/Container'
import { flowerCareKnowledge } from '../data/supportKnowledge'
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
          {flowerCareKnowledge.sections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              <p>{section.text}</p>
            </section>
          ))}
        </div>

        <Link className="button button--secondary information-page__action" to="/shop">
          Khám phá bộ sưu tập
        </Link>
      </Container>
    </main>
  )
}

export default FlowerCarePage
