import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useAuth } from '@clerk/clerk-react'
import api from '../utils/api'
import { io } from 'socket.io-client'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const { getToken, userId, isSignedIn } = useAuth()
  const [user, setUser]           = useState(null)   // MongoDB user profile
  const [loading, setLoading]     = useState(true)
  const [socket, setSocket]       = useState(null)
  const [onlineUsers, setOnlineUsers] = useState([])
  const [unreadMessages, setUnreadMessages] = useState(0)

  // ── Fetch MongoDB user profile ───────────────────────────────
  const fetchUser = useCallback(async () => {
    if (!isSignedIn) { setLoading(false); return }
    try {
      const token = await getToken()
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
      const { data } = await api.get('/users/me')
      setUser(data)
    } catch (err) {
      // User may not exist yet (webhook hasn't fired) — that's ok
      console.warn('User profile not found:', err.response?.status)
    } finally {
      setLoading(false)
    }
  }, [isSignedIn, getToken])

  useEffect(() => { fetchUser() }, [fetchUser])

  // ── Socket.io connection ─────────────────────────────────────
  useEffect(() => {
    if (!isSignedIn || !user) return

    const s = io(import.meta.env.VITE_SOCKET_URL || 'https://skiilconect.onrender.com', {
      transports: ['websocket'],
    })
    setSocket(s)

    s.emit('user:join', user._id)

    s.on('users:online', (users) => setOnlineUsers(users))

    return () => {
      s.disconnect()
      setSocket(null)
    }
  }, [isSignedIn, user])

  // ── Token refresh — attach token before each request ─────────
  useEffect(() => {
    if (!isSignedIn) return
    const interval = setInterval(async () => {
      const token = await getToken()
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
    }, 50_000) // refresh every ~50s
    return () => clearInterval(interval)
  }, [isSignedIn, getToken])

  const value = {
    user,
    setUser,
    loading,
    fetchUser,
    socket,
    onlineUsers,
    unreadMessages,
    setUnreadMessages,
    isEmployer:  user?.role === 'employer',
    isJobSeeker: user?.role === 'job_seeker',
    hasRole:     !!user?.role,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
