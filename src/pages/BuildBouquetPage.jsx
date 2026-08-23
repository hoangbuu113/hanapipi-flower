import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Container from '../components/Container'
import { useCommerce } from '../context/commerceStore'
import { bouquetOptions, bouquetPreviewImage, bouquetSteps } from '../data/bouquetOptions'
import { formatCurrency } from '../utils/formatCurrency'
import './BuildBouquetPage.css'

const initialSelection = { flowers: [], message: '', palette: null, size: null, style: null, wrapping: null }

function getOption(group, id) { return bouquetOptions[group].find((option) => option.id === id) }

function BuildBouquetPage() {
  const [started, setStarted] = useState(false)
  const [step, setStep] = useState(1)
  const [selection, setSelection] = useState(initialSelection)
  const [error, setError] = useState('')
  const [added, setAdded] = useState(false)
  const { addCustomBouquet } = useCommerce()
  const selectedSize = getOption('sizes', selection.size)
  const selectedWrapping = getOption('wrappings', selection.wrapping)
  const selectedFlowers = bouquetOptions.flowers.filter((flower) => selection.flowers.includes(flower.id))
  const estimate = (selectedSize?.price ?? 0) + (selectedWrapping?.price ?? 0) + selectedFlowers.reduce((total, flower) => total + flower.price, 0)

  const review = useMemo(() => ({
    style: getOption('styles', selection.style), palette: getOption('palettes', selection.palette), size: selectedSize, wrapping: selectedWrapping,
  }), [selectedSize, selectedWrapping, selection.palette, selection.style])

  function updateSelection(key, value) { setSelection((current) => ({ ...current, [key]: value })); setError('') }
  function toggleFlower(flowerId) {
    setSelection((current) => {
      const isSelected = current.flowers.includes(flowerId)
      if (!isSelected && current.flowers.length === 2) return current
      return { ...current, flowers: isSelected ? current.flowers.filter((id) => id !== flowerId) : [...current.flowers, flowerId] }
    })
    setError('')
  }
  function canContinue() {
    if (step === 1) return Boolean(selection.style)
    if (step === 2) return Boolean(selection.palette)
    if (step === 3) return Boolean(selection.size)
    if (step === 4) return selection.flowers.length > 0
    if (step === 5) return Boolean(selection.wrapping)
    return true
  }
  function nextStep() {
    if (!canContinue()) { setError(step === 4 ? 'Hãy chọn ít nhất một loại hoa chủ đạo.' : 'Hãy chọn một phương án để tiếp tục.'); return }
    setError('')
    setStep((current) => Math.min(6, current + 1))
  }
  function addBouquet() {
    addCustomBouquet({
      image: bouquetPreviewImage, name: 'Bó hoa theo ý bạn', style: review.style.label, palette: review.palette.label,
      size: review.size.label, flowers: selectedFlowers.map((flower) => flower.label), wrapping: review.wrapping.label,
      message: selection.message.trim(), unitPrice: estimate,
    })
    setAdded(true)
  }

  if (!started) return <main className="bouquet-intro"><Container><div><p className="eyebrow">Một bó hoa dành riêng cho bạn</p><h1>Tạo một bó hoa mang dấu ấn riêng.</h1><p>Chọn cảm xúc, sắc hoa và những chi tiết vừa vặn cho dịp bạn muốn gửi gắm.</p><button className="button button--primary" type="button" onClick={() => setStarted(true)}>Bắt đầu lựa chọn <ArrowRight aria-hidden="true" /></button></div></Container></main>

  return <main className="bouquet-page"><Container><header className="bouquet-page__header"><p className="eyebrow">Bó hoa theo ý bạn</p><div><span>{String(step).padStart(2, '0')} / 06</span><strong>{bouquetSteps[step - 1]}</strong></div></header><div className="bouquet-page__layout">
    <section className="bouquet-workspace" aria-labelledby="bouquet-step-title">
      <div className="bouquet-progress" aria-label={`Bước ${step} trên 6`}><i style={{ width: `${(step / 6) * 100}%` }} /></div>
      <div className="bouquet-step" key={step}>
        {step === 1 && <StepChoices title="Bạn muốn bó hoa mang cảm xúc gì?" options={bouquetOptions.styles} selected={selection.style} onSelect={(id) => updateSelection('style', id)} />}
        {step === 2 && <PaletteStep selected={selection.palette} onSelect={(id) => updateSelection('palette', id)} />}
        {step === 3 && <StepChoices title="Bó hoa nên có kích thước nào?" options={bouquetOptions.sizes.map((item) => ({ ...item, description: `Từ ${formatCurrency(item.price)}` }))} selected={selection.size} onSelect={(id) => updateSelection('size', id)} />}
        {step === 4 && <FlowerStep selected={selection.flowers} onToggle={toggleFlower} />}
        {step === 5 && <StepChoices title="Hoàn thiện cách gói hoa" options={bouquetOptions.wrappings.map((item) => ({ ...item, description: item.note }))} selected={selection.wrapping} onSelect={(id) => updateSelection('wrapping', id)} />}
        {step === 6 && <ReviewStep estimate={estimate} review={review} selectedFlowers={selectedFlowers} selection={selection} onMessage={(value) => updateSelection('message', value)} />}
      </div>
      {error && <p className="bouquet-error" role="alert">{error}</p>}
      <div className="bouquet-actions"><button className="button button--text" disabled={step === 1} type="button" onClick={() => { setStep((current) => current - 1); setError('') }}><ArrowLeft aria-hidden="true" /> Quay lại</button>{step < 6 ? <button className="button button--primary" type="button" onClick={nextStep}>Tiếp tục <ArrowRight aria-hidden="true" /></button> : <button className="button button--primary" type="button" onClick={addBouquet}>Thêm bó hoa vào giỏ hàng</button>}</div>
      {added && <p className="bouquet-added" role="status">Đã thêm bó hoa theo ý bạn vào giỏ hàng. <Link to="/cart">Xem giỏ hàng</Link></p>}
    </section>
    <aside className="bouquet-preview"><img alt="Bó hoa hồng dịu và trắng ngà, hình ảnh gợi ý" src={bouquetPreviewImage} style={{ objectPosition: 'center 45%' }} /><p>Hình ảnh mang tính gợi ý cho phong cách bạn đã chọn.</p><div><span>Giá ước tính</span><strong aria-live="polite">{estimate ? formatCurrency(estimate) : 'Chọn kích thước để xem giá'}</strong></div></aside>
  </div></Container></main>
}

