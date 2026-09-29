import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  extractMentions,
  filterMentionUsers,
  getActiveMention,
  insertMention,
} from '@/lib/mentions'
import { cn } from '@/lib/utils'

export const MentionField = forwardRef(function MentionField(
  {
    value = '',
    onChange,
    onBlur,
    users = [],
    multiline = false,
    disabled,
    className,
    placeholder,
    id,
    name,
    rows = 3,
  },
  ref
) {
  const innerRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [mentionStart, setMentionStart] = useState(-1)
  const [activeIndex, setActiveIndex] = useState(0)
  const [menuPos, setMenuPos] = useState(null)

  useImperativeHandle(ref, () => innerRef.current)

  const matches = useMemo(
    () => (open ? filterMentionUsers(users, query) : []),
    [open, users, query]
  )
  const tagged = useMemo(() => extractMentions(value, users), [value, users])

  function updateMentionState(nextValue, caret) {
    const mention = getActiveMention(nextValue, caret)
    if (!mention) {
      setOpen(false)
      setQuery('')
      setMentionStart(-1)
      return
    }

    const nextMatches = filterMentionUsers(users, mention.query)
    if (!nextMatches.length && mention.query.includes(' ')) {
      setOpen(false)
      setQuery('')
      setMentionStart(-1)
      return
    }

    setOpen(true)
    setQuery(mention.query)
    setMentionStart(mention.start)
    setActiveIndex(0)
  }

  function syncMenuPosition() {
    const el = innerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const margin = 12
    const width = Math.min(Math.max(rect.width, 340), window.innerWidth - margin * 2)
    let left = rect.left
    if (left + width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - width - margin)
    }

    const itemCount = Math.max(matches.length, 1)
    const estimatedHeight = Math.min(240, 12 + itemCount * 52)
    let top = rect.bottom + 6
    if (top + estimatedHeight > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - estimatedHeight - 6)
    }

    setMenuPos({ top, left, width })
  }

  useEffect(() => {
    if (!open) return undefined
    syncMenuPosition()
    const onReposition = () => syncMenuPosition()
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    return () => {
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [open, value, matches.length])

  function emitChange(nextValue) {
    onChange?.(nextValue)
  }

  function handleChange(event) {
    const nextValue = event.target.value
    emitChange(nextValue)
    updateMentionState(nextValue, event.target.selectionStart)
  }

  function selectUser(user) {
    const el = innerRef.current
    const caret = el?.selectionStart ?? String(value).length
    const result = insertMention(value, caret, mentionStart, user)
    emitChange(result.value)
    setOpen(false)
    setQuery('')
    setMentionStart(-1)
    requestAnimationFrame(() => {
      if (!innerRef.current) return
      innerRef.current.focus()
      innerRef.current.setSelectionRange(result.caret, result.caret)
    })
  }

  function handleKeyDown(event) {
    if (!open || !matches.length) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((i) => (i + 1) % matches.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((i) => (i - 1 + matches.length) % matches.length)
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      selectUser(matches[activeIndex] || matches[0])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
    }
  }

  const Field = multiline ? Textarea : Input
  const fieldProps = multiline ? { rows } : {}

  return (
    <div className="space-y-1.5">
      <Field
        ref={innerRef}
        id={id}
        name={name}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={(event) => {
          setTimeout(() => setOpen(false), 120)
          onBlur?.(event)
        }}
        onClick={(event) => updateMentionState(event.target.value, event.target.selectionStart)}
        onKeyUp={(event) => updateMentionState(event.target.value, event.target.selectionStart)}
        autoComplete="off"
        {...fieldProps}
      />

      {tagged.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tagged.map((user) => (
            <a
              key={String(user.userId)}
              href={`mailto:${user.email}`}
              title={user.email}
              className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/15"
            >
              @{user.name}
            </a>
          ))}
        </div>
      )}

      {open && menuPos && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed z-[100] max-h-60 overflow-y-auto rounded-lg border border-border bg-white py-1 shadow-xl"
              style={{
                top: menuPos.top,
                left: menuPos.left,
                width: menuPos.width,
              }}
            >
              {matches.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">No matching people</p>
              ) : (
                matches.map((user, index) => (
                  <button
                    key={user._id}
                    type="button"
                    className={cn(
                      'flex w-full min-w-0 flex-col items-start px-3 py-2 text-left',
                      index === activeIndex ? 'bg-muted' : 'hover:bg-muted/70'
                    )}
                    onMouseDown={(event) => {
                      event.preventDefault()
                      selectUser(user)
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <span className="w-full truncate text-sm font-medium text-foreground">
                      {user.name}
                    </span>
                    <span className="w-full break-all text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  </button>
                ))
              )}
            </div>,
            document.body
          )
        : null}
    </div>
  )
})
