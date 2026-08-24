import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Container from '../components/Container'
import ProductCard from '../components/ProductCard'
import { products } from '../data/products'
import { getConciergeAdvice } from '../services/conciergeService'
import { formatCurrency } from '../utils/formatCurrency'
import {
  buildRecommendationCopy,
  criteriaFromStepAnswers,
  getGroundedCandidates,
  rankProducts,
} from '../utils/conciergeGrounding'
import './FlowerFinderPage.css'

const questions = [
  { key: 'occasion', title: 'Bạn muốn gửi hoa cho dịp nào?', options: ['Sinh nhật', 'Yêu thương', 'Lời cảm ơn', 'Chia sẻ', 'Tặng không cần dịp'] },
  { key: 'mood', title: 'Bạn muốn bó hoa mang cảm xúc gì?', options: ['Dịu dàng', 'Tươi sáng', 'Thanh lịch', 'Ấm áp'] },
  { key: 'color', title: 'Bạn yêu thích tông màu nào?', options: ['Kem và trắng', 'Hồng dịu', 'Vàng ấm', 'Đỏ sâu', 'Xanh dịu'] },
  { key: 'budget', title: 'Ngân sách của bạn là bao nhiêu?', options: ['Dưới 600.000 ₫', '600.000 ₫ – 750.000 ₫', 'Từ 750.000 ₫'] },
]

const guidanceTopics = ['Người nhận', 'Dịp tặng', 'Cảm xúc', 'Màu yêu thích', 'Ngân sách', 'Thời điểm giao']

function FinderModeControl({ mode, onChange }) {
  return (
    <div aria-label="Cách tìm hoa" className="finder-mode-control" role="group">
      <button
        aria-pressed={mode === 'concierge'}
        className={mode === 'concierge' ? 'is-active' : ''}
        type="button"
        onClick={() => onChange('concierge')}
      >
        Tư vấn theo lời bạn
      </button>
      <button
        aria-pressed={mode === 'steps'}
        className={mode === 'steps' ? 'is-active' : ''}
        type="button"
        onClick={() => onChange('steps')}
      >
        Chọn từng bước
      </button>
    </div>
  )
}

function RecommendationCard({ recommendation }) {
  const { fitTags, product, reason } = recommendation
  const image = product.images[0]

  return (
    <article className="concierge-result-card">
      <Link
        aria-label={`Xem bó hoa ${product.name}`}
        className="concierge-result-card__media"
        to={`/product/${product.slug}`}
      >
        <img
          alt={image.alt}
          loading="lazy"
          src={image.src}
          style={{ objectFit: image.fit ?? 'cover', objectPosition: image.position }}
        />
      </Link>
      <div className="concierge-result-card__content">
        <div className="concierge-result-card__heading">
          <h3>{product.name}</h3>
          <strong>{formatCurrency(product.price)}</strong>
        </div>
        <p>{reason}</p>
        {fitTags.length > 0 && (
          <ul aria-label="Điểm phù hợp" className="concierge-fit-tags">
            {fitTags.map((tag) => <li key={tag}>{tag}</li>)}
          </ul>
        )}
        <Link className="button button--secondary" to={`/product/${product.slug}`}>
          Xem bó hoa <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </article>
  )
}

