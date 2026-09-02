import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { IconEye, IconEyeOff, IconLock, IconMail } from '../components/Icons'

export default function Login() {
  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isRegister, setIsRegister] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (isRegister) {
        await signUp(email, password)
        navigate('/cuestionario')
      } else {
        await signIn(email, password)
        navigate('/')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de autenticación')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[calc(100svh-4rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 17l6-6 4 4 8-8" />
              <path d="M15 7h6v6" />
            </svg>
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-text">
            {isRegister ? 'Crea tu cuenta' : 'Bienvenido de nuevo'}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {isRegister
              ? 'Empieza tu itinerario de educación financiera'
              : 'Continúa aprendiendo a tu ritmo'}
          </p>
        </div>

        <div className="card p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
                  <IconMail size={18} />
                </span>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input !pl-10"
                  placeholder="tu@email.com"
                />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="password">
                Contraseña
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
                  <IconLock size={18} />
                </span>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input !pl-10 !pr-10"
                  placeholder="••••••••"
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-pressed={showPassword}
                  className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted transition hover:bg-background hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
                >
                  {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="rounded-lg bg-error-light px-3 py-2 text-sm text-error">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} className="btn btn-primary w-full !py-2.5">
              {loading ? 'Cargando…' : isRegister ? 'Registrarme' : 'Entrar'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            {isRegister ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?'}{' '}
            <button
              onClick={() => setIsRegister(!isRegister)}
              className="font-medium text-secondary hover:underline"
            >
              {isRegister ? 'Inicia sesión' : 'Regístrate'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
