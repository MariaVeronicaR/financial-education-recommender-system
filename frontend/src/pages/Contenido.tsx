import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getContentDetail, getMissingPrereqs, type ContentDetail, type MissingPrereq, type QuizQuestion } from '../lib/api'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { registerInteraction } from '../lib/events'
import ContentBlocks from '../components/ContentBlocks'
import { IconAlertTriangle, IconBook, IconCheck, IconSearch, IconSparkles } from '../components/Icons'

export default function Contenido() {
  const { contentId } = useParams<{ contentId: string }>()
  const { user } = useAuth()
  const [content, setContent] = useState<ContentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [results, setResults] = useState<Record<number, boolean>>({})
  const [quizSubmitted, setQuizSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [missingPrereqs, setMissingPrereqs] = useState<MissingPrereq[]>([])
  const [prereqsChecked, setPrereqsChecked] = useState(false)
  // Mini-barra de progreso: "X/Y contenidos del tema completados".
  // null = no calculado todavía; {completed, total} = dato disponible.
  const [topicProgress, setTopicProgress] = useState<{ completed: number; total: number; topic: string } | null>(null)

  useEffect(() => {
    async function load() {
      if (!contentId) return
      setLoading(true)
      setError(null)
      setPrereqsChecked(false)
      setMissingPrereqs([])
      setTopicProgress(null)
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
          // Cargas en paralelo: prerrequisitos faltantes + progreso por tema.
          const [masteredResp, progressResp] = await Promise.all([
            supabase
              .from('mastered_concepts')
              .select('concept_id')
              .eq('user_id', user.id),
            supabase
              .from('progress')
              .select('content_id, completed')
              .eq('user_id', user.id),
          ])
          const masteredIds = (masteredResp.data ?? []).map(
            (r) => r.concept_id as string,
          )
          try {
            const resp = await getMissingPrereqs(contentId, masteredIds)
            setMissingPrereqs(resp.missing)
          } catch {
            /* sin aviso si falla */
          } finally {
            setPrereqsChecked(true)
          }
          // Mini-barra: contamos contenidos del mismo topic que el
          // usuario ya completó. Si el catálogo no carga, no rompemos.
          try {
            const catRes = await fetch(
              `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/catalog`,
            )
            if (catRes.ok && data.topic) {
              const catalog = (await catRes.json()) as Array<{
                content_id: string
                topic: string
              }>
              const sameTopic = catalog.filter((c) => c.topic === data.topic)
              const completedIds = new Set(
                (progressResp.data ?? [])
                  .filter((r) => r.completed)
                  .map((r) => r.content_id as string),
              )
              const completedCount = sameTopic.filter((c) =>
                completedIds.has(c.content_id),
              ).length
              setTopicProgress({
                completed: completedCount,
                total: sameTopic.length,
                topic: data.topic,
              })
            }
          } catch {
            /* sin barra si falla */
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar el contenido')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [contentId, user])

  function selectAnswer(qi: number, oi: number) {
    if (quizSubmitted) return
    setAnswers((prev) => ({ ...prev, [qi]: oi }))
  }

  function submitQuiz() {
    if (!content?.quiz) return
    const newResults: Record<number, boolean> = {}
    content.quiz.forEach((q, qi) => {
      newResults[qi] = answers[qi] === q.correct_index
    })
    setResults(newResults)
    setQuizSubmitted(true)
    // Si no se aciertan todas, registra el fallo (score < 0.5, no relevante)
    const allCorrect = Object.values(newResults).every(Boolean)
    if (!allCorrect && user && contentId) {
      registerInteraction({
        userId: user.id,
        contentId,
        event: 'quiz_failed',
      }).catch(() => {
        /* no bloquea la corrección del quiz */
      })
    }
  }

  // Permite al usuario reintentar el quiz tras fallarlo: limpia respuestas,
  // resultados y el flag de submitted, y restaura las opciones a su estado
  // inicial. El contenido debe poder leerse y reevaluarse sin recargar.
  function resetQuiz() {
    setAnswers({})
    setResults({})
    setQuizSubmitted(false)
  }

  const correctCount = Object.values(results).filter(Boolean).length
  const quizTotal = content?.quiz?.length ?? 0

  async function handleQuizPassed() {
    if (!user || !content?.quiz) return
    setSaving(true)
    try {
      const concepts = content.quiz
        .map((q) => q.concept_id)
        .filter((c): c is string => Boolean(c))
      if (concepts.length > 0) {
        const { error: masteryError } = await supabase.from('mastered_concepts').upsert(
          concepts.map((cid) => ({ user_id: user.id, concept_id: cid })),
        )
        if (masteryError) throw masteryError
      }
      const { error: progError } = await supabase.from('progress').upsert({
        user_id: user.id,
        content_id: contentId,
        completed: true,
        updated_at: new Date().toISOString(),
      })
      if (progError) throw progError
      // Registra el evento de dominio (score >= 0.5, relevante)
      await registerInteraction({
        userId: user.id,
        contentId: contentId ?? '',
        event: 'quiz_passed',
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar el progreso')
    } finally {
      setSaving(false)
    }
  }

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

      {/* Resumen (tldr): sticky en md+ para que el usuario vea el resumen del
          contenido mientras hace scroll. El top-16 evita solapar el navbar. */}
      {content.tldr && (
        <div className="mb-6 rounded-2xl border border-accent/20 bg-accent-light p-5 sm:p-6 md:sticky md:top-16 md:z-10">
          <div className="mb-2 flex items-center gap-2">
            <IconSparkles size={18} className="text-accent" />
            <h2 className="text-sm font-semibold text-accent">En resumen</h2>
          </div>
          <p className="break-words text-sm leading-relaxed text-text">{content.tldr}</p>
        </div>
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

      {/* Quiz de evaluación formativa */}
      {content.quiz && content.quiz.length > 0 && (
        <div className="card p-6 sm:p-8">
          <h2 className="text-sm font-semibold text-text">Comprueba lo aprendido</h2>
          <p className="mb-5 text-xs text-muted">
            Responde las preguntas para confirmar que dominas los conceptos.
          </p>

          <div className="space-y-6">
            {content.quiz.map((q, qi) => (
              <QuizBlock
                key={qi}
                question={q}
                index={qi}
                selected={answers[qi]}
                result={results[qi]}
                submitted={quizSubmitted}
                onSelect={selectAnswer}
              />
            ))}
          </div>

          {!quizSubmitted ? (
            <button
              onClick={submitQuiz}
              disabled={Object.keys(answers).length < quizTotal}
              className="btn btn-primary mt-6"
            >
              Corregir
            </button>
          ) : (
            <div className="mt-6 rounded-xl bg-background p-5">
              <p className="text-sm font-semibold text-text">
                Has acertado {correctCount} de {quizTotal}
              </p>
              {correctCount === quizTotal ? (
                <div className="mt-2">
                  <p className="text-sm text-success">
                    ¡Perfecto! Dominas los conceptos de este contenido.
                  </p>
                  <button
                    onClick={handleQuizPassed}
                    disabled={saving}
                    className="btn btn-success mt-3"
                  >
                    <IconCheck size={16} />
                    {saving ? 'Guardando…' : 'Registrar mi progreso'}
                  </button>
                </div>
              ) : (
                <div className="mt-2">
                  <p className="text-sm text-amber-700">
                    Has acertado {correctCount} de {quizTotal}. Repasa el contenido e
                    inténtalo de nuevo para dominar los conceptos.
                  </p>
                  <button
                    type="button"
                    onClick={resetQuiz}
                    className="btn btn-outline mt-3 !px-3 !py-2"
                  >
                    Volver a intentarlo
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {content.url && (
        <p className="mt-6 text-sm text-muted">
          Fuente:{' '}
          <a
            href={content.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-secondary hover:underline"
          >
            {content.url}
          </a>
        </p>
      )}

      {/* Enlaces relacionados (raíz del payload) */}
      {content.links && content.links.length > 0 && (
        <div className="mt-6 card p-5">
          <h3 className="mb-3 text-sm font-semibold text-text">Enlaces relacionados</h3>
          <ul className="space-y-1.5">
            {content.links
              .filter((l) => l.href)
              .map((l, i) => (
                <li key={i} className="text-sm">
                  <a
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-secondary underline-offset-2 hover:underline"
                  >
                    {l.text || l.href}
                  </a>
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* Mini-barra de progreso por tema (punto 2.3 del plan UX).
          Solo visible cuando hay datos y en md+. No aparece en móvil
          para no solapar la barra de navegación inferior. */}
      {topicProgress && topicProgress.total > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 hidden justify-center px-4 pb-4 md:flex">
          <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-full border border-border bg-surface/95 px-4 py-2.5 shadow-lg backdrop-blur">
            <IconBook size={16} className="shrink-0 text-secondary" />
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted">
                <span className="truncate font-medium text-text">{topicProgress.topic}</span>
                <span className="shrink-0">
                  {topicProgress.completed} / {topicProgress.total}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-background">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-300"
                  style={{
                    width: `${Math.round(
                      (topicProgress.completed / topicProgress.total) * 100,
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function QuizBlock({
  question,
  index,
  selected,
  result,
  submitted,
  onSelect,
}: {
  question: QuizQuestion
  index: number
  selected?: number
  result?: boolean
  submitted: boolean
  onSelect: (qi: number, oi: number) => void
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-text">{question.question}</p>
      <div className="space-y-1.5">
        {question.options.map((opt, oi) => {
          let cls = 'border-border hover:bg-background'
          if (submitted) {
            if (oi === question.correct_index) cls = 'border-success bg-success-light'
            else if (oi === selected) cls = 'border-error bg-error-light'
            else cls = 'border-border opacity-60'
          } else if (selected === oi) {
            cls = 'border-secondary bg-secondary-light'
          }
          return (
            <label
              key={oi}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-2.5 text-sm transition ${cls}`}
            >
              <input
                type="radio"
                name={`quiz-${index}`}
                checked={selected === oi}
                onChange={() => onSelect(index, oi)}
                disabled={submitted}
                className="accent-secondary"
              />
              {opt}
            </label>
          )
        })}
      </div>
      {submitted && result === false && question.explanation && (
        <p className="mt-1.5 text-xs text-muted">{question.explanation}</p>
      )}
    </div>
  )
}
