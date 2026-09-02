import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { IconArrowLeft, IconCheck, IconMessageSquare } from '../components/Icons'

// Cuestionario de percepción del recomendador (Likert 1-5 + texto libre).
// Sirve para la memoria del TFM: datos cualitativos sobre cómo perciben
// los usuarios reales las recomendaciones. Una respuesta por usuario.
// Acceso desde /cuestionario (perfil) cuando el usuario haya interactuado
// con al menos un contenido (hay progress registrado).

interface FeedbackRow {
  user_id: string
  q_relevance: number | null
  q_pedagogy: number | null
  q_explanation: number | null
  q_satisfaction: number | null
  free_text: string | null
  submitted_at: string
}

const QUESTIONS = [
  {
    key: 'q_relevance',
    label:
      'Las recomendaciones que recibes son útiles para tus objetivos financieros.',
  },
  {
    key: 'q_pedagogy',
    label:
      'Las recomendaciones respetan tu nivel y los conceptos que ya dominas.',
  },
  {
    key: 'q_explanation',
    label: 'La explicación de por qué te recomendamos cada contenido tiene sentido.',
  },
  {
    key: 'q_satisfaction',
    label: '¿Recomendarías esta plataforma a otra persona?',
  },
] as const

type QuestionKey = (typeof QUESTIONS)[number]['key']

export default function Feedback() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // `saved` significa 'el upsert más reciente terminó con éxito'. Lo
  // marcamos tanto al cargar una respuesta previa como al enviar una
  // nueva. Para distinguir, usamos `justSaved` (true solo tras el
  // envío en esta sesión).
  const [saved, setSaved] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // `existing` es la última respuesta guardada en BD (carga inicial o
  // tras upsert). Su `submitted_at` se muestra como 'Última respuesta'.
  const [existing, setExisting] = useState<FeedbackRow | null>(null)
  // `lastSavedAt` guarda la marca temporal del último guardado exitoso
  // (sea en esta sesión o en una carga inicial con respuesta previa).
  // Es robusto al orden de setState: si por algún motivo existing
  // no se actualiza primero, este siempre refleja la verdad.
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<QuestionKey, number | null>>({
    q_relevance: null,
    q_pedagogy: null,
    q_explanation: null,
    q_satisfaction: null,
  })
  const [freeText, setFreeText] = useState('')

  useEffect(() => {
    if (!user) return
    setLoading(true)
    supabase
      .from('feedback_responses')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error: dbErr }) => {
        if (dbErr) {
          setError(dbErr.message)
        } else if (data) {
          const row = data as FeedbackRow
          setExisting(row)
          setLastSavedAt(row.submitted_at)
          setAnswers({
            q_relevance: row.q_relevance,
            q_pedagogy: row.q_pedagogy,
            q_explanation: row.q_explanation,
            q_satisfaction: row.q_satisfaction,
          })
          setFreeText(row.free_text ?? '')
          setSaved(true)
        }
      })
      .then(
        () => setLoading(false),
        () => setLoading(false),
      )
  }, [user])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setError(null)
    // Validamos que las 4 preguntas Likert tengan valor.
    const allFilled = QUESTIONS.every((q) => answers[q.key] !== null)
    if (!allFilled) {
      setError('Por favor responde todas las preguntas Likert (1-5).')
      return
    }
    setSaving(true)
    try {
      // Forzamos re-leer la sesión (mismo patrón que en upserts críticos).
      const { data: sess } = await supabase.auth.getSession()
      const sessionUser = sess.session?.user
      if (!sessionUser) {
        throw new Error(
          'Tu sesión ha expirado. Recarga la página y vuelve a intentarlo.',
        )
      }
      const uid = sessionUser.id
      const submittedAtIso = new Date().toISOString()
      const payload = {
        user_id: uid,
        q_relevance: answers.q_relevance,
        q_pedagogy: answers.q_pedagogy,
        q_explanation: answers.q_explanation,
        q_satisfaction: answers.q_satisfaction,
        free_text: freeText.trim() || null,
        submitted_at: submittedAtIso,
      }
      const { data, error: dbError } = await supabase
        .from('feedback_responses')
        .upsert(payload)
        .select()
        .single()
      if (dbError) throw dbError
      // Tras el upsert exitoso, actualizamos la fila mostrada con los
      // datos que devuelve Supabase (incluye submitted_at real, que puede
      // diferir del que mandamos por milisegundos). Esto soluciona el
      // bug en el que 'Última respuesta' no se actualizaba tras enviar.
      if (data) {
        const row = data as FeedbackRow
        setExisting(row)
        setLastSavedAt(row.submitted_at)
      }
      setJustSaved(true)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar el feedback')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center text-muted">
        Cargando…
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-12">
      <button
        onClick={() => navigate('/cuestionario')}
        className="btn btn-ghost mb-6 !px-3 !py-2"
      >
        <IconArrowLeft size={16} />
        Volver al perfil
      </button>

      <div className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <IconMessageSquare size={20} className="text-secondary" />
          <h1 className="text-xl font-bold tracking-tight text-text sm:text-2xl">
            {saved ? 'Tu opinión sobre las recomendaciones' : 'Cuéntanos qué te parecen las recomendaciones'}
          </h1>
        </div>
        <p className="text-sm text-muted">
          Tus respuestas son anónimas para el equipo y nos ayudan a mejorar el
          sistema de recomendación del TFM. Tarda menos de 2 minutos.
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-error-light px-4 py-3 text-sm text-error">{error}</p>
      )}

      <form onSubmit={handleSubmit} className="card space-y-8 p-6 sm:p-8">
        {QUESTIONS.map((q) => (
          <div key={q.key}>
            <p className="mb-3 text-sm font-medium text-text">{q.label}</p>
            <LikertScale
              value={answers[q.key]}
              onChange={(v) => setAnswers((prev) => ({ ...prev, [q.key]: v }))}
              disabled={saving}
            />
          </div>
        ))}

        <div>
          <label htmlFor="free_text" className="mb-2 block text-sm font-medium text-text">
            ¿Qué mejorarías o añadirías? (opcional)
          </label>
          <textarea
            id="free_text"
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            disabled={saving}
            maxLength={1000}
            rows={4}
            className="input resize-y"
            placeholder="Escribe libremente lo que quieras compartir..."
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {lastSavedAt ? (
            <p className="flex items-center gap-2 text-xs text-muted">
              <IconCheck size={14} className="text-success" />
              {justSaved ? 'Enviado a las' : 'Última respuesta:'}{' '}
              {formatTimestamp(lastSavedAt)}
            </p>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={saving || justSaved}
            className={
              justSaved
                ? 'btn btn-success-outline !px-5 !py-2.5'
                : 'btn btn-primary !px-5 !py-2.5'
            }
          >
            {saving ? (
              <span className="inline-flex items-center gap-2">
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <circle cx="12" cy="12" r="9" strokeOpacity="0.25" />
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Enviando…
              </span>
            ) : justSaved && lastSavedAt ? (
              <span className="inline-flex items-center gap-2">
                <IconCheck size={16} />
                Enviado a las {formatTime(lastSavedAt)} ·{' '}
                {formatDate(lastSavedAt)}
              </span>
            ) : existing ? (
              'Editar mi respuesta'
            ) : (
              'Enviar mis respuestas'
            )}
          </button>
        </div>
      </form>

      {saved && (
        <p className="mt-6 text-center text-sm text-muted">
          <Link to="/cuestionario" className="text-secondary hover:underline">
            Volver al perfil
          </Link>
        </p>
      )}
    </div>
  )
}

