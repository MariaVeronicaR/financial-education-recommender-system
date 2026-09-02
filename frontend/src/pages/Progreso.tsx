import { useEffect, useState, type MouseEvent, type KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { IconArrowRight, IconBook, IconCheck, IconTrendingUp } from '../components/Icons'

interface ProgressRow {
  content_id: string
  completed: boolean
  updated_at: string
}

interface CatalogContent {
  content_id: string
  title: string
  topic: string
  difficulty: string
  format: string
  summary: string
  url: string
}

export default function Progreso() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [rows, setRows] = useState<ProgressRow[]>([])
  const [mastered, setMastered] = useState<string[]>([])
  const [catalog, setCatalog] = useState<Record<string, CatalogContent>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!user) return
      setLoading(true)

      // Las dos consultas a Supabase son independientes: lanzarlas en paralelo
      // en vez de en serie ahorra un round-trip de latencia por mount.
      const [progRes, masRes] = await Promise.all([
        supabase
          .from('progress')
          .select('content_id, completed, updated_at')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false }),
        supabase
          .from('mastered_concepts')
          .select('concept_id')
          .eq('user_id', user.id),
      ])
      if (!progRes.error && progRes.data) setRows(progRes.data as ProgressRow[])
      if (!masRes.error && masRes.data) setMastered(masRes.data.map((r) => r.concept_id))

      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/catalog`,
        )
        if (res.ok) {
          const list = (await res.json()) as CatalogContent[]
          const map: Record<string, CatalogContent> = {}
          list.forEach((c) => (map[c.content_id] = c))
          setCatalog(map)
        }
      } catch {
        // Si el backend no está, mostramos los IDs como fallback.
      }

      setLoading(false)
    }
    load()
  }, [user])

  const completedRows = rows.filter((r) => r.completed)
  const completed = completedRows.length
  const pct = rows.length ? Math.round((completed / rows.length) * 100) : 0

  function goToContent(contentId: string, e: MouseEvent | KeyboardEvent) {
    e.stopPropagation()
    navigate(`/contenido/${contentId}`)
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-12">
      <h1 className="mb-2 text-xl font-bold tracking-tight text-text sm:text-2xl">Tu progreso</h1>
      <p className="mb-8 text-muted">
        Contenidos que has completado y conceptos que dominas.
      </p>

      {/* Barra de avance */}
      <div className="card mb-8 p-5 sm:p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-medium text-text">
            <IconTrendingUp size={18} className="text-accent" />
            Contenidos completados
          </span>
          <span className="text-sm font-semibold text-text">
            {completed} ({pct}%)
          </span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-background">
          <div
            className="h-full rounded-full bg-accent transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Conceptos dominados */}
      {mastered.length > 0 && (
        <div className="card mb-8 p-6">
          <h2 className="mb-3 text-sm font-semibold text-text">
            Conceptos que dominas ({mastered.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {mastered.map((cid) => (
              <span key={cid} className="chip badge-success">
                <IconCheck size={12} className="mr-1" />
                {cid}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Listado de contenidos completados — formato card, mismo visual
          que Recomendaciones para coherencia. Toda la card es clicable
          para releer el contenido. */}
      <h2 className="mb-3 text-sm font-semibold text-text">
        Contenidos que has completado{' '}
        {completed > 0 && <span className="text-muted">({completed})</span>}
      </h2>

      {loading ? (
        <p className="text-center text-muted">Cargando…</p>
      ) : completed === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-muted">
            Aún no has completado ningún contenido.{' '}
            <Link to="/recomendaciones" className="text-secondary hover:underline">
              Empieza con tus recomendaciones
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {completedRows.map((row) => {
            const c = catalog[row.content_id]
            const title = c?.title ?? row.content_id
            return (
              <div
                key={row.content_id}
                role="link"
                tabIndex={0}
                onClick={(e) => goToContent(row.content_id, e)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    goToContent(row.content_id, e)
                  }
                }}
                className="card card-hover cursor-pointer p-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
              >
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {c?.topic && <span className="chip badge-topic">{c.topic}</span>}
                  {c?.difficulty && (
                    <span className="chip badge-difficulty">{c.difficulty}</span>
                  )}
                  {c?.format && <span className="chip badge-difficulty">{c.format}</span>}
                  <span className="chip badge-success ml-auto">✓ Visto</span>
                </div>

                <h3 className="mb-1 text-lg font-semibold text-text">{title}</h3>
                {c?.summary && <p className="mb-3 text-sm text-muted">{c.summary}</p>}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={(e) => goToContent(row.content_id, e)}
                    className="btn btn-ghost !px-3 !py-2"
                  >
                    <IconBook size={16} />
                    Releer
                    <IconArrowRight size={16} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
