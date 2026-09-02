// Contexto de autenticación (Supabase Auth).
// Aislado en un módulo para poder cambiar de proveedor sin tocar el resto.
import type { Session, User } from '@supabase/supabase-js'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '../lib/supabase'

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

// Supabase emite eventos de onAuthStateChange en cada cambio de foco/
// refresh de token, y siempre entrega un objeto User/Session nuevo,
// aunque el uid sea el mismo. Si asignamos el objeto tal cual con
// setUser/setSession, cualquier useEffect([user]) se re-ejecuta y la
// página parpadea ("Cargando...") tras cada cambio de pestaña.
// Para evitarlo, comparamos por id y solo asignamos si cambia la
// identidad (login, logout) o si el objeto es null por primera vez.
function sameIdentity(a: User | null, b: User | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.id === b.id
}

function sameSession(a: Session | null, b: Session | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.access_token === b.access_token
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null)
  const [session, setSessionState] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  // Wrappers estables: solo asignan si el uid/token cambia.
  const setUser = useCallback((next: User | null) => {
    setUserState((prev) => (sameIdentity(prev, next) ? prev : next))
  }, [])
  const setSession = useCallback((next: Session | null) => {
    setSessionState((prev) => (sameSession(prev, next) ? prev : next))
  }, [])

  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setSession(data.session)
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setUser(s?.user ?? null)
      setLoading(false)
    })

    return () => {
      cancelled = true
      listener.subscription.unsubscribe()
    }
  }, [setSession, setUser])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }, [])
  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
  }, [])
  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }, [])

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
