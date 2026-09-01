import type { ContentBlock, ContentBlockLink } from '../lib/api'

// Renderiza los bloques del contenido (headings, párrafos, listas, glossary,
// warning, highlight, video) de forma legible. Los párrafos con `links` se
// renderizan troceando el texto por los offsets de cada link e insertando un <a>.
export default function ContentBlocks({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <div className="space-y-4">
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'heading': {
            const level = block.level ?? 2
            if (level === 1) {
              return (
                <h2 key={i} className="break-words pt-2 text-xl font-bold text-text">
                  {block.text}
                </h2>
              )
            }
            return (
              <h3 key={i} className="break-words pt-2 text-lg font-semibold text-text">
                {block.text}
              </h3>
            )
          }
          case 'list':
          case 'unordered_list': {
            const items = block.items ?? []
            return (
              <div key={i} className="pl-1">
                <ul className="list-disc space-y-1.5 break-words pl-5 text-sm leading-relaxed text-muted">
                  {items.map((item, j) => (
                    <li key={j}>{typeof item === 'string' ? item : item.text}</li>
                  ))}
                </ul>
              </div>
            )
          }
          case 'ordered_list': {
            const items = block.items ?? []
            return (
              <div key={i} className="pl-1">
                <ol className="list-decimal space-y-1.5 break-words pl-5 text-sm leading-relaxed text-muted">
                  {items.map((item, j) => (
                    <li key={j}>{typeof item === 'string' ? item : item.text}</li>
                  ))}
                </ol>
              </div>
            )
          }
          case 'link_list': {
            const items = block.items ?? []
            return (
              <div key={i} className="pl-1">
                <ul className="list-disc space-y-1.5 break-words pl-5 text-sm leading-relaxed text-muted">
                  {items.map((item, j) => {
                    const it = item as { text: string; href: string }
                    return (
                      <li key={j}>
                        <a
                          href={it.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-secondary underline-offset-2 hover:underline"
                        >
                          {it.text}
                        </a>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          }
          case 'glossary': {
            const entries = block.entries ?? []
            if (entries.length === 0) {
              return null
            }
            return (
              <div key={i} className="card p-5">
                <h3 className="mb-3 text-sm font-semibold text-text">Glosario</h3>
                <dl className="space-y-2">
                  {entries.map((e, j) => (
                    <div key={j} className="border-b border-border pb-2 last:border-0 last:pb-0">
                      <dt className="text-sm font-semibold text-text">{e.term}</dt>
                      <dd className="mt-0.5 text-sm text-muted">{e.definition}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )
          }
          case 'warning': {
            const level: string = (block.level as string | undefined) ?? 'info'
            const styles: Record<string, string> = {
              info: 'border-secondary bg-secondary-light text-text',
              caution: 'border-amber-500 bg-amber-50 text-text',
              important: 'border-error bg-error-light text-text',
            }
            const cls = styles[level] ?? styles.info
            return (
              <div key={i} className={`rounded-r-xl border-l-4 p-4 ${cls}`}>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                  {level === 'important' ? 'Importante' : level === 'caution' ? 'Atención' : 'Aviso'}
                </div>
                <p className="break-words text-sm leading-relaxed">{block.text}</p>
              </div>
            )
          }
          case 'highlight': {
            return (
              <div
                key={i}
                className="rounded-r-xl border-l-4 border-accent bg-accent-light p-4 text-sm leading-relaxed text-text"
              >
                {block.text}
              </div>
            )
          }
          case 'video': {
            const url = block.url ?? ''
            if (!url) return null
            return (
              <figure key={i} className="my-6">
                <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
                  <iframe
                    src={url}
                    title={block.caption || 'Video'}
                    className="absolute inset-0 h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
                    loading="lazy"
                  />
                </div>
                {block.caption && (
                  <figcaption className="mt-2 text-center text-xs text-muted">
                    {block.caption}
                  </figcaption>
                )}
              </figure>
            )
          }
          case 'paragraph':
          default:
            return (
              <p key={i} className="break-words text-sm leading-relaxed text-muted">
                {renderParagraph(block.text ?? '', block.links)}
              </p>
            )
        }
      })}
    </div>
  )
}

// Trocea el texto por los offsets de los links y devuelve una secuencia de
// strings y <a>. Estrategia: ordenar los links por `start` y descartar los que
// se solapan (manteniendo el primero).
function renderParagraph(text: string, links?: ContentBlockLink[]): React.ReactNode {
  if (!links || links.length === 0) return text

  // Filtrar links cuyo rango no encaje en el texto actual.
  const valid = links
    .filter((l) => l.start >= 0 && l.end > l.start && l.end <= text.length)
    .sort((a, b) => a.start - b.start)

  // Si hay solapamientos, sólo nos quedamos con el primero y descartamos
  // los siguientes que se solapen con él.
  const nonOverlap: ContentBlockLink[] = []
  let lastEnd = -1
  for (const l of valid) {
    if (l.start >= lastEnd) {
      nonOverlap.push(l)
      lastEnd = l.end
    }
  }

  if (nonOverlap.length === 0) return text

  const out: React.ReactNode[] = []
  let cursor = 0
  nonOverlap.forEach((l, idx) => {
    if (l.start > cursor) {
      out.push(<span key={`t${idx}`}>{text.slice(cursor, l.start)}</span>)
    }
    out.push(
      <a
        key={`a${idx}`}
        href={l.href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-secondary underline-offset-2 hover:underline"
      >
        {text.slice(l.start, l.end) || l.text}
      </a>,
    )
    cursor = l.end
  })
  if (cursor < text.length) {
    out.push(<span key="tail">{text.slice(cursor)}</span>)
  }
  return out
}
