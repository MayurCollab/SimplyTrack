import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export function SearchableSelect({
  id,
  value,
  onChange,
  options,
  placeholder = 'Search...',
  disabled = false,
  className,
}) {
  const selected = useMemo(
    () => options.find((opt) => String(opt.value) === String(value)) || null,
    [options, value]
  )
  const [query, setQuery] = useState(selected?.label || '')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (open) return
    setQuery(selected?.label || '')
  }, [selected, open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return options.filter((opt) => String(opt.label).toLowerCase().includes(q))
  }, [options, query])

  const showDropdown = open && !disabled && query.trim().length > 0

  return (
    <div className={cn('relative', className)}>
      <Input
        id={id}
        value={query}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setTimeout(() => {
            setOpen(false)
            const next = options.find((opt) => String(opt.value) === String(value))
            setQuery(next?.label || '')
          }, 120)
        }}
        onChange={(e) => {
          setQuery(e.target.value)
          onChange('')
          setOpen(true)
        }}
        placeholder={placeholder}
        disabled={disabled}
        ukSpellcheck={false}
      />
      {showDropdown && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-44 overflow-y-auto rounded-lg border border-border bg-white p-1 shadow-lg">
          {filtered.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">No matching stage found</p>
          ) : (
            filtered.map((opt) => {
              const active = String(opt.value) === String(value)
              return (
                <button
                  key={opt.value}
                  type="button"
                  className={cn(
                    'block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted',
                    active && 'bg-muted font-medium'
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(opt.value)
                    setQuery(opt.label)
                    setOpen(false)
                  }}
                >
                  {opt.label}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
