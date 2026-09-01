import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { useAuth } from './lib/auth'
import Contenido from './pages/Contenido'
import Cuestionario from './pages/Cuestionario'
import Inicio from './pages/Inicio'
import Login from './pages/Login'
import Progreso from './pages/Progreso'
import Recomendaciones from './pages/Recomendaciones'

// Ruta protegida: requiere sesión
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="p-8 text-center text-slate-500">Cargando…</div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Inicio />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/cuestionario"
            element={
              <RequireAuth>
                <Cuestionario />
              </RequireAuth>
            }
          />
          <Route
            path="/recomendaciones"
            element={
              <RequireAuth>
                <Recomendaciones />
              </RequireAuth>
            }
          />
          <Route
            path="/progreso"
            element={
              <RequireAuth>
                <Progreso />
              </RequireAuth>
            }
          />
          <Route
            path="/contenido/:contentId"
            element={
              <RequireAuth>
                <Contenido />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