function ConciergeFinder({ onChooseSteps }) {
  const [message, setMessage] = useState('')
  const [inputError, setInputError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState(null)
  const textareaRef = useRef(null)

  async function findFlowers(nextMessage) {
    const trimmedMessage = nextMessage.trim()
    if (!trimmedMessage) {
      setInputError('Hãy chia sẻ đôi điều về món quà bạn muốn gửi.')
      setResult(null)
      textareaRef.current?.focus()
      return
    }

    setInputError('')
    const grounding = getGroundedCandidates(trimmedMessage, products)
    if (grounding.clarification) {
      setResult({ ...grounding.clarification, status: 'clarification' })
      return
    }
    if (grounding.candidates.length === 0) {
      setResult({ status: 'no-results' })
      return
    }

    setIsLoading(true)
    setResult(null)
    const advice = await getConciergeAdvice({
      catalogue: products,
      criteria: grounding.criteria,
      message: trimmedMessage,
      rankedCandidates: grounding.candidates,
    })
    setResult(advice)
    setIsLoading(false)
  }

  function handleSubmit(event) {
    event.preventDefault()
    void findFlowers(message)
  }

  function handleClarification(option) {
    const nextMessage = `${message.trim()} Bổ sung: ${option}.`.trim()
    setMessage(nextMessage)
    void findFlowers(nextMessage)
  }

  function adjustNeeds() {
    setResult(null)
    textareaRef.current?.focus()
  }

  return (
    <section className="concierge-panel" aria-labelledby="concierge-title">
      <header className="concierge-panel__intro">
        <p className="eyebrow">Một gợi ý vừa vặn, bắt đầu từ lời bạn</p>
        <h1 id="concierge-title">Kể chúng tôi nghe về món quà bạn muốn gửi.</h1>
        <p>
          Chia sẻ vài ý chính, Hanapipi Flower sẽ đối chiếu với bộ sưu tập hiện có để chọn những gợi ý gần nhất.
        </p>
      </header>

      <form className="concierge-form" noValidate onSubmit={handleSubmit}>
        <label htmlFor="concierge-message">Điều bạn đang tìm kiếm</label>
        <textarea
          aria-describedby={`concierge-guidance concierge-count${inputError ? ' concierge-error' : ''}`}
          aria-invalid={Boolean(inputError)}
          id="concierge-message"
          maxLength={500}
          placeholder="Mình muốn tặng bạn gái nhân dịp kỷ niệm, thích hoa trắng hồng và ngân sách khoảng 800.000 ₫."
          ref={textareaRef}
          rows={6}
          value={message}
          onChange={(event) => {
            setMessage(event.target.value)
            if (inputError) setInputError('')
          }}
        />
        <div className="concierge-form__meta">
          <p id="concierge-guidance">Không cần chia sẻ tên, số điện thoại hoặc địa chỉ.</p>
          <span id="concierge-count">{message.length}/500</span>
        </div>
        <div className="concierge-topics" aria-label="Những điều có thể nhắc đến">
          <span>Bạn có thể nhắc đến</span>
          <ul>
            {guidanceTopics.map((topic) => <li key={topic}>{topic}</li>)}
          </ul>
        </div>
        {inputError && <p className="finder-error" id="concierge-error" role="alert">{inputError}</p>}
        <button className="button button--primary" disabled={isLoading} type="submit">
          Tìm bó hoa phù hợp <ArrowRight aria-hidden="true" />
        </button>
      </form>

      {isLoading && (
        <div aria-live="polite" className="concierge-loading" role="status">
          <span aria-hidden="true" />
          <p>Đang đối chiếu với bộ sưu tập Hanapipi Flower…</p>
        </div>
      )}

      {result?.status === 'clarification' && (
        <section aria-labelledby="concierge-clarification-title" className="concierge-clarification">
          <p className="eyebrow">Thêm một chi tiết nhỏ</p>
          <h2 id="concierge-clarification-title">{result.question ?? result.clarifyingQuestion?.question}</h2>
          <div className="concierge-clarification__options">
            {(result.options ?? result.clarifyingQuestion?.options ?? []).map((option) => (
              <button className="button button--secondary" key={option} type="button" onClick={() => handleClarification(option)}>
                {option}
              </button>
            ))}
          </div>
        </section>
      )}

      {result?.status === 'no-results' && (
        <section aria-labelledby="concierge-empty-title" className="concierge-empty">
          <p className="eyebrow">Chưa tìm thấy lựa chọn vừa vặn</p>
          <h2 id="concierge-empty-title">Thử nới khoảng ngân sách hoặc chọn thêm một tông màu.</h2>
          <div className="concierge-result-actions">
            <button className="button button--secondary" type="button" onClick={adjustNeeds}>Điều chỉnh nhu cầu</button>
            <button className="button button--text" type="button" onClick={onChooseSteps}>Chọn từng bước</button>
          </div>
        </section>
      )}

      {result?.status === 'recommendations' && (
        <section aria-labelledby="concierge-results-title" className="concierge-results">
          <header className="concierge-results__header">
            <div>
              <p className="eyebrow">
                {result.source === 'deterministic'
                  ? 'Gợi ý từ bộ lọc Hanapipi Flower.'
                  : 'Gợi ý từ Hanapipi AI'}
              </p>
              <h2 id="concierge-results-title">{result.intro || 'Những lựa chọn dành cho bạn'}</h2>
            </div>
            <div className="concierge-result-actions">
              <button className="button button--text" type="button" onClick={adjustNeeds}>Điều chỉnh nhu cầu</button>
              <button className="button button--text" type="button" onClick={onChooseSteps}>Chọn từng bước</button>
            </div>
          </header>
          {result.notice && <p className="concierge-fallback-notice" role="status">{result.notice}</p>}
          <div className="concierge-results__grid">
            {result.recommendations.map((recommendation) => (
              <RecommendationCard key={recommendation.productId} recommendation={recommendation} />
            ))}
          </div>
          <p className="concierge-disclosure">
            Hoa có thể được thay thế tương đương theo mùa. Thời gian giao sẽ được xác nhận theo địa chỉ ở bước thanh toán.
          </p>
        </section>
      )}
    </section>
  )
}

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
  const [mode, setMode] = useState('concierge')

  return (
    <main className="finder-page">
      <Container>
        <div className="finder-mode-header">
          <span>Hai cách tìm hoa</span>
          <FinderModeControl mode={mode} onChange={setMode} />
        </div>
        {mode === 'concierge'
          ? <ConciergeFinder onChooseSteps={() => setMode('steps')} />
          : <StepFinder />}
      </Container>
    </main>
  )
}

export default FlowerFinderPage
