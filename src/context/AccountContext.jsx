import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth, useUser } from '@clerk/clerk-react'
import { AccountContext } from './accountStore'
import { usePublicCommerce } from './publicCommerceStore.js'
import { getAuthenticatedAddressOwner, getVisibleSavedAddresses } from '../utils/accountAddressLifecycle.js'
import {
  createUserAddress,
  deleteUserAddress,
  fetchCurrentUser,
  fetchUserAddresses,
  fetchUserOrders,
  setDefaultUserAddress,
  updateUserAddress,
} from '../services/apiClient'

export function AccountProvider({ children }) {
  const { mode } = usePublicCommerce()
  const [orders, setOrders] = useState([])
  const [isOrdersLoading, setIsOrdersLoading] = useState(false)
  const [ordersError, setOrdersError] = useState(null)

  const [addresses, setAddresses] = useState([])
  const [addressesOwnerId, setAddressesOwnerId] = useState(null)
  const [isAddressesLoading, setIsAddressesLoading] = useState(false)
  const [addressesError, setAddressesError] = useState(null)
  const addressesRequestVersion = useRef(0)

  const { isLoaded: isAuthLoaded, isSignedIn, getToken, signOut } = useAuth()
  const { isLoaded: isUserLoaded, user: clerkUser } = useUser()

  const [d1User, setD1User] = useState(null)
  const [d1UserOwner, setD1UserOwner] = useState(null)
  const [authError, setAuthError] = useState(null)

  const hydrateUser = useCallback(async () => {
    if (!isSignedIn || !isAuthLoaded || !isUserLoaded || !clerkUser?.id) {
      setD1User(null)
      setD1UserOwner(null)
      setAuthError(null)
      return
    }

    try {
      const result = await fetchCurrentUser({ getToken })
      if (result.ok && result.user) {
        setD1User(result.user)
        setD1UserOwner(clerkUser.id)
        setAuthError(null)
      } else {
        setD1User(null)
        setAuthError(result.error)
      }
    } catch {
      setD1User(null)
      setAuthError({ code: 'HYDRATION_FAILED', message: 'Không thể kết nối đến máy chủ.' })
    }
  }, [isSignedIn, isAuthLoaded, isUserLoaded, clerkUser, getToken])

  useEffect(() => {
    let isCancelled = false

    if (!isAuthLoaded || !isUserLoaded || !isSignedIn || !clerkUser?.id) {
      return undefined
    }

    fetchCurrentUser({ getToken })
      .then((result) => {
        if (isCancelled) return
        if (result.ok && result.user) {
          setD1User(result.user)
          setD1UserOwner(clerkUser.id)
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
  }, [isAuthLoaded, isUserLoaded, isSignedIn, clerkUser, getToken])

  const authenticatedAddressOwnerId = getAuthenticatedAddressOwner({
    isAuthLoaded,
    isUserLoaded,
    isSignedIn,
    clerkSubject: clerkUser?.id,
    canonicalSubject: d1UserOwner,
    canonicalUserId: d1User?.id,
  })
  const canonicalUser = authenticatedAddressOwnerId ? d1User : null
  const visibleAddresses = useMemo(
    () => getVisibleSavedAddresses(authenticatedAddressOwnerId, addressesOwnerId, addresses),
    [authenticatedAddressOwnerId, addressesOwnerId, addresses],
  )

  const refreshOrders = useCallback(async () => {
    if (!isSignedIn || mode !== 'checkout') {
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
  }, [isSignedIn, getToken, mode])

  useEffect(() => {
    let isCancelled = false

    if (!isAuthLoaded || !isSignedIn || mode !== 'checkout') {
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
  }, [isAuthLoaded, isSignedIn, getToken, mode])

  const refreshAddresses = useCallback(async () => {
    if (!isAuthLoaded || !isUserLoaded || !isSignedIn || !canonicalUser?.id) {
      addressesRequestVersion.current += 1
      setAddresses([])
      setAddressesOwnerId(null)
      setAddressesError(null)
      setIsAddressesLoading(false)
      return
    }

    const requestVersion = ++addressesRequestVersion.current
    setIsAddressesLoading(true)
    try {
      const result = await fetchUserAddresses({ getToken })
      if (requestVersion !== addressesRequestVersion.current) return
      if (result.ok) {
        setAddresses(result.addresses)
        setAddressesOwnerId(canonicalUser.id)
        setAddressesError(null)
      } else if (result.status === 404 && result.error?.code === 'API_NOT_FOUND') {
        setAddressesError(null)
      } else {
        setAddressesError(result.error)
      }
    } catch {
      if (requestVersion === addressesRequestVersion.current) setAddressesError({ code: 'HYDRATION_FAILED', message: 'Không thể kết nối đến máy chủ.' })
    } finally {
      if (requestVersion === addressesRequestVersion.current) setIsAddressesLoading(false)
    }
  }, [isAuthLoaded, isUserLoaded, isSignedIn, canonicalUser, getToken])

  useEffect(() => {
    let isCancelled = false

    if (!isAuthLoaded || !isUserLoaded || !isSignedIn || !canonicalUser?.id) {
      addressesRequestVersion.current += 1
      // Discard any previous account's address cache before a new identity hydrates.
      // oxlint-disable-next-line react/set-state-in-effect
      setAddresses([])
      // oxlint-disable-next-line react/set-state-in-effect
      setAddressesOwnerId(null)
      // oxlint-disable-next-line react/set-state-in-effect
      setIsAddressesLoading(false)
      // oxlint-disable-next-line react/set-state-in-effect
      setAddressesError(null)
      return undefined
    }

    // oxlint-disable-next-line react/set-state-in-effect
    setIsAddressesLoading(true)
    // oxlint-disable-next-line react/set-state-in-effect
    setAddressesError(null)
    const requestVersion = ++addressesRequestVersion.current
    fetchUserAddresses({ getToken })
      .then((result) => {
        if (isCancelled || requestVersion !== addressesRequestVersion.current) return
        if (result.ok) {
          setAddresses(result.addresses)
          setAddressesOwnerId(canonicalUser.id)
          setAddressesError(null)
        } else if (result.status === 404 && result.error?.code === 'API_NOT_FOUND') {
          setAddressesError(null)
        } else {
          setAddressesError(result.error)
        }
      })
      .catch(() => {
        if (isCancelled || requestVersion !== addressesRequestVersion.current) return
        setAddressesError({ code: 'HYDRATION_FAILED', message: 'Không thể kết nối đến máy chủ.' })
      })
      .finally(() => {
        if (!isCancelled && requestVersion === addressesRequestVersion.current) {
          setIsAddressesLoading(false)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [isAuthLoaded, isUserLoaded, isSignedIn, canonicalUser, getToken])

  const user = useMemo(() => {
    if (!isSignedIn || !clerkUser) return null
    return {
      id: canonicalUser?.id ?? clerkUser.id,
      clerkId: clerkUser.id,
      displayName: canonicalUser?.displayName || clerkUser.fullName || clerkUser.firstName || '',
      name: clerkUser.fullName || clerkUser.firstName || canonicalUser?.displayName || '',
      email: clerkUser.primaryEmailAddress?.emailAddress || '',
      phone: clerkUser.primaryPhoneNumber?.phoneNumber || '',
      role: canonicalUser?.role ?? 'customer',
      status: canonicalUser?.status ?? 'active',
      locale: canonicalUser?.locale ?? 'vi-VN',
    }
  }, [isSignedIn, clerkUser, canonicalUser])

  const isAuthLoading = !isAuthLoaded || !isUserLoaded || (Boolean(isSignedIn) && !canonicalUser && !authError)

  const logout = useCallback(async () => {
    try {
      await signOut()
    } finally {
      addressesRequestVersion.current += 1
      setD1User(null)
      setD1UserOwner(null)
      setAuthError(null)
      setOrders([])
      setAddresses([])
      setAddressesOwnerId(null)
      setIsAddressesLoading(false)
      setAddressesError(null)
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

  const addAddress = useCallback(async (payload) => {
    const result = await createUserAddress({ address: payload, getToken })
    if (result.ok && result.address) {
      await refreshAddresses()
    }
    return result
  }, [getToken, refreshAddresses])

  const editAddress = useCallback(async (id, payload) => {
    const result = await updateUserAddress({ address: payload, id, getToken })
    if (result.ok && result.address) {
      await refreshAddresses()
    }
    return result
  }, [getToken, refreshAddresses])

  const removeAddress = useCallback(async (id) => {
    const result = await deleteUserAddress({ id, getToken })
    if (result.ok) {
      await refreshAddresses()
    }
    return result
  }, [getToken, refreshAddresses])

  const makeAddressDefault = useCallback(async (id) => {
    const result = await setDefaultUserAddress({ id, getToken })
    if (result.ok && result.address) {
      await refreshAddresses()
    }
    return result
  }, [getToken, refreshAddresses])

  const value = useMemo(() => ({
    orders,
    isOrdersLoading,
    ordersError,
    refreshOrders,
    retryOrders: refreshOrders,
    addresses: visibleAddresses,
    savedAddresses: visibleAddresses,
    isAddressesLoading,
    addressesError,
    refreshAddresses,
    addAddress,
    createAddress: addAddress,
    editAddress,
    updateAddress: editAddress,
    removeAddress,
    deleteAddress: removeAddress,
    makeAddressDefault,
    setDefaultAddress: makeAddressDefault,
    user,
    d1User: canonicalUser,
    isAuthLoading,
    authError,
    retryAuth: hydrateUser,
    logout,
    updateProfile,
    addOrder,
  }), [
    orders,
    isOrdersLoading,
    ordersError,
    refreshOrders,
    visibleAddresses,
    isAddressesLoading,
    addressesError,
    refreshAddresses,
    addAddress,
    editAddress,
    removeAddress,
    makeAddressDefault,
    user,
    canonicalUser,
    isAuthLoading,
    authError,
    hydrateUser,
    logout,
    updateProfile,
    addOrder,
  ])

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}
