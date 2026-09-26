import { useEffect, useId, useRef, useState } from 'react'
import { getHcmcAdministrativeUnit } from '../data/hcmcAdministrativeUnits.js'
import { searchHcmcDeliveryUnits } from '../data/hcmcDeliveryUnits.js'
import './AdministrativeUnitSelector.css'

export default function AdministrativeUnitSelector({ value, onChange, error }) {
  const inputId = useId()
  const listId = `${inputId}-list`
  const errorId = `${inputId}-error`
  const activeOptionRef = useRef(null)
  const selected = getHcmcAdministrativeUnit(value)
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const matches = searchHcmcDeliveryUnits(query)
  const activeCode = isOpen ? matches[activeIndex]?.code : null
  useEffect(() => {
    if (activeCode) activeOptionRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeCode])

  function select(unit) {
    onChange(unit.code)
    setQuery('')
    setIsOpen(false)
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      if (isOpen) { event.preventDefault(); event.stopPropagation() }
      setIsOpen(false)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setIsOpen(true)
      setActiveIndex((current) => !isOpen
        ? (event.key === 'ArrowDown' ? 0 : Math.max(0, matches.length - 1))
        : Math.max(0, Math.min(matches.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1))))
    }
    if (event.key === 'Enter' && isOpen && matches[activeIndex]) {
      event.preventDefault()
      select(matches[activeIndex])
    }
  }

  return (
    <div className="administrative-unit-selector" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false) }}>
      <label htmlFor={inputId}>Phường / Xã *</label>
      <input
        aria-autocomplete="list"
        aria-activedescendant={isOpen && matches[activeIndex] ? `${listId}-${matches[activeIndex].code}` : undefined}
        aria-controls={listId}
        aria-expanded={isOpen}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
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
        <div aria-label="Phường / Xã giao hoa" className="administrative-unit-selector__results" id={listId} role="listbox">
          {matches.length ? matches.map((unit, index) => (
            <button
              aria-selected={unit.code === value}
              className={index === activeIndex ? 'is-active' : ''}
              id={`${listId}-${unit.code}`}
              key={unit.code}
              ref={index === activeIndex ? activeOptionRef : null}
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => select(unit)}
              role="option"
              type="button"
            >{unit.name}</button>
          )) : <p>Không tìm thấy phường hoặc xã phù hợp.</p>}
        </div>
      )}
      {error && <em id={errorId} className="administrative-unit-selector__error">{error}</em>}
    </div>
  )
}
