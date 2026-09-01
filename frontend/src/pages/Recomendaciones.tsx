import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { getRecommendations, type RecommendationResponse } from '../lib/api'
import { registerInteraction } from '../lib/events'
import { buildUserProfile } from '../lib/profile'
import { supabase } from '../lib/supabase'
import { IconArrowRight, IconBook, IconCheck, IconSparkles } from '../components/Icons'

export default function Recomendaciones() {
  const { user } = useAuth()
  const [data, setData] = useState<RecommendationResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [completing, setCompleting] = useState<string | null>(null)

  // Registra una interacción, marca el contenido como completado y registra los
  // conceptos que enseña como dominados (para desbloquear contenidos avanzados).
  async function handleComplete(contentId: string) {
    if (!user) return
    setCompleting(contentId)
    try {
      // Registra el evento de dominio (score >= 0.5, relevante). El contenido
      // llegó por recomendación del sistema, así que is_recommended=true.
      await registerInteraction({
        userId: user.id,
        contentId,
        event: 'completed',
        isRecommended: true,
      })

      const { error: progError } = await supabase.from('progress').upsert({
        user_id: user.id,
        content_id: contentId,
        completed: true,
        updated_at: new Date().toISOString(),
      })
      if (progError) throw progError

      const catalogRes = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/catalog`,
      )
      if (catalogRes.ok) {
        const catalog = await catalogRes.json()
        const content = catalog.find((c: { content_id: string }) => c.content_id === contentId)
        const conceptsTaught = content?.concepts_taught ?? []
        if (conceptsTaught.length > 0) {
          const { error: masteryError } = await supabase.from('mastered_concepts').upsert(
            conceptsTaught.map((cid: string) => ({
              user_id: user.id,
              concept_id: cid,
            })),
          )
          if (masteryError) throw masteryError
        }
      }

      const profile = await buildUserProfile(user.id)
      const resp = await getRecommendations(profile)
      setData(resp)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar el progreso')
    } finally {
      setCompleting(null)
    }
  }

  // Cargar las recomendaciones al montar (con el perfil real del usuario)
  useEffect(() => {
    async function load() {
      if (!user) return
      setLoading(true)
      setError(null)
      try {
        const profile = await buildUserProfile(user.id)
        const resp = await getRecommendations(profile)
        setData(resp)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar recomendaciones')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user])

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center text-muted">
        Cargando recomendaciones…
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <p className="rounded-lg bg-error-light px-4 py-3 text-sm text-error">{error}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-12">
      <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text sm:text-2xl">Tus recomendaciones</h1>
          <p className="text-sm text-muted">Contenidos adaptados a tu perfil y a tu progreso</p>
        </div>
        {data && (
          <span className="chip badge-difficulty self-start sm:self-auto">Modelo: {data.source_model}</span>
        )}
      </div>

      {data && data.n_filtered > 0 && (
        <p className="mb-6 rounded-xl bg-accent-light px-4 py-3 text-sm text-accent">
          Se filtraron {data.n_filtered} contenidos por no cumplir los prerrequisitos
          pedagógicos.
        </p>
      )}

      <div className="space-y-4">
        {data?.recommendations.map((rec) => (
          <div key={rec.content_id} className="card card-hover p-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="chip badge-topic">{rec.topic}</span>
              <span className="chip badge-difficulty">{rec.difficulty}</span>
              {rec.format && <span className="chip badge-difficulty">{rec.format}</span>}
            </div>

            <h2 className="mb-1 text-lg font-semibold text-text">{rec.title}</h2>
            {rec.summary && <p className="mb-3 text-sm text-muted">{rec.summary}</p>}

            <div className="mb-4 flex items-start gap-2 rounded-lg bg-background px-3 py-2.5">
              <IconSparkles size={16} className="mt-0.5 shrink-0 text-accent" />
              <p className="text-sm text-muted">
                <span className="font-medium text-text">Por qué:</span> {rec.explanation}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                to={`/contenido/${rec.content_id}`}
                className="btn btn-ghost !px-3 !py-2"
              >
                <IconBook size={16} />
                Leer contenido
                <IconArrowRight size={16} />
              </Link>
              <button
                onClick={() => handleComplete(rec.content_id)}
                disabled={completing === rec.content_id}
                className="btn btn-success !px-3 !py-2"
              >
                <IconCheck size={16} />
                {completing === rec.content_id ? 'Guardando…' : 'Completado'}
              </button>
            </div>
          </div>
        ))}

        {data && data.recommendations.length === 0 && (
          <div className="card p-10 text-center">
            <p className="text-muted">
              No hay recomendaciones disponibles. Completa tu perfil para empezar.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
