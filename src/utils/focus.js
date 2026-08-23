const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

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
