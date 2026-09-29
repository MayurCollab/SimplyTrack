import { useEffect, useState } from 'react'
import { Square } from 'lucide-react'
import { useTimerStore } from '@/store/timerStore'
import { useTimerActions } from '@/hooks/useTimer'
import { formatElapsed } from '@/lib/time'
import { cn } from '@/lib/utils'

export function TimerWidget() {
  const active = useTimerStore((s) => s.active)
  const breakOverAllowance = useTimerStore((s) => s.breakOverAllowance)
  const { openNoteDialog } = useTimerActions()
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!active) return undefined
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])

  if (!active) return null

  const label =
    active.type === 'task'
      ? active.taskId?.title || 'Task'
      : active.type === 'break'
        ? 'On break'
        : 'Training / Meeting'

  function handleStop() {
    openNoteDialog({ timeLog: active, mode: 'stop' })
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm',
        active.type === 'break' && breakOverAllowance
          ? 'border-amber-300 bg-amber-50 text-amber-900'
          : active.type === 'break'
            ? 'border-amber-200 bg-amber-50 text-amber-800'
            : active.type === 'training'
              ? 'border-violet-200 bg-violet-50 text-violet-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
      )}
    >
      <span className="relative flex size-2">
        <span
          className={cn(
            'absolute inline-flex size-full animate-ping rounded-full opacity-75',
            active.type === 'break' ? 'bg-amber-400' : active.type === 'training' ? 'bg-violet-400' : 'bg-emerald-400'
          )}
        />
        <span
          className={cn(
            'relative inline-flex size-2 rounded-full',
            active.type === 'break' ? 'bg-amber-500' : active.type === 'training' ? 'bg-violet-500' : 'bg-emerald-500'
          )}
        />
      </span>
      <span className="max-w-[140px] truncate font-semibold">{label}</span>
      <span className="tabular-nums font-bold">{formatElapsed(active.startedAt, now)}</span>
      <button
        type="button"
        onClick={handleStop}
        className="rounded p-1 hover:bg-muted"
        title="Stop"
      >
        <Square className="size-3.5 fill-current" />
      </button>
    </div>
  )
}
