import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { IconCheck, IconTrendingUp } from '../components/Icons'

interface ProgressRow {
  content_id: string
  completed: boolean
  updated_at: string
}

interface CatalogContent {
  content_id: string
  title: string
  topic: string
}

export default function Progreso() {
  const { user } = useAuth()
  const [rows, setRows] = useState<ProgressRow[]>([])
  const [mastered, setMastered] = useState<string[]>([])
  const [catalog, setCatalog] = useState<Record<string, CatalogContent>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!user) return
      setLoading(true)

      const { data: progData, error: progError } = await supabase
        .from('progress')
        .select('content_id, completed, updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
      if (!progError && progData) setRows(progData as ProgressRow[])

      const { data: masData, error: masError } = await supabase
        .from('mastered_concepts')
        .select('concept_id')
        .eq('user_id', user.id)
      if (!masError && masData) setMastered(masData.map((r) => r.concept_id))

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
        // Si el backend no está, mostramos los IDs
      }

      setLoading(false)
    }
    load()
  }, [user])

  const completed = rows.filter((r) => r.completed).length
  const pct = rows.length ? Math.round((completed / rows.length) * 100) : 0

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-12">
      <h1 className="mb-2 text-xl font-bold tracking-tight text-text sm:text-2xl">Tu progreso</h1>
      <p className="mb-8 text-muted">Contenidos que has completado y conceptos que dominas.</p>

      {/* Barra de avance */}
      <div className="card mb-8 p-5 sm:p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-medium text-text">
            <IconTrendingUp size={18} className="text-accent" />
            Contenidos completados
          </span>
          <span className="text-sm font-semibold text-text">
            {completed} / {rows.length} ({pct}%)
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

      {loading ? (
        <p className="text-center text-muted">Cargando…</p>
      ) : rows.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-muted">
            Aún no has completado ningún contenido. Empieza con tus recomendaciones.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.content_id}
              className="card flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <span className="block break-words text-sm font-medium text-text">
                  {catalog[row.content_id]?.title ?? row.content_id}
                </span>
                {catalog[row.content_id]?.topic && (
                  <span className="mt-1 inline-block chip badge-difficulty">
                    {catalog[row.content_id]?.topic}
                  </span>
                )}
              </div>
              <span
                className={`chip self-start sm:self-auto ${
                  row.completed ? 'badge-success' : 'badge-difficulty'
                }`}
              >
                {row.completed ? 'Completado' : 'En curso'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
