import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { getProfileFromSupabase, type ProfileRow } from '../lib/profile'
import type { UserProfile } from '../lib/api'
import { IconUser } from '../components/Icons'

// Temas de interés (alineados con los topics del catálogo)
const TEMAS = [
  'planificación',
  'ahorro',
  'deuda',
  'inversión',
  'riesgo',
  'diversificación',
  'inflación',
  'interés',
  'fraude',
  'mercado',
]

// Las "Big Three" de Lusardi y Mitchell (borrador §2.1.2): evaluación objetiva
// de alfabetización financiera. Cada pregunta tiene su índice de respuesta
// correcta.
const BIG_THREE = [
  {
    id: 'interes_compuesto',
    question:
      'Si tienes 100€ a un interés del 2% anual, ¿cuánto tendrás al cabo de 5 años?',
    options: ['Menos de 102€', 'Exactamente 102€', 'Más de 102€', 'No lo sé'],
    correct: 2, // Más de 102€
  },
  {
    id: 'inflacion',
    question:
      'Si la tasa de interés de una cuenta de ahorro es del 1% anual y la inflación del 2%, ¿puedes comprar más, lo mismo o menos dentro de un año?',
    options: ['Más', 'Lo mismo', 'Menos', 'No lo sé'],
    correct: 2, // Menos
  },
  {
    id: 'diversificacion',
    question:
      '¿Es cierto que una cartera de inversión con un solo activo es generalmente menos riesgosa que una cartera con múltiples activos?',
    options: ['Sí, es cierto', 'No, es falso', 'No lo sé'],
    correct: 1, // No, es falso
  },
]

const EDUCATION_LABELS: Record<string, string> = {
  primaria: 'Primaria',
  secundaria: 'Secundaria',
  bachillerato: 'Bachillerato',
  universidad: 'Universidad',
  posgrado: 'Posgrado',
}

const EMPLOYMENT_LABELS: Record<string, string> = {
  empleado: 'Empleado/a',
  estudiante: 'Estudiante',
  autónomo: 'Autónomo/a',
  desempleado: 'Desempleado/a',
}

const LEVEL_LABELS: Record<string, string> = {
  bajo: 'Básico',
  medio: 'Intermedio',
  alto: 'Avanzado',
}

