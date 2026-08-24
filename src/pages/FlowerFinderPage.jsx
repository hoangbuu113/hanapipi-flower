import { ArrowLeft, ArrowRight, Check, MessageCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Container from '../components/Container'
import ProductCard from '../components/ProductCard'
import { products } from '../data/products'
import { openConcierge } from '../utils/conciergeEvents'
import {
  buildRecommendationCopy,
  criteriaFromStepAnswers,
  rankProducts,
} from '../utils/conciergeGrounding'
import './FlowerFinderPage.css'

const questions = [
  { key: 'occasion', title: 'Bạn muốn gửi hoa cho dịp nào?', options: ['Sinh nhật', 'Yêu thương', 'Lời cảm ơn', 'Chia sẻ', 'Tặng không cần dịp'] },
  { key: 'mood', title: 'Bạn muốn bó hoa mang cảm xúc gì?', options: ['Dịu dàng', 'Tươi sáng', 'Thanh lịch', 'Ấm áp'] },
  { key: 'color', title: 'Bạn yêu thích tông màu nào?', options: ['Kem và trắng', 'Hồng dịu', 'Vàng ấm', 'Đỏ sâu', 'Xanh dịu'] },
  { key: 'budget', title: 'Ngân sách của bạn là bao nhiêu?', options: ['Dưới 600.000 ₫', '600.000 ₫ – 750.000 ₫', 'Từ 750.000 ₫'] },
]

function StepFinder() {
  const [started, setStarted] = useState(false)
  const [step, setStep] = useState(1)
  const [answers, setAnswers] = useState({})
  const [error, setError] = useState('')
  const question = questions[step - 1]
  const criteria = useMemo(() => criteriaFromStepAnswers(answers), [answers])
  const recommendations = useMemo(
    () => step === 5 ? rankProducts(products, criteria, 6) : [],
    [criteria, step],
  )

  function next() {
    if (!answers[question.key]) {
      setError('Hãy chọn một phương án để tiếp tục.')
      return
    }
    setError('')
    setStep((current) => current + 1)
  }

  function restart() {
    setAnswers({})
    setError('')
    setStep(1)
  }

  if (!started) {
    return (
      <section className="finder-intro" aria-labelledby="step-finder-intro-title">
        <div>
          <p className="eyebrow">Một gợi ý thật vừa vặn</p>
          <h1 id="step-finder-intro-title">Tìm một bó hoa thật vừa vặn.</h1>
          <p>Trả lời vài câu hỏi, Hanapipi Flower sẽ gợi ý những thiết kế phù hợp với dịp bạn muốn gửi gắm.</p>
          <button className="button button--primary" type="button" onClick={() => setStarted(true)}>
            Bắt đầu tìm hoa <ArrowRight aria-hidden="true" />
          </button>
        </div>
      </section>
    )
  }

  if (step === 5) {
    return (
      <section className="finder-results" aria-labelledby="step-results-title">
        <header className="finder-results__header">
          <div>
            <p className="eyebrow">Dựa trên lựa chọn của bạn</p>
            <h1 id="step-results-title">Gợi ý dành cho bạn</h1>
          </div>
          <button className="button button--text" type="button" onClick={restart}>Bắt đầu lại</button>
        </header>
        <div className="finder-results__grid">
          {recommendations.map((recommendation) => (
            <article className="finder-result" key={recommendation.product.id}>
              <ProductCard product={recommendation.product} />
              <p>Vì sao phù hợp: {buildRecommendationCopy(recommendation, criteria).reason}</p>
            </article>
          ))}
        </div>
        <Link className="button button--secondary finder-all-link" to="/shop">Xem tất cả bó hoa</Link>
      </section>
    )
  }

  return (
    <section className="finder-step" aria-labelledby="finder-question-title">
      <header className="finder-page__header">
        <p className="eyebrow">Tìm hoa theo cảm xúc</p>
        <div><span>{String(step).padStart(2, '0')} / 04</span><strong>{['Dịp tặng', 'Cảm xúc', 'Tông màu', 'Ngân sách'][step - 1]}</strong></div>
      </header>
      <div className="finder-question">
        <div className="finder-progress" aria-hidden="true"><i style={{ width: `${(step / 4) * 100}%` }} /></div>
        <h1 id="finder-question-title">{question.title}</h1>
        <div className="finder-option-list">
          {question.options.map((option) => (
            <button
              aria-pressed={answers[question.key] === option}
              className={answers[question.key] === option ? 'is-selected' : ''}
              key={option}
              type="button"
              onClick={() => {
                setAnswers((current) => ({ ...current, [question.key]: option }))
                setError('')
              }}
            >
              <span>{option}</span>
              {answers[question.key] === option && <Check aria-hidden="true" />}
            </button>
          ))}
        </div>
        {error && <p className="finder-error" role="alert">{error}</p>}
        <div className="finder-actions">
          <button className="button button--text" disabled={step === 1} type="button" onClick={() => setStep((current) => current - 1)}>
            <ArrowLeft aria-hidden="true" /> Quay lại
          </button>
          <button className="button button--primary" type="button" onClick={next}>
            Tiếp tục <ArrowRight aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  )
}

function FlowerFinderPage() {
  return (
    <main className="finder-page">
      <Container>
        <StepFinder />
        <aside className="finder-concierge-cta" aria-label="Tư vấn bằng ngôn ngữ tự nhiên">
          <p>Bạn muốn hỏi tự nhiên hơn?</p>
          <button className="button button--text" type="button" onClick={(event) => openConcierge(event.currentTarget)}>
            <MessageCircle aria-hidden="true" /> Mở Hanapipi tư vấn
          </button>
        </aside>
      </Container>
    </main>
  )
}

export default FlowerFinderPage
