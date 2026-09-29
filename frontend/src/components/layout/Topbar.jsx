import { LogOut, Coffee, GraduationCap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { TimerWidget } from '@/components/shared/TimerWidget'
import { useAuthStore } from '@/store/authStore'
import { useTimerStore } from '@/store/timerStore'
import { useActiveTimer, useTimerActions } from '@/hooks/useTimer'
import { formatTimeLogDuration } from '@/lib/time'
import { TASK_PHASE } from '@/config/taskModule'
import api from '@/lib/api'

export function Topbar() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const active = useTimerStore((s) => s.active)
  const pendingNote = useTimerStore((s) => s.pendingNote)
  const noteDialog = useTimerStore((s) => s.noteDialog)
  const breakOverAllowance = useTimerStore((s) => s.breakOverAllowance)

  useActiveTimer()
  const { startBreak, startTraining, openNoteDialog, openPendingClosingNote } = useTimerActions()

  async function handleLogout() {
    try {
      await api.post('/auth/logout')
    } catch {
      // proceed
    }
    logout()
    toast.success('Logged out')
    navigate('/login')
  }

  function handleBreak() {
    if (active?.type === 'break') {
      openNoteDialog({ timeLog: active, mode: 'stop' })
      return
    }
    startBreak.mutate()
  }

  function handleTraining() {
    if (active?.type === 'training') {
      openNoteDialog({ timeLog: active, mode: 'stop' })
      return
    }
    startTraining.mutate()
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-indigo-100 bg-white px-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Welcome back, <span className="font-semibold text-slate-900">{user?.name}</span>
        </p>
      </div>
      <div className="flex items-center gap-2">
        {pendingNote && !noteDialog && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => openPendingClosingNote(pendingNote)}
            className="border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
          >
            Closing note needed
            {formatTimeLogDuration(pendingNote) ? (
              <span className="ml-1.5 tabular-nums font-semibold">
                ({formatTimeLogDuration(pendingNote)})
              </span>
            ) : null}
          </Button>
        )}
        <TimerWidget />
        {TASK_PHASE.breakTraining && (
          <>
            {breakOverAllowance && active?.type === 'break' && (
              <span className="text-xs font-medium text-amber-600">Break over allowance</span>
            )}
            <Button
              variant={active?.type === 'break' ? 'primary' : 'secondary'}
              size="sm"
              onClick={handleBreak}
              disabled={startBreak.isPending}
              className={
                active?.type === 'break'
                  ? 'border-transparent bg-amber-500 text-white shadow-amber-500/25 hover:bg-amber-600 hover:shadow-amber-500/30 focus-visible:ring-amber-500'
                  : 'border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300 hover:bg-amber-100 hover:text-amber-900'
              }
            >
              <Coffee className="size-4" />
              {active?.type === 'break' ? 'End break' : 'Break'}
            </Button>
            <Button
              variant={active?.type === 'training' ? 'primary' : 'secondary'}
              size="sm"
              onClick={handleTraining}
              disabled={startTraining.isPending}
              className={
                active?.type === 'training'
                  ? 'border-transparent bg-violet-600 text-white shadow-violet-500/25 hover:bg-violet-700 hover:shadow-violet-500/30 focus-visible:ring-violet-500'
                  : 'border-violet-200 bg-violet-50 text-violet-800 hover:border-violet-300 hover:bg-violet-100 hover:text-violet-900'
              }
            >
              <GraduationCap className="size-4" />
              {active?.type === 'training' ? 'End training / meeting' : 'Training / Meeting'}
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="text-slate-500 hover:bg-rose-50 hover:text-rose-700"
        >
          <LogOut className="size-4" />
          Logout
        </Button>
      </div>
    </header>
  )
}
