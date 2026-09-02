import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getContentDetail, type ContentDetail, type QuizQuestion } from '../lib/api'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { registerInteraction } from '../lib/events'
import { IconArrowLeft, IconCheck, IconSparkles } from '../components/Icons'

// Pantalla dedicada al quiz de un contenido. Ruta: /contenido/:contentId/quiz.
// El usuario llega aquí desde el botón sticky 'Ir al quiz' que aparece al
// final del scroll en la página de contenido. Puede volver al artículo
// con el botón 'Volver al contenido' (que restaura el scroll anterior).
//
// Estado "ya completado": si el contenido ya está marcado progress.completed,
// la pantalla muestra un resumen con "Ya dominas estos conceptos" en vez
// de permitir responder el quiz otra vez (decisión del producto).

export default function Quiz() {
  const { contentId } = useParams<{ contentId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [content, setContent] = useState<ContentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [alreadyCompleted, setAlreadyCompleted] = useState(false)

  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [results, setResults] = useState<Record<number, boolean>>({})
  const [quizSubmitted, setQuizSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      if (!contentId) return
      setLoading(true)
      setError(null)
      try {
        const data = await getContentDetail(contentId)
        setContent(data)
        if (user) {
          const { data: progResp } = await supabase
            .from('progress')
            .select('content_id, completed')
            .eq('user_id', user.id)
            .eq('content_id', contentId)
            .maybeSingle()
          if (progResp?.completed) setAlreadyCompleted(true)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar el quiz')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [contentId, user?.id])

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
    const allCorrect = Object.values(newResults).every(Boolean)
    if (!allCorrect && user && contentId) {
      registerInteraction({
        userId: user.id,
        contentId,
        event: 'quiz_failed',
      }).catch(() => {})
    }
  }

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
      // Forzamos re-leer la sesión para evitar el 403 del RLS.
      const { data: sess } = await supabase.auth.getSession()
      const sessionUser = sess.session?.user
      if (!sessionUser) {
        throw new Error(
          'Tu sesión ha expirado. Recarga la página y vuelve a iniciar sesión.',
        )
      }
      const uid = sessionUser.id
      // Deduplicamos: varios quizzes sintéticos tienen varias preguntas con el
      // mismo concept_id (es pedagógicamente normal: dos preguntas pueden
      // evaluar la misma competencia). Pero upsert requiere constraint
      // única, así que si enviamos un array con la misma (user_id,
      // concept_id) dos veces, Postgres devuelve 'ON CONFLICT DO UPDATE
      // cannot affect row a second time' (500).
      const concepts = Array.from(
        new Set(
          content.quiz
            .map((q) => q.concept_id)
            .filter((c): c is string => Boolean(c)),
        ),
      )
      if (concepts.length > 0) {
        const { error: masteryError } = await supabase.from('mastered_concepts').upsert(
          concepts.map((cid) => ({ user_id: uid, concept_id: cid })),
        )
        if (masteryError) throw masteryError
      }
      const { error: progError } = await supabase.from('progress').upsert({
        user_id: uid,
        content_id: contentId,
        completed: true,
        updated_at: new Date().toISOString(),
      })
      if (progError) throw progError
      await registerInteraction({
        userId: uid,
        contentId: contentId ?? '',
        event: 'quiz_passed',
      })
      // Marcamos localmente para que la UI cambie a estado completado.
      setAlreadyCompleted(true)
      setQuizSubmitted(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar el progreso')
    } finally {
      setSaving(false)
    }
  }

  // Cuando el usuario aprueba el quiz (correctCount === quizTotal),
  // registramos el progreso automáticamente sin necesidad de pulsar ningún
  // botón. El `useEffect` se dispara cuando se cumplen TODAS las
  // condiciones: el quiz fue enviado, todas las respuestas son
  // correctas, no se ha guardado antes y no estamos ya guardando.
  // Mientras `saving=true` la UI muestra 'Guardando tu progreso...' para
  // dar feedback visual; después el estado pasa a 'ya completado'.
  useEffect(() => {
    if (
      quizSubmitted &&
      content?.quiz &&
      Object.keys(results).length === content.quiz.length &&
      Object.values(results).every(Boolean) &&
      !saving &&
      !alreadyCompleted
    ) {
      void handleQuizPassed()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizSubmitted, results, saving, alreadyCompleted])

  // Botón 'Volver al contenido': navega a /contenido/:id. Como el backend no
  // restaura scroll automáticamente, usamos sessionStorage para guardar la
  // posición en la página de contenido y restaurarla al volver.
  function handleBack() {
    if (contentId) {
      const scrollKey = `scrollY:${contentId}`
      const saved = sessionStorage.getItem(scrollKey)
      // Marcamos un flag y guardamos scrollY antes de salir (si lo tenemos).
      sessionStorage.setItem('restoreScrollFlag', '1')
      navigate(`/contenido/${contentId}`)
      // Restauramos scroll tras un breve timeout (necesario porque React
      // Router navega asíncronamente y necesitamos que el DOM ya exista).
      if (saved) {
        setTimeout(() => {
          window.scrollTo({ top: Number(saved), behavior: 'instant' as ScrollBehavior })
          sessionStorage.removeItem(scrollKey)
          sessionStorage.removeItem('restoreScrollFlag')
        }, 50)
      }
    } else {
      navigate(-1)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center text-muted">
        Cargando quiz…
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <p className="rounded-lg bg-error-light px-4 py-3 text-sm text-error">{error}</p>
        <button onClick={handleBack} className="btn btn-outline mt-4 !px-3 !py-2">
          <IconArrowLeft size={16} />
          Volver al contenido
        </button>
      </div>
    )
  }

  // Sin quiz para este contenido
  if (!content?.quiz || content.quiz.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-12">
        <button onClick={handleBack} className="btn btn-ghost mb-4 !px-3 !py-2">
          <IconArrowLeft size={16} />
          Volver al contenido
        </button>
        <div className="card p-10 text-center">
          <p className="text-muted">Este contenido no tiene cuestionario.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-12">
      <button onClick={handleBack} className="btn btn-ghost mb-4 !px-3 !py-2">
        <IconArrowLeft size={16} />
        Volver al contenido
      </button>

      <h1 className="mb-1 break-words text-2xl font-bold tracking-tight text-text sm:text-3xl">
        {content.title ?? contentId}
      </h1>
      <p className="mb-6 text-sm text-muted">Cuestionario de evaluación formativa</p>

      {alreadyCompleted ? (
        <div className="card p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success-light text-success">
            <IconCheck size={28} />
          </div>
          <h2 className="mb-2 text-lg font-semibold text-text">
            Ya completaste este cuestionario
          </h2>
          <p className="mx-auto max-w-md text-sm text-muted">
            Los conceptos quedaron registrados como dominados. No necesitas
            responder de nuevo; vuelve al contenido si quieres repasarlo.
          </p>
          <button
            onClick={handleBack}
            className="btn btn-primary mt-6 !px-5 !py-2.5"
          >
            <IconArrowLeft size={16} />
            Volver al contenido
          </button>
        </div>
      ) : (
        <>
          {/* Resumen (tldr) si existe, para que el usuario recuerde contexto */}
          {content.tldr && (
            <div className="mb-6 rounded-2xl border border-accent/20 bg-accent-light p-4 sm:p-5">
              <div className="mb-2 flex items-center gap-2">
                <IconSparkles size={16} className="text-accent" />
                <span className="text-xs font-semibold uppercase tracking-wide text-accent">
                  Recordatorio
                </span>
              </div>
              <p className="text-sm leading-relaxed text-text">{content.tldr}</p>
            </div>
          )}

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
                    {saving ? (
                      <div className="flex items-center gap-2 text-sm text-muted">
                        <svg
                          className="h-4 w-4 animate-spin text-success"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                        >
                          <circle
                            cx="12"
                            cy="12"
                            r="9"
                            strokeOpacity="0.25"
                          />
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                        <span>Guardando tu progreso…</span>
                      </div>
                    ) : (
                      <p className="text-sm text-success">
                        ¡Perfecto! Dominas los conceptos de este contenido.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mt-2">
                    <p className="text-sm text-amber-700">
                      Has acertado {correctCount} de {quizTotal}. Vuelve al
                      contenido para repasar lo que no has acertado e inténtalo
                      de nuevo.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={resetQuiz}
                        className="btn btn-outline !px-3 !py-2"
                      >
                        Volver a intentarlo
                      </button>
                      <button
                        type="button"
                        onClick={handleBack}
                        className="btn btn-ghost !px-3 !py-2"
                      >
                        Volver al contenido
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
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
            else if (selected === oi) cls = 'border-error bg-error-light'
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
