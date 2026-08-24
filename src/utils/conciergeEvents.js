export const OPEN_CONCIERGE_EVENT = 'hanapipi:open-concierge'

export function openConcierge(returnFocus) {
  window.dispatchEvent(new CustomEvent(OPEN_CONCIERGE_EVENT, { detail: { returnFocus } }))
}
