import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

/** Red wavy underline backdrop mirrored under a transparent-bg input/textarea. */
export function SpellcheckBackdrop({
  text = '',
  misspellings = [],
  multiline = false,
  className,
  scrollTop = 0,
  scrollLeft = 0,
}) {
  const parts = []
  let cursor = 0

  for (const miss of misspellings) {
    if (miss.start > cursor) {
      parts.push({ key: `t-${cursor}`, text: text.slice(cursor, miss.start), bad: false })
    }
    parts.push({
      key: `m-${miss.start}`,
      text: text.slice(miss.start, miss.end),
      bad: true,
    })
    cursor = miss.end
  }
  if (cursor < text.length) {
    parts.push({ key: `t-${cursor}`, text: text.slice(cursor), bad: false })
  }

  const content =
    parts.length === 0 ? (
      '\u00a0'
    ) : (
      <>
        {parts.map((p) =>
          p.bad ? (
            <span key={p.key} className="uk-misspelled">
              {p.text}
            </span>
          ) : (
            <span key={p.key}>{p.text}</span>
          )
        )}
        {text.endsWith('\n') ? '\n' : null}
      </>
    )

  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden rounded-lg px-3 py-2 text-sm leading-5 text-transparent',
        multiline ? 'whitespace-pre-wrap break-words' : 'whitespace-pre',
        className
      )}
      style={{ transform: `translate(${-scrollLeft}px, ${-scrollTop}px)` }}
    >
      {content}
    </div>
  )
}

/** Chrome-like spelling suggestions — only applies when the user picks one. */
export function SpellSuggestionMenu({ menu, onPick, onClose }) {
  if (!menu || typeof document === 'undefined') return null

  const width = 220
  const left = Math.min(menu.x, window.innerWidth - width - 8)
  const top = Math.min(menu.y, window.innerHeight - 240)

  return createPortal(
    <div
      role="menu"
      aria-label="Spelling suggestions"
      className="fixed z-[100] min-w-[180px] max-w-[260px] rounded-lg border border-border bg-white py-1 shadow-lg"
      style={{ left, top }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Suggestions
      </div>
      {menu.suggestions.length === 0 ? (
        <p className="px-3 py-1.5 text-sm text-muted-foreground">No suggestions</p>
      ) : (
        menu.suggestions.map((s) => (
          <button
            key={s}
            type="button"
            role="menuitem"
            className="flex w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted"
            onClick={() => onPick(s)}
          >
            {s}
          </button>
        ))
      )}
      <div className="my-1 border-t border-border" />
      <button
        type="button"
        role="menuitem"
        className="flex w-full px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted"
        onClick={onClose}
      >
        Keep “{menu.word}”
      </button>
    </div>,
    document.body
  )
}
