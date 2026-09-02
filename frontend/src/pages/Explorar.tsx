import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { searchContent, type SearchResponse } from '../lib/api'
import {
  IconArrowLeft,
  IconArrowRight,
  IconBook,
  IconSearch,
  IconX,
} from '../components/Icons'

// Tamaño de página del modo catálogo (sin query).
const PAGE_SIZE = 20

// Catálogo cacheado a nivel de módulo: Explorar lo necesita en modo
// 'catálogo paginado' (sin query). Mismo patrón que Recomendaciones para
// evitar fetch repetido en cada navegación.
let catalogCache: ContentMini[] | null = null
async function getCatalogMini(): Promise<ContentMini[]> {
  if (catalogCache) return catalogCache
  const res = await fetch(
    `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/catalog`,
  )
  if (!res.ok) return []
  const raw: Array<{
    content_id: string
    title?: string
    topic?: string
    difficulty?: string
    format?: string
    summary?: string
  }> = await res.json()
  catalogCache = raw.map((c) => ({
    content_id: c.content_id,
    title: c.title ?? '',
    topic: c.topic ?? '',
    difficulty: c.difficulty ?? '',
    format: c.format ?? '',
    summary: c.summary ?? '',
  }))
  return catalogCache
}

interface ContentMini {
  content_id: string
  title: string
  topic: string
  difficulty: string
  format: string
  summary: string
}