export default function Cuestionario() {
  const { user } = useAuth()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [editing, setEditing] = useState(false)

  const [fullName, setFullName] = useState('')
  const [age, setAge] = useState('')
  const [education, setEducation] = useState('')
  const [employment, setEmployment] = useState('')
  const [learningGoal, setLearningGoal] = useState('')
  const [knowledge, setKnowledge] = useState('')
  const [interests, setInterests] = useState<string[]>([])
  const [bigThree, setBigThree] = useState<number[]>([-1, -1, -1])

  const isEditing = !!profile
  const steps = isEditing
    ? [
        { title: 'Sobre ti', subtitle: 'Tus datos personales' },
        { title: 'Tus intereses', subtitle: '¿Qué temas te gustaría aprender?' },
      ]
    : [
        { title: 'Sobre ti', subtitle: 'Unos datos básicos para personalizar tu experiencia' },
        { title: 'Tu nivel', subtitle: '¿Cómo te sientes con las finanzas personales?' },
        { title: 'Evaluación', subtitle: 'Tres preguntas para medir tu nivel real' },
        { title: 'Tus intereses', subtitle: '¿Qué temas te gustaría aprender?' },
      ]

  useEffect(() => {
    async function load() {
      if (!user) return
      setLoading(true)
      const p = await getProfileFromSupabase(user.id)
      setProfile(p)
      if (p) {
        setFullName(p.full_name ?? '')
        setAge(p.age != null ? String(p.age) : '')
        setEducation(p.education_level ?? '')
        setEmployment(p.employment_status ?? '')
        setLearningGoal(p.learning_goal ?? '')
        setKnowledge(p.knowledge_level ?? '')
        setInterests(
          Object.keys(p.interests ?? {}).filter((t) => (p.interests ?? {})[t] > 0),
        )
        if (p.big_three && p.big_three.length === 3) {
          setBigThree(p.big_three)
        }
      }
      setLoading(false)
    }
    load()
  }, [user])

  function toggleInterest(tema: string) {
    setInterests((prev) =>
      prev.includes(tema) ? prev.filter((t) => t !== tema) : [...prev, tema],
    )
  }

  function estimatedLevel(): string {
    const correctas = bigThree.filter((a, i) => a === BIG_THREE[i].correct).length
    if (correctas >= 3) return 'alto'
    if (correctas === 2) return 'medio'
    return 'bajo'
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      if (!user) throw new Error('Debes iniciar sesión')

      const interestsMap: Record<string, number> = {}
      interests.forEach((t) => (interestsMap[t] = 1.0))

      const profileData: UserProfile = {
        user_id: user.id,
        full_name: fullName || null,
        age: age ? Number(age) : null,
        education_level: education || null,
        employment_status: employment || null,
        learning_goal: learningGoal || null,
        knowledge_level: estimatedLevel(),
        interests: interestsMap,
      }

      const { error: dbError } = await supabase.from('profiles').upsert({
        user_id: user.id,
        full_name: profileData.full_name,
        age: profileData.age,
        education_level: profileData.education_level,
        employment_status: profileData.employment_status,
        learning_goal: profileData.learning_goal,
        knowledge_level: profileData.knowledge_level,
        interests: profileData.interests,
        big_three: bigThree,
        updated_at: new Date().toISOString(),
      })
      if (dbError) throw dbError

      const p = await getProfileFromSupabase(user.id)
      setProfile(p)
      setEditing(false)
      setStep(0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar el perfil')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center text-muted">
        Cargando tu perfil…
      </div>
    )
  }

  if (profile && !editing) {
    return <ResumenPerfil profile={profile} onEdit={() => setEditing(true)} />
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-12">
      <div className="mb-8">
        <div className="mb-3 flex gap-1.5">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step ? 'bg-accent' : 'bg-border'
              }`}
            />
          ))}
        </div>
        <h1 className="text-xl font-bold tracking-tight text-text sm:text-2xl">{steps[step].title}</h1>
        <p className="text-muted">{steps[step].subtitle}</p>
      </div>

      <div className="card p-5 sm:p-8">
        {step === 0 && (
          <div className="space-y-5">
            <div>
              <label className="label" htmlFor="fullName">Nombre</label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="input"
                placeholder="Tu nombre"
              />
            </div>
            <div>
              <label className="label" htmlFor="age">Edad</label>
              <input
                id="age"
                type="number"
                min={18}
                max={34}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="input"
                placeholder="18–34"
              />
            </div>
            <div>
              <label className="label" htmlFor="education">Nivel educativo</label>
              <select
                id="education"
                value={education}
                onChange={(e) => setEducation(e.target.value)}
                className="input"
              >
                <option value="">Selecciona…</option>
                <option value="primaria">Primaria</option>
                <option value="secundaria">Secundaria</option>
                <option value="bachillerato">Bachillerato</option>
                <option value="universidad">Universidad</option>
                <option value="posgrado">Posgrado</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="employment">Situación laboral</label>
              <select
                id="employment"
                value={employment}
                onChange={(e) => setEmployment(e.target.value)}
                className="input"
              >
                <option value="">Selecciona…</option>
                <option value="empleado">Empleado/a</option>
                <option value="estudiante">Estudiante</option>
                <option value="autónomo">Autónomo/a</option>
                <option value="desempleado">Desempleado/a</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="learningGoal">¿Cuál es tu principal objetivo financiero?</label>
              <select
                id="learningGoal"
                value={learningGoal}
                onChange={(e) => setLearningGoal(e.target.value)}
                className="input"
              >
                <option value="">Selecciona…</option>
                <option value="ahorrar">Ahorrar</option>
                <option value="presupuestar">Llevar un presupuesto</option>
                <option value="planificar finanzas">Planificar mis finanzas</option>
                <option value="prepararse para invertir">Prepararme para invertir</option>
                <option value="entender deuda">Entender la deuda</option>
              </select>
            </div>
          </div>
        )}

        {!isEditing && step === 1 && (
          <div>
            <label className="label">¿Cómo valoras tu nivel de conocimientos financieros?</label>
            <div className="space-y-2">
              {[
                { value: 'bajo', label: 'Básico — apenas he empezado' },
                { value: 'medio', label: 'Intermedio — conozco lo esencial' },
                { value: 'alto', label: 'Avanzado — manejo conceptos de inversión' },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition ${
                    knowledge === opt.value
                      ? 'border-secondary bg-secondary-light'
                      : 'border-border hover:bg-background'
                  }`}
                >
                  <input
                    type="radio"
                    name="knowledge"
                    value={opt.value}
                    checked={knowledge === opt.value}
                    onChange={() => setKnowledge(opt.value)}
                    className="accent-secondary"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        )}

        {!isEditing && step === 2 && (
          <div className="space-y-6">
            <p className="text-sm text-muted">
              Responde estas tres preguntas para medir tu nivel real de conocimientos
              financieros. No hay nota: sirven para recomendarte contenidos adecuados.
            </p>
            {BIG_THREE.map((q, qi) => (
              <div key={q.id}>
                <p className="mb-2 text-sm font-medium text-text">{q.question}</p>
                <div className="space-y-1.5">
                  {q.options.map((opt, oi) => {
                    const isSelected = bigThree[qi] === oi
                    return (
                      <label
                        key={oi}
                        className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-2.5 text-sm transition ${
                          isSelected
                            ? 'border-secondary bg-secondary-light'
                            : 'border-border hover:bg-background'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`bigthree-${qi}`}
                          checked={isSelected}
                          onChange={() =>
                            setBigThree((prev) => {
                              const next = [...prev]
                              next[qi] = oi
                              return next
                            })
                          }
                          className="accent-secondary"
                        />
                        {opt}
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {((isEditing && step === 1) || (!isEditing && step === 3)) && (
          <div>
            <label className="label">¿Qué temas te interesan? (elige los que quieras)</label>
            <div className="flex flex-wrap gap-2">
              {TEMAS.map((tema) => (
                <button
                  key={tema}
                  type="button"
                  onClick={() => toggleInterest(tema)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    interests.includes(tema)
                      ? 'bg-primary text-white'
                      : 'bg-background text-muted hover:bg-border'
                  }`}
                >
                  {tema}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-error-light px-3 py-2 text-sm text-error">{error}</p>
        )}

        <div className="mt-8 flex justify-between">
          {step > 0 && (
            <button onClick={() => setStep(step - 1)} className="btn btn-outline">
              Atrás
            </button>
          )}
          {step < steps.length - 1 ? (
            <button onClick={() => setStep(step + 1)} className="btn btn-primary ml-auto">
              Siguiente
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn btn-primary ml-auto"
            >
              {saving ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Ver mis recomendaciones'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Vista de resumen del perfil (cuando ya hay datos guardados)
function ResumenPerfil({ profile, onEdit }: { profile: ProfileRow; onEdit: () => void }) {
  const interests = Object.keys(profile.interests ?? {}).filter(
    (t) => (profile.interests ?? {})[t] > 0,
  )
  const correctas = (profile.big_three ?? []).filter(
    (a, i) => a === BIG_THREE[i].correct,
  ).length

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-12">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text sm:text-2xl">Tu perfil</h1>
          <p className="text-muted">Así te conocemos para recomendarte contenidos</p>
        </div>
        <button onClick={onEdit} className="btn btn-primary self-start sm:self-auto">
          Editar perfil
        </button>
      </div>

      <div className="space-y-4">
        {/* Datos personales */}
        <div className="card p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <IconUser size={18} className="text-secondary" />
            <h2 className="text-sm font-semibold text-text">Datos personales</h2>
          </div>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Dato label="Nombre" value={profile.full_name} />
            <Dato label="Edad" value={profile.age != null ? `${profile.age} años` : null} />
            <Dato
              label="Nivel educativo"
              value={profile.education_level ? EDUCATION_LABELS[profile.education_level] ?? profile.education_level : null}
            />
            <Dato
              label="Situación laboral"
              value={profile.employment_status ? EMPLOYMENT_LABELS[profile.employment_status] ?? profile.employment_status : null}
            />
          </dl>
        </div>

        {/* Nivel financiero */}
        <div className="card p-5 sm:p-6">
          <h2 className="mb-4 text-sm font-semibold text-text">Nivel financiero</h2>
          <div className="flex flex-wrap items-center gap-3">
            <span className="chip badge-topic">
              {profile.knowledge_level ? LEVEL_LABELS[profile.knowledge_level] ?? profile.knowledge_level : 'Sin evaluar'}
            </span>
            <span className="text-sm text-muted">
              {correctas} de 3 correctas en la evaluación
            </span>
          </div>
        </div>

        {/* Intereses */}
        <div className="card p-6">
          <h2 className="mb-4 text-sm font-semibold text-text">Tus intereses</h2>
          {interests.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {interests.map((t) => (
                <span key={t} className="chip badge-difficulty">
                  {t}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No has seleccionado intereses.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function Dato({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="text-sm font-medium text-text">{value ?? '—'}</dd>
    </div>
  )
}
