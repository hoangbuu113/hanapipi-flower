import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth, useUser } from '@clerk/clerk-react'
import { AccountContext } from './accountStore'
import { fetchCurrentUser } from '../services/apiClient'

const orderStorageKey = 'hanapipi-flower:orders'

function readStorage(key, fallback) {
  try {
    return JSON.parse(window.localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
  }
}

export function AccountProvider({ children }) {
  const [orders, setOrders] = useState(() => {
    const stored = readStorage(orderStorageKey, [])
    return Array.isArray(stored) ? stored : []
  })

  useEffect(() => {
    window.localStorage.setItem(orderStorageKey, JSON.stringify(orders))
  }, [orders])

  const { isLoaded: isAuthLoaded, isSignedIn, getToken, signOut } = useAuth()
  const { isLoaded: isUserLoaded, user: clerkUser } = useUser()

  const [d1User, setD1User] = useState(null)
  const [authError, setAuthError] = useState(null)

  const hydrateUser = useCallback(async () => {
    if (!isSignedIn) {
      setD1User(null)
      setAuthError(null)
      return
    }

    try {
      const result = await fetchCurrentUser({ getToken })
      if (result.ok && result.user) {
        setD1User(result.user)
        setAuthError(null)
      } else {
        setD1User(null)
        setAuthError(result.error)
      }
    } catch {
      setD1User(null)
      setAuthError({ code: 'HYDRATION_FAILED', message: 'Không thể kết nối đến máy chủ.' })
    }
  }, [isSignedIn, getToken])

  useEffect(() => {
    let isCancelled = false

    if (!isAuthLoaded || !isUserLoaded || !isSignedIn) {
      return undefined
    }

    fetchCurrentUser({ getToken })
      .then((result) => {
        if (isCancelled) return
        if (result.ok && result.user) {
          setD1User(result.user)
          setAuthError(null)
        } else {
          setD1User(null)
          setAuthError(result.error)
        }
      })
      .catch(() => {
        if (isCancelled) return
        setD1User(null)
        setAuthError({ code: 'HYDRATION_FAILED', message: 'Không thể kết nối đến máy chủ.' })
      })

    return () => {
      isCancelled = true
    }
  }, [isAuthLoaded, isUserLoaded, isSignedIn, getToken])

  const user = useMemo(() => {
    if (!isSignedIn || !clerkUser) return null
    return {
      id: d1User?.id ?? clerkUser.id,
      clerkId: clerkUser.id,
      displayName: d1User?.displayName || clerkUser.fullName || clerkUser.firstName || '',
      name: clerkUser.fullName || clerkUser.firstName || d1User?.displayName || '',
      email: clerkUser.primaryEmailAddress?.emailAddress || '',
      phone: clerkUser.primaryPhoneNumber?.phoneNumber || '',
      role: d1User?.role ?? 'customer',
      status: d1User?.status ?? 'active',
      locale: d1User?.locale ?? 'vi-VN',
    }
  }, [isSignedIn, clerkUser, d1User])

  const isAuthLoading = !isAuthLoaded || !isUserLoaded || (Boolean(isSignedIn) && !d1User && !authError)

  const logout = useCallback(async () => {
    try {
      await signOut()
    } finally {
      setD1User(null)
      setAuthError(null)
    }
  }, [signOut])

  const updateProfile = useCallback(async (profile) => {
    if (clerkUser && profile?.name) {
      try {
        const parts = profile.name.trim().split(/\s+/)
        const firstName = parts[0] || ''
        const lastName = parts.slice(1).join(' ') || ''
        await clerkUser.update({ firstName, lastName })
      } catch {
        // Non-blocking profile update failure
      }
    }
  }, [clerkUser])

  const addOrder = useCallback((order) => {
    setOrders((current) => [order, ...current])
  }, [])

  const value = useMemo(() => ({
    orders,
    user,
    d1User,
    isAuthLoading,
    authError,
    retryAuth: hydrateUser,
    logout,
    updateProfile,
    addOrder,
  }), [orders, user, d1User, isAuthLoading, authError, hydrateUser, logout, updateProfile, addOrder])

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}
