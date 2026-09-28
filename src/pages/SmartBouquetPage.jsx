import { useState } from 'react'
import Container from '../components/Container'
import {
  ingredients, ribbons, templates, wrappers,
  createDefaultBouquetRecipe, addIngredient, removeIngredient,
  setWrapper, setRibbon, shuffleBouquet, composeBouquet, calculateBouquetReferencePrice,
  deserializeBouquetRecipe,
} from '../experiments/bouquetLab'
import { createMinimalBouquetRecipe, getBouquetSummary } from '../experiments/smartBouquetView'
import { formatCurrency } from '../utils/formatCurrency'
import './BouquetLabPage.css'
import './SmartBouquetPage.css'

const groups = [
  { id: 'flowers', label: 'Hoa', roles: ['FOCAL', 'SECONDARY'] },
  { id: 'soft', label: 'Hoa phụ & lá', roles: ['FILLER', 'GREENERY'] },
  { id: 'topping', label: 'Trang trí', roles: ['TOPPING'] },
  { id: 'wrapper', label: 'Giấy gói' },
  { id: 'ribbon', label: 'Nơ' },
]

export default function SmartBouquetPage() {
  const [recipe, setRecipe] = useState(createDefaultBouquetRecipe)
  const [activeGroup, setActiveGroup] = useState('flowers')
  const [feedback, setFeedback] = useState('')
  const [showNextNote, setShowNextNote] = useState(false)
  const composition = composeBouquet(recipe)
  const summary = getBouquetSummary(recipe)
  const selectedGroup = groups.find((group) => group.id === activeGroup)
  const total = calculateBouquetReferencePrice(recipe)

  function add(assetId) {
    const next = addIngredient(recipe, assetId)
    if (next === recipe) {
      setFeedback('Bó hoa đã đủ chỗ cho nhóm hoa này. Bạn có thể bớt một bông trước.')
      return
    }
    setRecipe(next)
    setFeedback('Đã thêm hoa vào bó của bạn.')
    setShowNextNote(false)
  }

  function remove(assetId) {
    const next = removeIngredient(recipe, assetId)
    if (next === recipe) return
    setRecipe(next)
    setFeedback('Đã bớt một chi tiết khỏi bó hoa.')
    setShowNextNote(false)
  }

  function changeTemplate(templateId) {
    if (templateId === recipe.templateId) return
    const next = deserializeBouquetRecipe({ ...recipe, templateId })
    const before = recipe.ingredients.reduce((sum, item) => sum + item.quantity, 0)
    const after = next.ingredients.reduce((sum, item) => sum + item.quantity, 0)
    setRecipe(next)
    setFeedback(after < before ? 'Đã đổi dáng bó và bớt những bông vượt sức chứa.' : 'Đã đổi dáng bó, giữ nguyên lựa chọn của bạn.')
    setShowNextNote(false)
  }

  function reset() {
    setRecipe(createMinimalBouquetRecipe(recipe.templateId))
    setActiveGroup('flowers')
    setFeedback('Đã làm lại với một bó hoa tối giản.')
    setShowNextNote(false)
  }

  return <main className="smart-bouquet"><Container>
    <header className="smart-bouquet__header">
      <p className="eyebrow">Hut Flower · Bó hoa của riêng bạn</p>
      <h1>Tự tạo bó hoa</h1>
      <p>Tự phối một bó hoa theo cách của bạn.</p>
    </header>

    <div className="smart-bouquet__layout">
      <section className="smart-bouquet__controls" aria-label="Tùy chọn bó hoa">
        <div className="smart-bouquet__controls-head"><h2>Chọn từng chi tiết</h2><button type="button" className="smart-bouquet__reset" onClick={reset}>Làm lại</button></div>
        <div className="smart-bouquet__groups" aria-label="Nhóm lựa chọn">
          {groups.map((group) => <button key={group.id} type="button" aria-pressed={activeGroup === group.id} onClick={() => setActiveGroup(group.id)}>{group.label}</button>)}
        </div>
        <div className="smart-bouquet__panel" aria-label={selectedGroup.label}>
          {selectedGroup.roles
            ? ingredients.filter((asset) => asset.active && selectedGroup.roles.includes(asset.role)).map((asset) => {
              const quantity = recipe.ingredients.find((item) => item.assetId === asset.id)?.quantity ?? 0
              const capacity = templates[recipe.templateId].filter((slot) => slot.role === asset.role).length
              const used = recipe.ingredients.reduce((sum, item) => sum + (item.role === asset.role ? item.quantity : 0), 0)
              const full = used >= capacity
              return <div className="smart-bouquet__ingredient" key={asset.id}>
                <img alt="" src={asset.image} />
                <div className="smart-bouquet__ingredient-copy"><strong>{asset.name}</strong><small>+{formatCurrency(asset.referencePrice)} mỗi phần</small>{full && <small>Đã đủ cho dáng bó này</small>}</div>
                <div className="smart-bouquet__quantity" aria-label={`Số lượng ${asset.name}: ${quantity}`}>
                  <button type="button" disabled={quantity === 0} aria-label={`Bớt ${asset.name}`} onClick={() => remove(asset.id)}>−</button>
                  <output>{quantity}</output>
                  <button type="button" disabled={full} aria-label={full ? `${asset.name} đã đạt giới hạn ${capacity}` : `Thêm ${asset.name}`} onClick={() => add(asset.id)}>+</button>
                </div>
              </div>
            })
            : (activeGroup === 'wrapper' ? wrappers : ribbons).filter((asset) => asset.active).map((asset) => {
              const selected = activeGroup === 'wrapper' ? recipe.wrapperId === asset.id : recipe.ribbonId === asset.id
              return <button className="smart-bouquet__finish-option" key={asset.id} type="button" aria-pressed={selected} onClick={() => {
                setRecipe((current) => activeGroup === 'wrapper' ? setWrapper(current, asset.id) : setRibbon(current, asset.id))
                setFeedback(`Đã chọn ${asset.name}.`)
                setShowNextNote(false)
              }}>
                <img alt="" src={activeGroup === 'wrapper' ? asset.frontImage : asset.image} />
                <span><strong>{asset.name}</strong><small>{formatCurrency(asset.referencePrice)} tham khảo</small></span>
                <span className="smart-bouquet__selected">{selected ? 'Đang chọn' : 'Chọn'}</span>
              </button>
            })}
        </div>
        <p className="smart-bouquet__feedback" role="status">{feedback}</p>

        <section className="smart-bouquet__summary" aria-labelledby="smart-bouquet-summary-title">
          <h2 id="smart-bouquet-summary-title">Bó hoa của bạn</h2>
          <ul>
            {summary.ingredients.map((item) => <li key={item.assetId}><span>{item.quantity} × {item.name}</span></li>)}
            <li><span>Giấy gói</span><strong>{summary.wrapper}</strong></li>
            <li><span>Nơ</span><strong>{summary.ribbon}</strong></li>
          </ul>
        </section>
        <button className="button button--primary smart-bouquet__continue" type="button" onClick={() => setShowNextNote(true)}>Tiếp tục với bó hoa này</button>
        {showNextNote && <p className="smart-bouquet__next-note" role="status">Bước gửi yêu cầu tư vấn sẽ được kết nối ở giai đoạn tiếp theo.</p>}
      </section>

      <section className="smart-bouquet__preview" aria-label="Xem trước bó hoa">
        <div className="smart-bouquet__preview-head"><h2>Bó hoa đang phối</h2><div className="smart-bouquet__templates" aria-label="Dáng bó">
          {Object.keys(templates).map((templateId) => <button key={templateId} type="button" aria-pressed={recipe.templateId === templateId} onClick={() => changeTemplate(templateId)}>{templateId === 'ROUND_S' ? 'Bó nhỏ' : 'Bó vừa'}</button>)}
        </div></div>
        <div className="bouquet-lab__canvas smart-bouquet__canvas" role="img" aria-label={`Xem trước bó hoa gồm ${summary.ingredients.map((item) => `${item.quantity} ${item.name}`).join(', ')}`}>
          <img className="bouquet-lab__wrapper" src={composition.wrapper.backImage} alt="" style={{ filter: composition.wrapper.filter }} />
          {composition.items.map(({ id, ingredient, image, slot, rotation, scale, mirror }) => <span className="bouquet-lab__instance" key={id} style={{ left: `${slot.x}%`, top: `${slot.y}%`, width: `${ingredient.width}%`, zIndex: slot.zIndex, transform: `translate(-50%, -33.33%) rotate(${rotation}deg) scale(${scale})` }}>
            <img src={image} alt="" draggable="false" style={{ transform: mirror ? 'scaleX(-1)' : undefined }} />
          </span>)}
          <img className="bouquet-lab__wrapper bouquet-lab__front" src={composition.wrapper.frontImage} alt="" style={{ filter: composition.wrapper.filter }} />
          <img className="bouquet-lab__ribbon" src={composition.ribbon.image} alt="" />
        </div>
        <div className="smart-bouquet__preview-bottom"><div><span>Tổng giá tham khảo</span><strong aria-live="polite">{formatCurrency(total)}</strong><small>Giá thực tế có thể được xác nhận khi tư vấn.</small></div><button className="button button--text" type="button" disabled={!recipe.ingredients.length} onClick={() => { setRecipe(shuffleBouquet); setFeedback('Đã phối lại, giữ nguyên nguyên liệu và giá.'); setShowNextNote(false) }}>Phối lại</button></div>
      </section>
    </div>
  </Container></main>
}
