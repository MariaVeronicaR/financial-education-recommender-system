import { useEffect, useRef, useState, type MouseEvent, type KeyboardEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { searchContent, type SearchResponse } from '../lib/api'
import { IconArrowRight, IconBook, IconSearch } from '../components/Icons'

export default function Explorar() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialQ = searchParams.get('q') ?? ''
  const [query, setQuery] = useState(initialQ)
  const [data, setData] = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Búsqueda con debounce (300 ms) — actualiza la URL y dispara la llamada.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) {
      setData(null)
      setError(null)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const resp = await searchContent(query, 20)
        setData(resp)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al buscar')
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  // Si la URL trae ?q=... lo aplicamos al estado (entrada por enlace).
  useEffect(() => {
    setQuery(initialQ)
  }, [initialQ])

  function updateQuery(next: string) {
    setQuery(next)
    const params = new URLSearchParams(searchParams)
    if (next.trim()) params.set('q', next)
    else params.delete('q')
    setSearchParams(params, { replace: true })
  }

  function goToContent(contentId: string, e: MouseEvent | KeyboardEvent) {
    e.stopPropagation()
    navigate(`/contenido/${contentId}`)
  }

  const results = data?.results ?? []

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-12">
      <h1 className="mb-2 text-xl font-bold tracking-tight text-text sm:text-2xl">
        Explorar contenidos
      </h1>
      <p className="mb-6 text-muted">
        Busca en el catálogo por palabras clave (título, resumen, tema).
      </p>

      {/* Input de búsqueda con icono */}
      <div className="relative mb-6">
        <IconSearch
          size={18}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => updateQuery(e.target.value)}
          placeholder="Buscar… ej. presupuesto, inversión, deuda"
          className="input pl-10"
          autoFocus
          aria-label="Buscar contenidos"
        />
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-error-light px-4 py-3 text-sm text-error">{error}</p>
      )}

      {!query.trim() && (
        <div className="card p-10 text-center">
          <p className="text-muted">
            Empieza escribiendo en el buscador. Los resultados aparecerán
            aquí en tiempo real.
          </p>
        </div>
      )}

      {query.trim() && loading && (
        <p className="text-center text-muted">Buscando…</p>
      )}

      {query.trim() && !loading && data && results.length === 0 && (
        <div className="card p-10 text-center">
          <p className="text-muted">
            Sin resultados para «{data.query}». Prueba otras palabras clave
            como «ahorro», «crédito» o «jubilación».
          </p>
        </div>
      )}

      {query.trim() && !loading && results.length > 0 && (
        <>
          <p className="mb-3 text-sm text-muted">
            {results.length} resultado{results.length === 1 ? '' : 's'} para «{data?.query}»
          </p>
          <div className="space-y-4">
            {results.map(({ content_id, content, score }) => (
              <div
                key={content_id}
                role="link"
                tabIndex={0}
                onClick={(e) => goToContent(content_id, e)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    goToContent(content_id, e)
                  }
                }}
                className="card card-hover cursor-pointer p-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  {content.topic && (
                    <span className="chip badge-topic">{content.topic}</span>
                  )}
                  {content.difficulty && (
                    <span className="chip badge-difficulty">{content.difficulty}</span>
                  )}
                  {content.format && (
                    <span className="chip badge-difficulty">{content.format}</span>
                  )}
                  <span className="chip ml-auto text-xs">score {score.toFixed(2)}</span>
                </div>
                <h3 className="mb-1 font-semibold text-text">
                  {content.title ?? content_id}
                </h3>
                {content.summary && (
                  <p className="mb-2 text-sm text-muted">{content.summary}</p>
                )}
                <Link
                  to={`/contenido/${content_id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="btn btn-ghost mt-2 !px-3 !py-2"
                >
                  <IconBook size={16} />
                  Ver contenido
                  <IconArrowRight size={16} />
                </Link>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
