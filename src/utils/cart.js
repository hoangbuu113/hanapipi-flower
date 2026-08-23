export function cartSubtotal(items) {
  return items.reduce((total, item) => total + item.unitPrice * item.quantity, 0)
}
