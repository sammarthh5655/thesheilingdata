import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { backend } from '../backend/index.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)     // { uid, profile } | null
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = backend.onAuth((state) => {
      setUser(state)
      setLoading(false)
    })
    return unsub
  }, [])

  // Re-fetch the profile (role/status/verified may change under us).
  const refreshProfile = useCallback(async () => {
    if (!user?.uid) return
    const profile = await backend.getUser(user.uid)
    setUser((u) => (u ? { ...u, profile } : u))
  }, [user?.uid])

  const role = user?.profile?.role || null
  const value = {
    user,
    loading,
    refreshProfile,
    isSignedIn: !!user,
    isVerified: !!user?.profile?.verified,
    isBanned: user?.profile?.status === 'banned',
    role,
    canUpload: (role === 'teacher' || role === 'admin') && user?.profile?.status === 'active',
    isAdminRole: role === 'admin',
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
