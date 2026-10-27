import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  isToday,
  isWithinInterval,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

function parseDate(value) {
  if (!value) return null
  try {
    const d = parseISO(value)
    return Number.isNaN(d.getTime()) ? null : startOfDay(d)
  } catch {
    return null
  }
}

function toValue(date) {
  return date ? format(date, 'yyyy-MM-dd') : ''
}

function formatShort(date) {
  return date ? format(date, 'dd MMM yyyy') : '—'
}

function normalizeRange(a, b) {
  if (a && b && isAfter(a, b)) return { from: b, to: a }
  return { from: a, to: b }
}

function buildMonthGrid(month) {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
  return eachDayOfInterval({ start, end })
}

function presetRanges(today = startOfDay(new Date())) {
  const weekStart = startOfWeek(today, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 })
  return [
    {
      id: 'today',
      label: 'Today',
      from: today,
      to: today,
    },
    {
      id: 'week',
      label: 'This week',
      from: weekStart,
      to: weekEnd,
    },
    {
      id: 'month',
      label: 'This month',
      from: startOfMonth(today),
      to: endOfMonth(today),
    },
    {
      id: 'last7',
      label: 'Last 7 days',
      from: startOfDay(new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000)),
      to: today,
    },
  ]
}

export function DateRangePicker({
  from = '',
  to = '',
  onChange,
  placeholder = 'Select date range',
  label,
  className,
  align = 'left',
}) {
  const rootRef = useRef(null)
  const [open, setOpen] = useState(false)
  const selectedFrom = parseDate(from)
  const selectedTo = parseDate(to)

  const [draftFrom, setDraftFrom] = useState(selectedFrom)
  const [draftTo, setDraftTo] = useState(selectedTo)
  const [hoverDay, setHoverDay] = useState(null)
  const [viewMonth, setViewMonth] = useState(
    () => startOfMonth(selectedFrom || selectedTo || new Date())
  )

  useEffect(() => {
    if (!open) return

    const nextFrom = parseDate(from)
    const nextTo = parseDate(to)
    setDraftFrom(nextFrom)
    setDraftTo(nextTo)
    setHoverDay(null)
    setViewMonth(startOfMonth(nextFrom || nextTo || new Date()))

    function onPointerDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false)
      }
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
    // Sync draft only when the popover opens (or controlled value changes while open).
  }, [open, from, to])

  const days = useMemo(() => buildMonthGrid(viewMonth), [viewMonth])
  const presets = useMemo(() => presetRanges(), [])

  const previewRange = useMemo(() => {
    if (draftFrom && !draftTo && hoverDay) {
      return normalizeRange(draftFrom, hoverDay)
    }
    return { from: draftFrom, to: draftTo }
  }, [draftFrom, draftTo, hoverDay])

  const triggerLabel = useMemo(() => {
    if (selectedFrom && selectedTo) {
      if (isSameDay(selectedFrom, selectedTo)) return formatShort(selectedFrom)
      return `${format(selectedFrom, 'dd MMM')} – ${format(selectedTo, 'dd MMM yyyy')}`
    }
    if (selectedFrom) return `${formatShort(selectedFrom)} – …`
    return placeholder
  }, [placeholder, selectedFrom, selectedTo])

  const hasValue = Boolean(selectedFrom || selectedTo)

  function commit(nextFrom, nextTo) {
    onChange?.({
      from: toValue(nextFrom),
      to: toValue(nextTo),
    })
  }

  function handleDayClick(day) {
    if (!draftFrom || (draftFrom && draftTo)) {
      setDraftFrom(day)
      setDraftTo(null)
      return
    }

    const next = normalizeRange(draftFrom, day)
    setDraftFrom(next.from)
    setDraftTo(next.to)
    commit(next.from, next.to)
    setOpen(false)
  }

  function applyPreset(preset) {
    setDraftFrom(preset.from)
    setDraftTo(preset.to)
    setViewMonth(startOfMonth(preset.from))
    commit(preset.from, preset.to)
    setOpen(false)
  }

  function clearRange() {
    setDraftFrom(null)
    setDraftTo(null)
    commit(null, null)
  }

  function dayState(day) {
    const { from: rangeFrom, to: rangeTo } = previewRange
    const inRange =
      rangeFrom &&
      rangeTo &&
      isWithinInterval(day, { start: rangeFrom, end: rangeTo })
    const isStart = rangeFrom && isSameDay(day, rangeFrom)
    const isEnd = rangeTo && isSameDay(day, rangeTo)
    const isEdge = isStart || isEnd
    const outside = !isSameMonth(day, viewMonth)
    const today = isToday(day)

    return { inRange, isStart, isEnd, isEdge, outside, today }
  }

  return (
    <div ref={rootRef} className={cn('relative shrink-0', className)}>
      <div
        className={cn(
          'group flex h-10 min-w-[13.5rem] items-center gap-1 rounded-lg border bg-white pl-3 pr-1 text-sm transition-all duration-150',
          open
            ? 'border-primary ring-2 ring-primary/20'
            : 'border-border hover:border-indigo-200 hover:bg-indigo-50/40',
          hasValue ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={label ? `${label}: ${triggerLabel}` : triggerLabel}
          className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left focus-visible:outline-none"
        >
          <CalendarDays
            className={cn(
              'size-4 shrink-0 transition-colors',
              hasValue || open ? 'text-primary' : 'text-slate-400 group-hover:text-primary'
            )}
          />
          <span className="min-w-0 flex-1 truncate">
            {label ? (
              <>
                <span className="mr-1.5 font-medium text-slate-500">{label}</span>
                <span className={cn(hasValue && 'font-medium text-slate-800')}>{triggerLabel}</span>
              </>
            ) : (
              <span className={cn(hasValue && 'font-medium text-slate-800')}>{triggerLabel}</span>
            )}
          </span>
        </button>
        {hasValue ? (
          <button
            type="button"
            aria-label="Clear date range"
            className="mr-1 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            onClick={() => {
              clearRange()
              setOpen(false)
            }}
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      {open ? (
        <div
          role="dialog"
          aria-label={label || 'Date range'}
          className={cn(
            'absolute top-[calc(100%+8px)] z-50 w-[320px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.12)]',
            align === 'right' ? 'right-0' : 'left-0'
          )}
        >
          <div className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50/90 to-white px-3.5 py-3">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div className="rounded-lg border border-indigo-100 bg-white px-2.5 py-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  From
                </p>
                <p className="truncate text-sm font-semibold text-slate-800">
                  {formatShort(draftFrom)}
                </p>
              </div>
              <div className="h-px w-4 bg-slate-200" aria-hidden />
              <div className="rounded-lg border border-indigo-100 bg-white px-2.5 py-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  To
                </p>
                <p className="truncate text-sm font-semibold text-slate-800">
                  {formatShort(draftTo)}
                </p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              {draftFrom && !draftTo
                ? 'Select an end date'
                : 'Select a start date, then an end date'}
            </p>
          </div>

          <div className="px-3.5 pt-3">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setViewMonth((m) => subMonths(m, 1))}
                className="inline-flex size-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-indigo-50 hover:text-indigo-700"
                aria-label="Previous month"
              >
                <ChevronLeft className="size-4" />
              </button>
              <p className="text-sm font-bold text-slate-800">
                {format(viewMonth, 'MMMM yyyy')}
              </p>
              <button
                type="button"
                onClick={() => setViewMonth((m) => addMonths(m, 1))}
                className="inline-flex size-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-indigo-50 hover:text-indigo-700"
                aria-label="Next month"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>

            <div className="mb-1 grid grid-cols-7 gap-y-1">
              {WEEKDAYS.map((d) => (
                <div
                  key={d}
                  className="py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400"
                >
                  {d}
                </div>
              ))}
            </div>

            <div
              className="grid grid-cols-7 gap-y-1 pb-1"
              onMouseLeave={() => setHoverDay(null)}
            >
              {days.map((day) => {
                const { inRange, isEdge, outside, today } = dayState(day)
                const disabledHint =
                  draftFrom &&
                  !draftTo &&
                  hoverDay &&
                  isBefore(day, draftFrom) &&
                  !isSameDay(day, draftFrom)

                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => handleDayClick(day)}
                    onMouseEnter={() => setHoverDay(day)}
                    className={cn(
                      'relative flex h-9 items-center justify-center text-sm transition-colors',
                      inRange && !isEdge && 'bg-indigo-50 text-indigo-800',
                      isEdge && 'z-[1]',
                      outside && 'text-slate-300',
                      !outside && !isEdge && !inRange && 'text-slate-700 hover:bg-slate-100',
                      disabledHint && 'opacity-70'
                    )}
                  >
                    <span
                      className={cn(
                        'inline-flex size-8 items-center justify-center rounded-full font-medium',
                        isEdge && 'bg-primary text-white shadow-sm shadow-indigo-500/30',
                        !isEdge && today && 'ring-1 ring-inset ring-indigo-300 text-indigo-700',
                        !isEdge && inRange && 'font-semibold'
                      )}
                    >
                      {format(day, 'd')}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/80 px-3.5 py-2.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                clearRange()
                setOpen(false)
              }}
              className="h-8 px-2.5 text-slate-600"
            >
              Clear
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 px-3"
              disabled={!draftFrom}
              onClick={() => {
                const next = normalizeRange(draftFrom, draftTo || draftFrom)
                commit(next.from, next.to)
                setOpen(false)
              }}
            >
              Apply
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
