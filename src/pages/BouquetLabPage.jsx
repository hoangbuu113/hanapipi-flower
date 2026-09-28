import { useEffect, useRef, useState } from 'react'
import Container from '../components/Container'
import { ingredients, wrappers, ribbons, templates, createDefaultBouquetRecipe, addIngredient, removeIngredient, setWrapper, setRibbon, shuffleBouquet, composeBouquet, calculateBouquetReferencePrice } from '../experiments/bouquetLab'
import { formatCurrency } from '../utils/formatCurrency'
import './BouquetLabPage.css'

export default function BouquetLabPage() {
  const [recipe, setRecipe] = useState(createDefaultBouquetRecipe)
  const [message, setMessage] = useState('')
  const [removing, setRemoving] = useState([])
  const timers = useRef(new Set())
  useEffect(() => { const pending = timers.current; return () => pending.forEach(clearTimeout) }, [])
  const { items: placed, wrapper, ribbon } = composeBouquet(recipe)
  function add(id) {
    const next = addIngredient(recipe, id)
    setMessage(next === recipe ? 'Nhóm nguyên liệu này đã đủ vị trí. Hãy bỏ một bông trước.' : 'Đã thêm vào bó hoa.')
    setRecipe(next)
  }
  function remove(id, assetId, name) {
    if (removing.includes(id)) return
    setRemoving((current) => [...current, id])
    const timer = setTimeout(() => {
      setRecipe((current) => removeIngredient(current, assetId, id))
      setRemoving((current) => current.filter((entry) => entry !== id))
      setMessage(`Đã bỏ ${name}.`)
      timers.current.delete(timer)
    }, 180)
    timers.current.add(timer)
  }
  return <main className="bouquet-lab"><Container>
    <header className="bouquet-lab__header"><div><p className="eyebrow">Hut Flower · Phòng thử nghiệm</p><h1>Tự tạo bó hoa.</h1></div><span>2.5D · Bản thử nghiệm</span></header>
    <p className="bouquet-lab__notice">Phối sắc hoa và những chi tiết nhỏ theo cách của bạn. Ảnh tạo cho bản thử nghiệm, không đại diện cho sản phẩm hoa thật của tiệm.</p>
    <div className="bouquet-lab__layout">
      <section className="bouquet-lab__ingredients" aria-label="Nguyên liệu"><h2>Chọn sắc hoa</h2><p>Chạm để thêm vào một vị trí phù hợp.</p>
        <div className="bouquet-lab__choices">{ingredients.filter((item) => item.role !== 'TOPPING').map((item) => <button type="button" key={item.id} onClick={() => add(item.id)}><span>{item.name}</span><small>+{formatCurrency(item.referencePrice)}</small></button>)}</div>
      </section>
      <section className="bouquet-lab__studio" aria-label="Bó hoa đang phối">
        <div className="bouquet-lab__templates">{Object.keys(templates).map((template) => <button type="button" aria-pressed={recipe.templateId === template} key={template} onClick={() => { timers.current.forEach(clearTimeout); timers.current.clear(); setRemoving([]); setRecipe(createDefaultBouquetRecipe(template)); setMessage('Đã đổi mẫu và khôi phục bó hoa gợi ý.') }}>{template === 'ROUND_S' ? 'Bó nhỏ' : 'Bó vừa'}</button>)}</div>
        <div className="bouquet-lab__canvas">
          <img className="bouquet-lab__wrapper" src={wrapper.backImage} alt="" style={{ filter: wrapper.filter }} />
          {placed.map(({ id, assetId, ingredient, image, slot, rotation, scale, mirror }) => <button className={`bouquet-lab__instance${removing.includes(id) ? ' is-removing' : ''}`} type="button" key={id} aria-label={`Bỏ ${ingredient.name}`} title={`Bỏ ${ingredient.name}`} onClick={() => remove(id, assetId, ingredient.name)} style={{ left: `${slot.x}%`, top: `${slot.y}%`, width: `${ingredient.width}%`, zIndex: slot.zIndex, transform: `translate(-50%, -33.33%) rotate(${rotation}deg) scale(${scale})` }}>
            <img src={image} alt="" draggable="false" style={{ transform: mirror ? 'scaleX(-1)' : undefined }} />
          </button>)}
          <img className="bouquet-lab__wrapper bouquet-lab__front" src={wrapper.frontImage} alt="" style={{ filter: wrapper.filter }} />
          <img className="bouquet-lab__ribbon" src={ribbon.image} alt="" />
        </div>
        <button className="button button--text" type="button" disabled={!recipe.ingredients.length} onClick={() => { setRecipe(shuffleBouquet); setMessage('Đã phối lại, giữ nguyên nguyên liệu và giá.') }}>Phối lại</button>
        <p className="bouquet-lab__feedback" role="status">{message || 'Chạm một nguyên liệu trong bó để bỏ.'}</p>
      </section>
      <section className="bouquet-lab__finish" aria-label="Hoàn thiện"><h2>Chi tiết nhỏ</h2><p>Một nét nhẹ để bó hoa thêm riêng.</p><div className="bouquet-lab__choices">{ingredients.filter((item) => ['TOPPING', 'FILLER', 'GREENERY'].includes(item.role)).map((item) => <button type="button" key={item.id} onClick={() => add(item.id)}>{item.name}<small>+{formatCurrency(item.referencePrice)}</small></button>)}</div>
        <h3>Giấy gói</h3><Options items={wrappers} selected={recipe.wrapperId} onSelect={(id) => setRecipe((current) => setWrapper(current, id))} />
        <h3>Nơ</h3><Options items={ribbons} selected={recipe.ribbonId} onSelect={(id) => setRecipe((current) => setRibbon(current, id))} />
      </section>
    </div>
    <footer className="bouquet-lab__total"><span>Tổng giá tham khảo <small>Chỉ thử phối · không tạo giỏ hàng hoặc yêu cầu tư vấn</small></span><strong aria-live="polite">{formatCurrency(calculateBouquetReferencePrice(recipe))}</strong></footer>
  </Container></main>
}
function Options({ items, selected, onSelect }) {
  return <div className="bouquet-lab__choices">{items.map((item) => <button type="button" aria-pressed={selected === item.id} key={item.id} onClick={() => onSelect(item.id)}>{item.name}<small>{formatCurrency(item.referencePrice)}</small></button>)}</div>
}