// Escala Likert 1-5 con etiquetas en los extremos. El centro (3) es neutro.
function LikertScale({
  value,
  onChange,
  disabled,
}: {
  value: number | null
  onChange: (v: number) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex flex-1 items-center justify-between gap-1 sm:justify-center">
        {[1, 2, 3, 4, 5].map((n) => {
          const selected = value === n
          return (
            <label
              key={n}
              className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border text-sm font-semibold transition ${
                selected
                  ? 'border-secondary bg-secondary-light text-secondary'
                  : 'border-border bg-background text-muted hover:border-secondary/50 hover:text-text'
              } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <input
                type="radio"
                name={`likert-${n}`}
                checked={selected}
                onChange={() => onChange(n)}
                disabled={disabled}
                className="sr-only"
                aria-label={`${n} de 5`}
              />
              {n}
            </label>
          )
        })}
      </div>
      <div className="flex justify-between text-xs text-muted sm:w-24 sm:flex-col sm:items-start sm:justify-center">
        <span>1 · muy en desacuerdo</span>
        <span>5 · muy de acuerdo</span>
      </div>
    </div>
  )
}

// Formatean un ISO string (p. ej. "2026-09-02T20:35:24.054Z") a partes
// separadas. Uso es-ES/dd/MM/yyyy para fecha y HH:MM 24h para hora.
function formatTimestamp(iso: string): string {
  return `${formatDate(iso)} · ${formatTime(iso)}`
}
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
