import { createContext, useContext } from 'react'

export const CommerceContext = createContext(null)

export function useCommerce() {
  const context = useContext(CommerceContext)
  if (!context) throw new Error('useCommerce must be used within CommerceProvider')
  return context
}
