import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getContentDetail, getMissingPrereqs, type ContentDetail, type MissingPrereq } from '../lib/api'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { registerInteraction } from '../lib/events'
import ContentBlocks from '../components/ContentBlocks'
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconExternalLink,
  IconLink,
  IconListChecks,
  IconSearch,
  IconSparkles,
} from '../components/Icons'

// Detecta si un contenido es una herramienta/calculadora/simulador a partir
// de su formato en el catálogo o de su título. Se usa para mostrar un banner
// prominente con el link directo en lugar del "Fuente: <url>" genérico.
const TOOL_FORMATS = new Set(['calculadora', 'simulador', 'herramienta'])
function isExternalTool(content: ContentDetail): boolean {
  if (content.format && TOOL_FORMATS.has(content.format.toLowerCase())) return true
  const title = (content.title ?? '').toLowerCase()
  return /calculadora|herramienta|simulador/.test(title)
}
// Etiqueta del CTA según el formato (para que diga "Abrir la calculadora" o
// "Ir al simulador" en vez de un genérico).
function toolCtaLabel(content: ContentDetail): string {
  const fmt = (content.format ?? '').toLowerCase()
  if (fmt === 'calculadora') return 'Abrir la calculadora'
  if (fmt === 'simulador') return 'Abrir el simulador'
  if (fmt === 'herramienta') return 'Abrir la herramienta'
  return 'Abrir la herramienta externa'
}

