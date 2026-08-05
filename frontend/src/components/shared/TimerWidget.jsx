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
          ? 'border-amber-300 bg-amber-50 text-amber-800'
          : 'border-border bg-surface text-foreground'
      )}
    >
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-green-500" />
      </span>
      <span className="max-w-[140px] truncate font-medium">{label}</span>
      <span className="tabular-nums font-semibold">{formatElapsed(active.startedAt, now)}</span>
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
