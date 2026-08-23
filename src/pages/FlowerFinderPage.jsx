import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Container from '../components/Container'
import ProductCard from '../components/ProductCard'
import { products } from '../data/products'
import './FlowerFinderPage.css'

const questions = [
  { key: 'occasion', title: 'Bạn muốn gửi hoa cho dịp nào?', options: ['Sinh nhật', 'Yêu thương', 'Lời cảm ơn', 'Chia sẻ', 'Tặng không cần dịp'] },
  { key: 'mood', title: 'Bạn muốn bó hoa mang cảm xúc gì?', options: ['Dịu dàng', 'Tươi sáng', 'Thanh lịch', 'Ấm áp'] },
  { key: 'color', title: 'Bạn yêu thích tông màu nào?', options: ['Kem và trắng', 'Hồng dịu', 'Cam đào', 'Tím khói', 'Xanh trắng'] },
  { key: 'budget', title: 'Ngân sách của bạn là bao nhiêu?', options: ['Dưới 600.000 ₫', '600.000 ₫ – 750.000 ₫', 'Từ 750.000 ₫'] },
]

const moodMatches = { 'Dịu dàng': ['Dịu dàng', 'Nhẹ nhàng', 'Trong trẻo'], 'Tươi sáng': ['Rạng rỡ', 'Vui tươi', 'Năng lượng', 'Tươi mới'], 'Thanh lịch': ['Trong trẻo', 'Thanh mát', 'Bình yên', 'Sâu lắng'], 'Ấm áp': ['Ấm áp', 'Lãng mạn', 'Sâu lắng'] }
const colorMatches = { 'Kem và trắng': ['Kem', 'Trắng', 'Trắng ngà'], 'Hồng dịu': ['Hồng phấn', 'Hồng nhạt'], 'Cam đào': ['Cam đào', 'Apricot', 'Vàng kem'], 'Tím khói': ['Hồng trầm', 'Đỏ rượu'], 'Xanh trắng': ['Xanh lá', 'Trắng'] }

function FlowerFinderPage() {
  const [started, setStarted] = useState(false)
  const [step, setStep] = useState(1)
  const [answers, setAnswers] = useState({})
  const [error, setError] = useState('')
  const question = questions[step - 1]
  const recommendations = useMemo(() => {
    if (step !== 5) return []
    return products.map((product) => {
      let score = 0
      if (product.occasions.includes(answers.occasion)) score += 8
      if (product.moods.some((mood) => moodMatches[answers.mood]?.includes(mood))) score += 4
      if (product.colorPalette.some((color) => colorMatches[answers.color]?.includes(color))) score += 2
      const budgetMatch = (answers.budget === 'Dưới 600.000 ₫' && product.price < 600000) || (answers.budget === '600.000 ₫ – 750.000 ₫' && product.price >= 600000 && product.price <= 750000) || (answers.budget === 'Từ 750.000 ₫' && product.price >= 750000)
      if (budgetMatch) score += 1
      return { product, score }
    }).sort((first, second) => second.score - first.score || first.product.price - second.product.price).slice(0, 6)
  }, [answers, step])
  function next() { if (!answers[question.key]) { setError('Hãy chọn một phương án để tiếp tục.'); return } setError(''); setStep((current) => current + 1) }
  function restart() { setAnswers({}); setError(''); setStep(1) }
  if (!started) return <main className="finder-intro"><Container><div><p className="eyebrow">Một gợi ý thật vừa vặn</p><h1>Tìm một bó hoa thật vừa vặn.</h1><p>Trả lời vài câu hỏi, Hanapipi Flower sẽ gợi ý những thiết kế phù hợp với dịp bạn muốn gửi gắm.</p><button className="button button--primary" type="button" onClick={() => setStarted(true)}>Bắt đầu tìm hoa <ArrowRight aria-hidden="true" /></button></div></Container></main>
  if (step === 5) return <main className="finder-page"><Container><header className="finder-results__header"><p className="eyebrow">Dựa trên lựa chọn của bạn</p><h1>Gợi ý dành cho bạn</h1><button className="button button--text" type="button" onClick={restart}>Bắt đầu lại</button></header><section aria-labelledby="finder-results-title"><h2 className="sr-only" id="finder-results-title">Các bó hoa được gợi ý</h2><div className="finder-results__grid">{recommendations.map(({ product }) => <article className="finder-result" key={product.id}><ProductCard product={product} /><p>Vì sao phù hợp: {product.colorPalette[0]} {answers.mood.toLowerCase()}, phù hợp để gửi hoa dịp {answers.occasion.toLowerCase()}.</p></article>)}</div></section><Link className="button button--secondary finder-all-link" to="/shop">Xem tất cả bó hoa</Link></Container></main>
  return <main className="finder-page"><Container><header className="finder-page__header"><p className="eyebrow">Tìm hoa theo cảm xúc</p><div><span>{String(step).padStart(2, '0')} / 04</span><strong>{['Dịp tặng', 'Cảm xúc', 'Tông màu', 'Ngân sách'][step - 1]}</strong></div></header><section className="finder-question" aria-labelledby="finder-question-title"><div className="finder-progress"><i style={{ width: `${(step / 4) * 100}%` }} /></div><h1 id="finder-question-title">{question.title}</h1><div className="finder-option-list">{question.options.map((option) => <button aria-pressed={answers[question.key] === option} className={answers[question.key] === option ? 'is-selected' : ''} key={option} type="button" onClick={() => { setAnswers((current) => ({ ...current, [question.key]: option })); setError('') }}><span>{option}</span>{answers[question.key] === option && <Check aria-hidden="true" />}</button>)}</div>{error && <p className="finder-error" role="alert">{error}</p>}<div className="finder-actions"><button className="button button--text" disabled={step === 1} type="button" onClick={() => setStep((current) => current - 1)}><ArrowLeft aria-hidden="true" /> Quay lại</button><button className="button button--primary" type="button" onClick={next}>Tiếp tục <ArrowRight aria-hidden="true" /></button></div></section></Container></main>
}
export default FlowerFinderPage
