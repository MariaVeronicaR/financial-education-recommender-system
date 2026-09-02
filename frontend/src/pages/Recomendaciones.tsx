import { useEffect, useState, type MouseEvent, type KeyboardEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { getRecommendations, type RecommendationResponse } from '../lib/api'
import { registerInteraction } from '../lib/events'
import { buildUserProfile, getProfileFromSupabase, isProfileComplete } from '../lib/profile'
import { supabase } from '../lib/supabase'
import { IconArrowRight, IconBook, IconCheck, IconSparkles } from '../components/Icons'

// Catálogo cacheado a nivel de módulo: handleComplete necesita concepts_taught
// del contenido completado, pero /catalog es estático y no cambia entre
// requests. Cachearlo evita un fetch por cada "Completado" (antes se llamaba
// a /catalog en cada handleComplete).
let catalogCache: { content_id: string; concepts_taught: string[] }[] = []

async function getCatalogCached(): Promise<{ content_id: string; concepts_taught: string[] }[]> {
  if (catalogCache.length > 0) return catalogCache
  const res = await fetch(
    `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/catalog`,
  )
  if (!res.ok) return []
  catalogCache = await res.json()
  return catalogCache
}

export default function Recomendaciones() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [data, setData] = useState<RecommendationResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [completing, setCompleting] = useState<string | null>(null)
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  // Estado del onboarding: si el usuario nunca pasó por el cuestionario
  // mostramos un CTA en vez de recomendaciones (que serían casi iguales
  // para todos al no tener perfil). Se reevalúa al volver del cuestionario.
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null)

  // Carga inicial: perfil + recomendaciones + contenidos ya completados.
  // Si el perfil no está completo (faltan los 5 campos sentinela), no
  // llamamos al backend y mostramos CTA al cuestionario.
  useEffect(() => {
    async function load() {
      if (!user) return
      setLoading(true)
      setError(null)
      try {
        const [profileRow, completedResp] = await Promise.all([
          getProfileFromSupabase(user.id),
          supabase
            .from('progress')
            .select('content_id, completed')
            .eq('user_id', user.id),
        ])

        const complete = isProfileComplete(profileRow)
        setProfileComplete(complete)

        if (!complete) {
          // Perfil no iniciado: mostrar CTA, no llamar al backend.
          setData(null)
          setCompletedIds(new Set())
          return
        }

        const profile = await buildUserProfile(user.id)
        const resp = await getRecommendations(profile)
        setData(resp)
        const ids = new Set<string>()
        ;(completedResp.data ?? []).forEach(
          (r: { content_id: string; completed: boolean }) => {
            if (r.completed) ids.add(r.content_id)
          },
        )
        setCompletedIds(ids)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar recomendaciones')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user?.id, location.key]) // Depende del uid (no de la referencia del objeto),
                              // así onAuthStateChange en foco/refresh no re-ejecuta.

  // Registra una interacción, marca el contenido como completado y registra los
  // conceptos que enseña como dominados (para desbloquear contenidos avanzados).
  async function handleComplete(contentId: string) {
    if (!user) return
    setCompleting(contentId)
    try {
      // Leemos la sesión actual del cliente de Supabase directamente.
      // Antes lo hacíamos con `user.id` del contexto de React, pero en
      // algunos navegadores el token JWT quedaba expirado en el cliente
      // aunque el contexto tuviera user; el upsert salía con 403. Hacer
      // getSession() fuerza a refrescar el token y nos da el uuid real.
      const { data: sess } = await supabase.auth.getSession()
      const sessionUser = sess.session?.user
      if (!sessionUser) {
        throw new Error(
          'Tu sesión ha expirado. Recarga la página y vuelve a iniciar sesión.',
        )
      }
      const uid = sessionUser.id
      // Registra el evento de dominio (score >= 0.5, relevante). El contenido
      // llegó por recomendación del sistema, así que is_recommended=true.
      await registerInteraction({
        userId: uid,
        contentId,
        event: 'completed',
        isRecommended: true,
      })

      const { error: progError } = await supabase.from('progress').upsert({
        user_id: uid,
        content_id: contentId,
        completed: true,
        updated_at: new Date().toISOString(),
      })
      if (progError) throw progError

      const catalog = await getCatalogCached()
      const content = catalog.find((c: { content_id: string }) => c.content_id === contentId)
      // Deduplicamos por si el catálogo devolviera concept_id repetidos (defensiva:
      // mismo motivo que en Quiz.tsx — upsert no soporta duplicates en el array).
      const conceptsTaught = Array.from(new Set(content?.concepts_taught ?? []))
      if (conceptsTaught.length > 0) {
          const { error: masteryError } = await supabase.from('mastered_concepts').upsert(
            conceptsTaught.map((cid: string) => ({
              user_id: uid,
              concept_id: cid,
            })),
          )
          if (masteryError) throw masteryError
        }

      // Marcamos visualmente este contenido como visto y refrescamos
      // el ranking (que ahora lo excluirá vía completed_content_ids).
      setCompletedIds((prev) => new Set(prev).add(contentId))
      const profile = await buildUserProfile(uid)
      const resp = await getRecommendations(profile)
      setData(resp)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar el progreso')
    } finally {
      setCompleting(null)
    }
  }

  // Navegación al contenido cuando se hace click en la card (no en los
  // botones). Se para la propagación para que los botones ("Completado",
  // "Releer") sigan funcionando independientemente.
  function goToContent(contentId: string, e: MouseEvent | KeyboardEvent) {
    e.stopPropagation()
    navigate(`/contenido/${contentId}`)
  }

  if (loading || profileComplete === null) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center text-muted">
        Cargando recomendaciones…
      </div>
    )
  }

  // Si el usuario nunca completó el cuestionario, mostramos un CTA al
  // cuestionario en vez de recomendaciones (serían casi iguales para
  // todos sin perfil). El modelo necesita los 5 campos clave.
  if (!profileComplete) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-12">
        <div className="card p-8 text-center sm:p-10">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-light text-primary">
            <IconSparkles size={28} />
          </div>
          <h1 className="mb-2 text-xl font-bold tracking-tight text-text sm:text-2xl">
            Completa tu perfil para empezar
          </h1>
          <p className="mx-auto mb-6 max-w-md text-sm text-muted">
            Las recomendaciones personalizadas necesitan unos datos básicos sobre
            ti: tu edad, nivel de estudios y tus objetivos financieros. Tarda
            menos de un minuto.
          </p>
          <Link
            to="/cuestionario"
            className="btn btn-primary !px-6 !py-3 !text-base"
          >
            Completar mi perfil
            <IconArrowRight size={18} />
          </Link>
        </div>
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

  const recoCount = data?.recommendations.length ?? 0

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-12">
      <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text sm:text-2xl">Tus recomendaciones</h1>
          <p className="text-sm text-muted">
            {data && recoCount > 0
              ? `${recoCount} contenido${recoCount === 1 ? '' : 's'} recomendado${recoCount === 1 ? '' : 's'} para ti`
              : 'Contenidos adaptados a tu perfil y a tu progreso'}
          </p>
        </div>
        {data && (
          <span className="chip badge-difficulty self-start sm:self-auto">Modelo: {data.source_model}</span>
        )}
      </div>

      {/* Banner "estás al día": se muestra cuando, tras filtrar completados
          y prerrequisitos, quedan menos de top_k recomendaciones nuevas. */}
      {data?.agotado && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Estás casi al día: te quedan pocos contenidos nuevos por explorar.{' '}
          <Link to="/explorar" className="font-medium underline underline-offset-2">
            Buscar contenidos →
          </Link>
        </div>
      )}

      <div className="space-y-4">
        {data?.recommendations.map((rec) => {
          const visto = completedIds.has(rec.content_id)
          return (
            <div
              key={rec.content_id}
              role="link"
              tabIndex={0}
              onClick={(e) => goToContent(rec.content_id, e)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  goToContent(rec.content_id, e)
                }
              }}
              className={`card card-hover cursor-pointer p-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary ${
                visto ? 'opacity-75' : ''
              }`}
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="chip badge-topic">{rec.topic}</span>
                <span className="chip badge-difficulty">{rec.difficulty}</span>
                {rec.format && <span className="chip badge-difficulty">{rec.format}</span>}
                {visto && (
                  <span className="chip badge-success ml-auto">✓ Visto</span>
                )}
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
                <button
                  type="button"
                  onClick={(e) => goToContent(rec.content_id, e)}
                  className="btn btn-ghost !px-3 !py-2"
                >
                  <IconBook size={16} />
                  {visto ? 'Releer' : 'Leer contenido'}
                  <IconArrowRight size={16} />
                </button>
                {!visto && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleComplete(rec.content_id)
                    }}
                    disabled={completing === rec.content_id}
                    className="btn btn-success !px-3 !py-2"
                  >
                    <IconCheck size={16} />
                    {completing === rec.content_id ? 'Guardando…' : 'Completado'}
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {data && recoCount === 0 && !data.agotado && (
          <div className="card p-10 text-center">
            <p className="text-muted">
              No hay recomendaciones disponibles. Completa tu perfil para empezar.
            </p>
          </div>
        )}

        {data && recoCount === 0 && data.agotado && (
          <div className="card p-10 text-center">
            <p className="text-muted">
              Has explorado casi todo el catálogo.{' '}
              <Link to="/explorar" className="text-secondary hover:underline">
                Explorar contenidos
              </Link>{' '}
              para repasar lo que ya has visto.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
