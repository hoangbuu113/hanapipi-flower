export async function copyText(text, { navigator = globalThis.navigator, document = globalThis.document } = {}) {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* A denied Clipboard permission may still allow a user-initiated legacy copy. */ }
  if (!document?.body || !document.execCommand) return false
  const previousFocus = document.activeElement
  const field = document.createElement('textarea')
  field.value = text
  field.readOnly = true
  field.tabIndex = -1
  field.setAttribute('aria-hidden', 'true')
  field.style.position = 'fixed'
  field.style.opacity = '0'
  try {
    document.body.appendChild(field)
    field.select()
    return document.execCommand('copy') === true
  } catch { return false }
  finally { field.remove(); previousFocus?.focus?.({ preventScroll: true }) }
}