function StepChoices({ title, options, selected, onSelect }) { return <><h1 id="bouquet-step-title">{title}</h1><div className="bouquet-choice-grid">{options.map((option) => <button aria-pressed={selected === option.id} className={selected === option.id ? 'is-selected' : ''} key={option.id} type="button" onClick={() => onSelect(option.id)}><strong>{option.label}</strong><span>{option.description}</span>{selected === option.id && <Check aria-hidden="true" />}</button>)}</div></> }
function PaletteStep({ selected, onSelect }) { return <><h1 id="bouquet-step-title">Chọn bảng màu</h1><div className="bouquet-palette-grid">{bouquetOptions.palettes.map((palette) => <button aria-pressed={selected === palette.id} className={selected === palette.id ? 'is-selected' : ''} key={palette.id} type="button" onClick={() => onSelect(palette.id)}><span>{palette.colors.map((color) => <i key={color} style={{ background: color }} />)}</span><strong>{palette.label}</strong>{selected === palette.id && <Check aria-hidden="true" />}</button>)}</div></> }
function FlowerStep({ selected, onToggle }) { return <><h1 id="bouquet-step-title">Chọn những bông hoa chủ đạo</h1><p className="bouquet-step__note">Chọn tối đa 2 loại hoa.</p><div className="bouquet-choice-grid">{bouquetOptions.flowers.map((flower) => <button aria-pressed={selected.includes(flower.id)} className={selected.includes(flower.id) ? 'is-selected' : ''} disabled={!selected.includes(flower.id) && selected.length === 2} key={flower.id} type="button" onClick={() => onToggle(flower.id)}><strong>{flower.label}</strong><span>{flower.description} · +{formatCurrency(flower.price)}</span>{selected.includes(flower.id) && <Check aria-hidden="true" />}</button>)}</div></> }
function ReviewStep({ estimate, review, selectedFlowers, selection, onMessage }) { return <><h1 id="bouquet-step-title">Thêm một lời nhắn</h1><label className="bouquet-message"><span>Lời nhắn (không bắt buộc)</span><textarea maxLength="200" placeholder="Ví dụ: Chúc bạn một ngày thật dịu dàng." value={selection.message} onChange={(event) => onMessage(event.target.value)} /><small>{selection.message.length}/200</small></label><div className="bouquet-review"><span>Phong cách</span><strong>{review.style.label}</strong><span>Bảng màu</span><strong>{review.palette.label}</strong><span>Kích thước</span><strong>{review.size.label}</strong><span>Hoa chủ đạo</span><strong>{selectedFlowers.map((flower) => flower.label).join(', ')}</strong><span>Kiểu gói</span><strong>{review.wrapping.label}</strong><span>Lời nhắn</span><strong>{selection.message.trim() || 'Chưa thêm lời nhắn'}</strong><span>Giá ước tính</span><strong>{formatCurrency(estimate)}</strong></div><p className="bouquet-disclosure">Vì hoa tươi thay đổi theo mùa, Hanapipi Flower có thể thay thế một số loại hoa bằng lựa chọn tương đương về màu sắc và giá trị.</p></> }

export default BuildBouquetPage
