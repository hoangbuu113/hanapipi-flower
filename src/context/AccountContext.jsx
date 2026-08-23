import { useEffect, useMemo, useState } from 'react'
import { AccountContext } from './accountStore'

const accountStorageKey = 'hanapipi-flower:account'
const orderStorageKey = 'hanapipi-flower:orders'

function readStorage(key, fallback) {
  try {
    return JSON.parse(window.localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
  }
}

export function AccountProvider({ children }) {
  const [account, setAccount] = useState(() => readStorage(accountStorageKey, null))
  const [orders, setOrders] = useState(() => {
    const stored = readStorage(orderStorageKey, [])
    return Array.isArray(stored) ? stored : []
  })

  useEffect(() => {
    if (account) window.localStorage.setItem(accountStorageKey, JSON.stringify(account))
    else window.localStorage.removeItem(accountStorageKey)
  }, [account])
  useEffect(() => { window.localStorage.setItem(orderStorageKey, JSON.stringify(orders)) }, [orders])

  const value = useMemo(() => ({
    orders,
    user: account?.isLoggedIn ? account.profile : null,
    register: ({ email, name, password, phone }) => setAccount({ isLoggedIn: true, password, profile: { email, name, phone } }),
    login: ({ email, password }) => {
      if (!account || account.profile.email.toLowerCase() !== email.toLowerCase() || account.password !== password) return false
      setAccount((current) => ({ ...current, isLoggedIn: true }))
      return true
    },
    logout: () => setAccount((current) => current ? { ...current, isLoggedIn: false } : current),
    updateProfile: (profile) => setAccount((current) => current ? { ...current, profile } : current),
    addOrder: (order) => setOrders((current) => [order, ...current]),
  }), [account, orders])

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}
