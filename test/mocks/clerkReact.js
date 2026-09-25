import { useSyncExternalStore } from 'react'

let authState = { isLoaded: false, isSignedIn: undefined, userId: null }
const listeners = new Set()

export function setClerkAuth(next) {
  authState = next
  for (const listener of listeners) listener()
}

export function useAuth() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => authState,
  )
}
