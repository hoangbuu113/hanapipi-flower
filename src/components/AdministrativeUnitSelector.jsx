import { useId, useState } from 'react'
import { getHcmcAdministrativeUnit } from '../data/hcmcAdministrativeUnits.js'
import { hcmcDeliveryUnits } from '../data/hcmcDeliveryUnits.js'
import { normalizeSearch } from '../utils/normalizeSearch.js'
import './AdministrativeUnitSelector.css'

export default function AdministrativeUnitSelector({ value, onChange, error }) {
  const inputId = useId()
  const listId = `${inputId}-list`
  const selected = getHcmcAdministrativeUnit(value)
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const matches = hcmcDeliveryUnits.filter((unit) => normalizeSearch(unit.name).includes(normalizeSearch(query))).slice(0, 40)

  function select(unit) {
    onChange(unit.code)
    setQuery('')
    setIsOpen(false)
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      setIsOpen(false)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setIsOpen(true)
      setActiveIndex((current) => Math.max(0, Math.min(matches.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1))))
    }
    if (event.key === 'Enter' && isOpen && matches[activeIndex]) {
      event.preventDefault()
      select(matches[activeIndex])
    }
  }

  return (
    <div className="administrative-unit-selector" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false) }}>
      <label htmlFor={inputId}>Phường / Xã / Đặc khu *</label>
      <input
        aria-autocomplete="list"
        aria-activedescendant={isOpen && matches[activeIndex] ? `${listId}-${matches[activeIndex].code}` : undefined}
        aria-controls={listId}
        aria-expanded={isOpen}
        aria-invalid={Boolean(error)}
        autoComplete="off"
        id={inputId}
        onChange={(event) => { setQuery(event.target.value); setIsOpen(true); setActiveIndex(0); if (value) onChange('') }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Tìm theo tên phường, xã..."
        role="combobox"
        value={isOpen ? query : (selected?.name || '')}
      />
      {isOpen && (
        <div className="administrative-unit-selector__results" id={listId} role="listbox">
          {matches.length ? matches.map((unit, index) => (
            <button
              aria-selected={index === activeIndex}
              className={index === activeIndex ? 'is-active' : ''}
              id={`${listId}-${unit.code}`}
              key={unit.code}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => select(unit)}
              role="option"
              type="button"
            >{unit.name}</button>
          )) : <p>Không tìm thấy phường, xã hoặc đặc khu phù hợp.</p>}
        </div>
      )}
      {error && <em className="administrative-unit-selector__error">{error}</em>}
    </div>
  )
}