export default function Explorar() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialQ = searchParams.get('q') ?? ''
  const [query, setQuery] = useState(initialQ)
  const [data, setData] = useState<SearchResponse | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Estado del modo catálogo paginado.
  const [catalog, setCatalog] = useState<ContentMini[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [page, setPage] = useState(1)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isSearchMode = query.trim().length > 0

  // Búsqueda con debounce (300 ms) — solo cuando hay query.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!isSearchMode) {
      setData(null)
      setError(null)
      setSearchLoading(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true)
      setError(null)
      try {
        const resp = await searchContent(query, 20)
        setData(resp)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al buscar')
      } finally {
        setSearchLoading(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, isSearchMode])

  // Carga el catálogo completo (modo paginado) la primera vez que el
  // usuario entra sin query. Cache a nivel de módulo para no re-fetch
  // en navegaciones sucesivas.
  useEffect(() => {
    let cancelled = false
    if (isSearchMode) return
    setCatalogLoading(true)
    getCatalogMini().then((list) => {
      if (cancelled) return
      setCatalog(list)
      setCatalogLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [isSearchMode])

  // Si la URL trae ?q=... lo aplicamos al estado (entrada por enlace).
  useEffect(() => {
    setQuery(initialQ)
  }, [initialQ])

  // Reset página cuando el usuario escribe (cambia a modo búsqueda).
  useEffect(() => {
    if (isSearchMode) setPage(1)
  }, [isSearchMode])

  function updateQuery(next: string) {
    setQuery(next)
    const params = new URLSearchParams(searchParams)
    if (next.trim()) params.set('q', next)
    else params.delete('q')
    setSearchParams(params, { replace: true })
  }

  function clearQuery() {
    setQuery('')
    setData(null)
    const params = new URLSearchParams(searchParams)
    params.delete('q')
    setSearchParams(params, { replace: true })
    setPage(1)
  }

  function goToContent(contentId: string, e: MouseEvent | KeyboardEvent) {
    e.stopPropagation()
    navigate(`/contenido/${contentId}`)
  }

  const searchResults = data?.results ?? []
  const totalPages = Math.max(1, Math.ceil(catalog.length / PAGE_SIZE))
  const pageItems = catalog.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-12">
      <h1 className="mb-2 text-xl font-bold tracking-tight text-text sm:text-2xl">
        Explorar contenidos
      </h1>
      <p className="mb-6 text-muted">
        {isSearchMode
          ? `Resultados para «${query.trim()}»`
          : 'Busca en el catálogo por palabras clave o explora las páginas.'}
      </p>

      {/* Input de búsqueda con icono. Botón X para limpiar cuando hay query. */}
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
          className="input pl-10 pr-10"
          autoFocus
          aria-label="Buscar contenidos"
        />
        {isSearchMode && (
          <button
            type="button"
            onClick={clearQuery}
            aria-label="Limpiar búsqueda"
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted transition hover:bg-background hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
          >
            <IconX size={18} />
          </button>
        )}
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-error-light px-4 py-3 text-sm text-error">{error}</p>
      )}

      {/* MODO BÚSQUEDA */}
      {isSearchMode && searchLoading && (
        <p className="text-center text-muted">Buscando…</p>
      )}

      {isSearchMode && !searchLoading && data && searchResults.length === 0 && (
        <div className="card p-10 text-center">
          <p className="text-muted">
            Sin resultados para «{data.query}». Prueba otras palabras clave
            como «ahorro», «crédito» o «jubilación».
          </p>
        </div>
      )}

      {isSearchMode && !searchLoading && searchResults.length > 0 && (
        <>
          <p className="mb-3 text-sm text-muted">
            {searchResults.length} resultado{searchResults.length === 1 ? '' : 's'} para «{data?.query}»
          </p>
          <div className="space-y-4">
            {searchResults.map(({ content_id, content, score }) => (
              <ContentCard
                key={content_id}
                content_id={content_id}
                title={content.title ?? ''}
                topic={content.topic ?? ''}
                difficulty={content.difficulty ?? ''}
                format={content.format ?? ''}
                summary={content.summary ?? ''}
                score={score}
                scoreLabel
                onActivate={goToContent}
              />
            ))}
          </div>
        </>
      )}

      {/* MODO CATÁLOGO PAGINADO */}
      {!isSearchMode && catalogLoading && (
        <p className="text-center text-muted">Cargando catálogo…</p>
      )}

      {!isSearchMode && !catalogLoading && catalog.length === 0 && (
        <div className="card p-10 text-center">
          <p className="text-muted">
            Empieza escribiendo en el buscador, o explora el catálogo con
            las páginas de abajo.
          </p>
        </div>
      )}

      {!isSearchMode && !catalogLoading && catalog.length > 0 && (
        <>
          <p className="mb-3 text-sm text-muted">
            Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, catalog.length)}{' '}
            de {catalog.length} contenidos
          </p>
          <div className="space-y-4">
            {pageItems.map((c) => (
              <ContentCard
                key={c.content_id}
                content_id={c.content_id}
                title={c.title}
                topic={c.topic}
                difficulty={c.difficulty}
                format={c.format}
                summary={c.summary}
                onActivate={goToContent}
              />
            ))}
          </div>

          {/* Paginación */}
          {totalPages > 1 && (
            <nav
              className="mt-8 flex flex-wrap items-center justify-between gap-3"
              aria-label="Paginación del catálogo"
            >
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn btn-outline !px-3 !py-2 disabled:opacity-40"
              >
                <IconArrowLeft size={16} />
                Anterior
              </button>
              <div className="flex flex-wrap items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPage(n)}
                    aria-current={page === n ? 'page' : undefined}
                    className={`min-w-[2.25rem] rounded-md px-2.5 py-1.5 text-sm font-medium transition ${
                      page === n
                        ? 'bg-primary text-white'
                        : 'text-muted hover:bg-background hover:text-text'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn btn-outline !px-3 !py-2 disabled:opacity-40"
              >
                Siguiente
                <IconArrowRight size={16} />
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  )
}

// Card reutilizable para ambos modos (búsqueda y catálogo).
function ContentCard(props: {
  content_id: string
  title: string
  topic: string
  difficulty: string
  format: string
  summary: string
  score?: number
  scoreLabel?: boolean
  onActivate: (contentId: string, e: MouseEvent | KeyboardEvent) => void
}) {
  const {
    content_id,
    title,
    topic,
    difficulty,
    format,
    summary,
    score,
    scoreLabel,
    onActivate,
  } = props
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={(e) => onActivate(content_id, e)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onActivate(content_id, e)
        }
      }}
      className="card card-hover cursor-pointer p-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {topic && <span className="chip badge-topic">{topic}</span>}
        {difficulty && <span className="chip badge-difficulty">{difficulty}</span>}
        {format && <span className="chip badge-difficulty">{format}</span>}
        {scoreLabel && typeof score === 'number' && (
          <span className="chip ml-auto text-xs">score {score.toFixed(2)}</span>
        )}
      </div>
      <h3 className="mb-1 font-semibold text-text">{title || content_id}</h3>
      {summary && <p className="mb-2 text-sm text-muted">{summary}</p>}
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
  )
}
