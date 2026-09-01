import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { IconArrowRight, IconBook, IconChart, IconShield, IconTarget } from '../components/Icons'

export default function Inicio() {
  const { user } = useAuth()

  return (
    <div className="mx-auto max-w-5xl px-4">
      {/* Hero */}
      <section className="px-4 py-14 text-center sm:py-20 md:py-24">
        <span className="chip badge-topic mb-6">Educación financiera personalizada</span>
        <h1 className="mx-auto max-w-3xl text-3xl font-bold tracking-tight text-text sm:text-4xl md:text-5xl">
          Aprende finanzas a tu ritmo,{' '}
          <span className="text-secondary">sin perderte</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-muted sm:text-lg">
          Una plataforma que te recomienda contenidos adaptados a tu nivel y a tus
          intereses, respetando la progresión pedagógica: no pasarás a temas avanzados
          sin dominar los básicos.
        </p>
        <div className="mx-auto mt-8 flex max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
          <Link to="/cuestionario" className="btn btn-primary w-full !px-6 !py-3 !text-base sm:w-auto">
            {user ? 'Completar mi perfil' : 'Empezar ahora'}
            <IconArrowRight size={18} />
          </Link>
          <Link to="/recomendaciones" className="btn btn-outline w-full !px-6 !py-3 !text-base sm:w-auto">
            Ver mis recomendaciones
          </Link>
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="px-4 pb-16">
        <h2 className="mb-8 text-center text-xl font-bold text-text sm:text-2xl">
          Cómo funciona
        </h2>
        <div className="grid gap-4 sm:grid-cols-3 sm:gap-6">
          <FeatureCard
            icon={<IconTarget size={22} />}
            title="Perfilado"
            description="Un breve cuestionario para conocer tu nivel y tus intereses."
          />
          <FeatureCard
            icon={<IconBook size={22} />}
            title="Recomendaciones"
            description="Contenidos personalizados con una explicación de por qué te los sugerimos."
          />
          <FeatureCard
            icon={<IconChart size={22} />}
            title="Progreso"
            description="Avanza por el itinerario y desbloquea temas más avanzados."
          />
        </div>
      </section>

      {/* Confianza */}
      <section className="px-4 pb-20">
        <div className="card flex flex-col items-center gap-6 p-6 text-center sm:flex-row sm:justify-between sm:p-8 sm:text-left">
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-light text-accent">
              <IconShield size={24} />
            </span>
            <div>
              <h3 className="font-semibold text-text">Educación, no asesoramiento</h3>
              <p className="text-sm text-muted">
                No recomendamos productos financieros ni damos consejo de inversión.
                Solo te ayudamos a aprender.
              </p>
            </div>
          </div>
          <Link to="/cuestionario" className="btn btn-secondary w-full shrink-0 sm:w-auto">
            Empezar mi itinerario
            <IconArrowRight size={18} />
          </Link>
        </div>
      </section>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="card card-hover p-6">
      <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary-light text-primary">
        {icon}
      </span>
      <h3 className="mb-1 font-semibold text-text">{title}</h3>
      <p className="text-sm text-muted">{description}</p>
    </div>
  )
}
