import { createContext, useContext } from 'react'

export const PublicCommerceContext = createContext({ mode: 'consultation', isLoading: false })
export function usePublicCommerce() {
  return useContext(PublicCommerceContext)
}