export default function Contenido() {
  const { contentId } = useParams<{ contentId: string }>()
  const { user } = useAuth()
  const [content, setContent] = useState<ContentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [missingPrereqs, setMissingPrereqs] = useState<MissingPrereq[]>([])
  const [prereqsChecked, setPrereqsChecked] = useState(false)
  // Posición de scroll al salir hacia el quiz, para que al volver desde
  // /contenido/:id/quiz se restaure automáticamente.
  const [showStickyQuiz, setShowStickyQuiz] = useState(false)

  // Guarda scrollY antes de ir al quiz, para restaurar al volver.
  function goToQuiz() {
    if (!contentId) return
    sessionStorage.setItem(`scrollY:${contentId}`, String(window.scrollY))
    window.location.href = `/contenido/${contentId}/quiz`
  }

  // Restaura scroll si acabamos de volver del quiz.
  useEffect(() => {
    if (!contentId) return
    const saved = sessionStorage.getItem(`scrollY:${contentId}`)
    if (saved) {
      // Doble rAF para que el DOM esté listo.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo({ top: Number(saved), behavior: 'instant' as ScrollBehavior })
          sessionStorage.removeItem(`scrollY:${contentId}`)
        })
      })
    }
  }, [contentId])

  // Muestra el botón sticky 'Ir al quiz' cuando el usuario ha llegado
  // cerca del final del documento. Esto evita spam: aparece solo después
  // de leer.
  useEffect(() => {
    function onScroll() {
      // Aparece a partir del 75% del scroll (hacia el final).
      const scrollable = document.documentElement.scrollHeight - window.innerHeight
      const ratio = scrollable > 0 ? window.scrollY / scrollable : 1
      setShowStickyQuiz(ratio > 0.75)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [contentId])

  useEffect(() => {
    async function load() {
      if (!contentId) return
      setLoading(true)
      setError(null)
      setPrereqsChecked(false)
      setMissingPrereqs([])
      try {
        const data = await getContentDetail(contentId)
        setContent(data)
        // Registra la visualización (evento pasivo, score < 0.5)
        if (user) {
          registerInteraction({
            userId: user.id,
            contentId,
            event: 'view',
          }).catch(() => {
            /* no bloquea la lectura del contenido */
          })
          // Aviso pedagógico: comprueba qué prerrequisitos faltan.
          // Si la llamada falla, no rompemos la lectura.
          try {
            const { data: mastered } = await supabase
              .from('mastered_concepts')
              .select('concept_id')
              .eq('user_id', user.id)
            const ids = (mastered ?? []).map((r) => r.concept_id as string)
            const resp = await getMissingPrereqs(contentId, ids)
            setMissingPrereqs(resp.missing)
          } catch {
            /* sin aviso si falla */
          } finally {
            setPrereqsChecked(true)
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar el contenido')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [contentId, user?.id])

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center text-muted">
        Cargando contenido…
      </div>
    )
  }

  if (error || !content) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <p className="rounded-lg bg-error-light px-4 py-3 text-sm text-error">
          {error ?? 'Contenido no encontrado'}
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-12">
      <h1 className="mb-6 break-words text-2xl font-bold tracking-tight text-text sm:text-3xl">
        {content.title ?? content.content_id}
      </h1>

      {/* Aviso pedagógico: prerrequisitos no dominados. NO bloquea el
          acceso al contenido (decision #5 del plan UX). Se muestra solo
          si el usuario está autenticado y hemos comprobado ya los conceptos
          dominados. */}
      {prereqsChecked && missingPrereqs.length > 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:p-5">
          <IconAlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-700" />
          <div className="text-sm text-amber-900">
            <p className="font-semibold">Prerrequisitos no dominados</p>
            <p className="mt-1 leading-relaxed">
              Este contenido se entiende mejor si ya dominas estos conceptos.
              Puedes seguir leyendo, pero te recomendamos completarlos antes.
            </p>
            <ul className="mt-2 space-y-1">
              {missingPrereqs.map((c) => (
                <li key={c.concept_id}>
                  <Link
                    to={`/explorar?q=${encodeURIComponent(c.concept_name)}`}
                    className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-amber-700"
                  >
                    <IconSearch size={12} />
                    {c.concept_name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Resumen (tldr) */}
      {content.tldr && (
        <div className="mb-6 rounded-2xl border border-accent/20 bg-accent-light p-5 sm:p-6">
          <div className="mb-2 flex items-center gap-2">
            <IconSparkles size={18} className="text-accent" />
            <h2 className="text-sm font-semibold text-accent">En resumen</h2>
          </div>
          <p className="break-words text-sm leading-relaxed text-text">{content.tldr}</p>
        </div>
      )}

      {/* Banner de fuente externa: para herramientas/calculadoras es
          prominente (CTA primario), para artículos es un botón outline
          discreto. Ambos abren la URL del catálogo en pestaña nueva.
          Se renderiza tras el TLDR para que el usuario lo vea ANTES de
          leer el cuerpo. */}
      {content.url && isExternalTool(content) && (
        <a
          href={content.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-6 flex items-center gap-3 rounded-2xl border-2 border-secondary bg-secondary-light p-4 transition hover:bg-secondary-light/80 sm:p-5"
        >
          <IconExternalLink size={22} className="shrink-0 text-secondary" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-text">{toolCtaLabel(content)}</p>
            <p className="truncate text-xs text-muted">{content.url}</p>
          </div>
        </a>
      )}
      {content.url && !isExternalTool(content) && (
        <a
          href={content.url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-outline mb-6 !px-4 !py-2"
        >
          <IconExternalLink size={16} />
          Ir a fuente original
        </a>
      )}

      {/* Puntos clave */}
      {content.key_points && content.key_points.length > 0 && (
        <div className="card mb-6 p-5 sm:p-6">
          <h2 className="mb-3 text-sm font-semibold text-text">Puntos clave</h2>
          <ul className="space-y-2.5">
            {content.key_points.map((kp, i) => (
              <li key={i} className="flex gap-3 break-words text-sm text-muted">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                {kp}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Texto del contenido */}
      {content.blocks && content.blocks.length > 0 ? (
        <div className="card mb-6 p-6 sm:p-8">
          <h2 className="mb-4 text-sm font-semibold text-text">Contenido</h2>
          <ContentBlocks blocks={content.blocks} />
        </div>
      ) : content.text ? (
        <div className="card mb-6 p-5 sm:p-6">
          <h2 className="mb-3 text-sm font-semibold text-text">Contenido</h2>
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted">
            {content.text}
          </div>
        </div>
      ) : null}

      {/* Enlaces relacionados embebidos justo después del cuerpo. Los hrefs
          son del JSON estructurado/scraped (no se alucina texto): se
          muestran como una línea 'Ver también:' con los enlaces, sin
          modificar el contenido del párrafo. Esto evita que el usuario
          tenga que hacer scroll hasta el final para ver los recursos. */}
      {content.links && content.links.filter((l) => l.href).length > 0 && (
        <div className="mb-6 rounded-xl border border-accent/20 bg-accent-light/50 p-4 sm:p-5">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-secondary">
            <IconLink size={14} />
            Ver también
          </p>
          <ul className="flex flex-col gap-1.5">
            {content.links.filter((l) => l.href).map((l, i) => (
              <li key={i} className="text-sm">
                <a
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-secondary underline-offset-2 hover:underline"
                >
                  {l.text || l.href}
                  <IconExternalLink size={12} />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Botón sticky 'Ir al cuestionario'. Solo aparece cuando:
            1) el contenido tiene quiz, y
            2) el usuario ha hecho scroll cerca del final (≥75% del
               documento), para no distraer al principio. El scroll al
               volver desde /quiz se restaura con sessionStorage. */}
      {content.quiz && content.quiz.length > 0 && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={goToQuiz}
            className="btn btn-primary !px-5 !py-3"
          >
            <IconListChecks size={18} />
            Ir al cuestionario ({content.quiz.length}{' '}
            {content.quiz.length === 1 ? 'pregunta' : 'preguntas'})
            <IconArrowLeft size={16} className="rotate-180" />
          </button>
        </div>
      )}

      {/* Botón sticky flotante: aparece solo cuando el usuario está al
          final del artículo. Misma acción que el botón estático de
          arriba, pero persistente para que no haya que buscarlo. */}
      {content.quiz && content.quiz.length > 0 && showStickyQuiz && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-4">
          <div className="pointer-events-auto w-full max-w-md rounded-full border border-secondary bg-surface/95 shadow-lg backdrop-blur">
            <button
              type="button"
              onClick={goToQuiz}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-secondary px-5 py-3 text-sm font-semibold text-white transition hover:bg-secondary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-secondary"
            >
              <IconListChecks size={18} />
              Ir al cuestionario ({content.quiz.length}{' '}
              {content.quiz.length === 1 ? 'pregunta' : 'preguntas'})
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
