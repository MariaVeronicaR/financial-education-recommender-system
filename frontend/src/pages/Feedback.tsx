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
    help: 'Mide la relevancia percibida respecto a learning_goal.',
  },
  {
    key: 'q_pedagogy',
    label:
      'Las recomendaciones respetan tu nivel y los conceptos que ya dominas.',
    help: 'Mide el efecto del filtro pedagógico.',
  },
  {
    key: 'q_explanation',
    label: 'La explicación de por qué te recomendamos cada contenido tiene sentido.',
    help: 'Mide la calidad del grafo.explanation().',
  },
  {
    key: 'q_satisfaction',
    label: '¿Recomendarías esta plataforma a otra persona?',
    help: 'Pregunta tipo NPS — dato más limpio de satisfacción.',
  },
] as const

type QuestionKey = (typeof QUESTIONS)[number]['key']

export default function Feedback() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existing, setExisting] = useState<FeedbackRow | null>(null)
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
      const payload = {
        user_id: uid,
        q_relevance: answers.q_relevance,
        q_pedagogy: answers.q_pedagogy,
        q_explanation: answers.q_explanation,
        q_satisfaction: answers.q_satisfaction,
        free_text: freeText.trim() || null,
        submitted_at: new Date().toISOString(),
      }
      const { error: dbError } = await supabase
        .from('feedback_responses')
        .upsert(payload)
      if (dbError) throw dbError
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
            <p className="mb-2 text-sm font-medium text-text">{q.label}</p>
            <p className="mb-3 text-xs text-muted">{q.help}</p>
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
          {saved && existing ? (
            <p className="flex items-center gap-2 text-xs text-muted">
              <IconCheck size={14} className="text-success" />
              Última respuesta:{' '}
              {new Date(existing.submitted_at).toLocaleDateString('es-ES', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary !px-5 !py-2.5"
          >
            {saving
              ? 'Guardando…'
              : existing
                ? 'Actualizar mi respuesta'
                : 'Enviar mis respuestas'}
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
