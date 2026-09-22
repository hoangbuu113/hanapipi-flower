import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth, useUser } from '@clerk/clerk-react'
import { AccountContext } from './accountStore'
import { fetchCurrentUser, fetchUserOrders } from '../services/apiClient'

export function AccountProvider({ children }) {
  const [orders, setOrders] = useState([])
  const [isOrdersLoading, setIsOrdersLoading] = useState(false)
  const [ordersError, setOrdersError] = useState(null)

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

  const refreshOrders = useCallback(async () => {
    if (!isSignedIn) {
      setOrdersError(null)
      setIsOrdersLoading(false)
      return
    }

    setIsOrdersLoading(true)
    try {
      const result = await fetchUserOrders({ getToken })
      if (result.ok) {
        setOrders(result.orders)
        setOrdersError(null)
      } else if (result.status === 404 && result.error?.code === 'API_NOT_FOUND') {
        // Fallback gate for disabled API v1
        setOrdersError(null)
      } else {
        setOrdersError(result.error)
      }
    } catch {
      setOrdersError({ code: 'HYDRATION_FAILED', message: 'Không thể kết nối đến máy chủ.' })
    } finally {
      setIsOrdersLoading(false)
    }
  }, [isSignedIn, getToken])

  useEffect(() => {
    let isCancelled = false

    if (!isAuthLoaded || !isSignedIn) {
      return undefined
    }

    fetchUserOrders({ getToken })
      .then((result) => {
        if (isCancelled) return
        if (result.ok) {
          setOrders(result.orders)
          setOrdersError(null)
        } else if (result.status === 404 && result.error?.code === 'API_NOT_FOUND') {
          setOrdersError(null)
        } else {
          setOrdersError(result.error)
        }
      })
      .catch(() => {
        if (isCancelled) return
        setOrdersError({ code: 'HYDRATION_FAILED', message: 'Không thể kết nối đến máy chủ.' })
      })
      .finally(() => {
        if (!isCancelled) {
          setIsOrdersLoading(false)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [isAuthLoaded, isSignedIn, getToken])

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
      setOrders([])
      try {
        window.localStorage.removeItem('hanapipi-flower:orders')
      } catch {
        // Ignore storage access errors
      }
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
    setOrders((current) => {
      const orderKey = order?.code || order?.orderCode || order?.id
      const filtered = current.filter((o) => (o.code || o.orderCode || o.id) !== orderKey)
      return [order, ...filtered]
    })
  }, [])

  const value = useMemo(() => ({
    orders,
    isOrdersLoading,
    ordersError,
    refreshOrders,
    retryOrders: refreshOrders,
    user,
    d1User,
    isAuthLoading,
    authError,
    retryAuth: hydrateUser,
    logout,
    updateProfile,
    addOrder,
  }), [orders, isOrdersLoading, ordersError, refreshOrders, user, d1User, isAuthLoading, authError, hydrateUser, logout, updateProfile, addOrder])

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}
