import { useEffect, useRef } from 'react'
import { activateModalFocus } from '../../utils/focus.js'

export default function AdminModal({ onClose, children, ...props }) {
  const containerRef = useRef(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => activateModalFocus(containerRef.current, () => closeRef.current()), [])
  return <div {...props} ref={containerRef} role="dialog" aria-modal="true" tabIndex={-1}
    onClick={(event) => event.stopPropagation()}>{children}</div>
}
