import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { IconChart, IconHome, IconLogout, IconSparkles, IconUser } from './Icons'

export default function Layout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const navItem = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
      isActive
        ? 'bg-primary-light text-primary'
        : 'text-muted hover:bg-background hover:text-text'
    }`

  const navItems = [
    { to: '/', label: 'Inicio', icon: IconHome, end: true },
    { to: '/cuestionario', label: 'Perfil', icon: IconUser },
    { to: '/recomendaciones', label: 'Recomendaciones', icon: IconSparkles },
    { to: '/progreso', label: 'Progreso', icon: IconChart },
  ]

  return (
    <div className="flex min-h-screen flex-col">
      {/* Barra superior (desktop) */}
      <header className="sticky top-0 z-10 hidden border-b border-border bg-surface/90 backdrop-blur-sm md:block">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
              <IconTrendingMark />
            </span>
            <span className="text-lg font-bold tracking-tight text-text">
              Finanzas<span className="text-accent">IA</span>
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={navItem} end={item.end}>
                <item.icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            ))}

            {user ? (
              <button
                onClick={handleSignOut}
                className="ml-2 flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted transition hover:bg-background hover:text-text"
                title="Cerrar sesión"
              >
                <IconLogout size={18} />
                <span>Salir</span>
              </button>
            ) : (
              <Link to="/login" className="btn btn-primary ml-2 !py-2">
                Entrar
              </Link>
            )}
          </nav>
        </div>
      </header>

      {/* Barra superior compacta (móvil/tablet) */}
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur-sm md:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
              <IconTrendingMark />
            </span>
            <span className="text-lg font-bold tracking-tight text-text">
              Finanzas<span className="text-accent">IA</span>
            </span>
          </Link>
          {user ? (
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted"
              title="Cerrar sesión"
            >
              <IconLogout size={16} />
              <span>Salir</span>
            </button>
          ) : (
            <Link to="/login" className="btn btn-primary !px-3 !py-1.5 !text-xs">
              Entrar
            </Link>
          )}
        </div>
      </header>

      <main className="flex-1 pb-16 md:pb-0">
        <Outlet />
      </main>

      {/* Barra de navegación inferior (móvil/tablet) */}
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface md:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition ${
                  isActive ? 'text-primary' : 'text-muted'
                }`
              }
            >
              <item.icon size={22} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      <footer className="hidden border-t border-border bg-surface py-6 md:block">
        <div className="mx-auto max-w-5xl px-4 text-center text-xs text-muted">
          FinanzasIA — Plataforma de educación financiera personalizada · Prototipo TFM
        </div>
      </footer>
    </div>
  )
}

// Marca del logo (gráfico simple y consistente)
function IconTrendingMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </svg>
  )
}
