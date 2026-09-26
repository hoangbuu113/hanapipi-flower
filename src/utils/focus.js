const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const modalScopes = []

// Scope listeners to the topmost modal, including nested delete confirmations.
export function activateModalFocus(container, onClose) {
  const trigger = document.activeElement
  const scope = { container }
  modalScopes.push(scope)
  const isTop = () => modalScopes.at(-1) === scope
  const focusInside = () => {
    const first = Array.from(container.querySelectorAll(focusableSelector))
      .find((element) => element.getClientRects().length > 0)
    ;(first ?? container).focus()
  }
  const keyDown = (event) => {
    if (!isTop()) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
    } else {
      trapDialogFocus(event, container)
    }
  }
  const focusIn = () => {
    if (isTop() && !container.contains(document.activeElement)) focusInside()
  }
  document.addEventListener('keydown', keyDown)
  document.addEventListener('focusin', focusIn)
  focusInside()
  return () => {
    const wasTop = isTop()
    modalScopes.splice(modalScopes.indexOf(scope), 1)
    document.removeEventListener('keydown', keyDown)
    document.removeEventListener('focusin', focusIn)
    if (wasTop && trigger?.isConnected) trigger.focus()
  }
}

export function trapDialogFocus(event, container) {
  if (event.key !== 'Tab' || !container) return

  const focusableElements = Array.from(container.querySelectorAll(focusableSelector))
    .filter((element) => element.getClientRects().length > 0)

  if (focusableElements.length === 0) {
    event.preventDefault()
    return
  }

  const firstElement = focusableElements[0]
  const lastElement = focusableElements.at(-1)

  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault()
    lastElement.focus()
  } else if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault()
    firstElement.focus()
  } else if (!container.contains(document.activeElement)) {
    event.preventDefault()
    firstElement.focus()
  }
}
