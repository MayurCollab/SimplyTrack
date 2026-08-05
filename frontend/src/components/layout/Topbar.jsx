import { LogOut, Coffee, GraduationCap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { TimerWidget } from '@/components/shared/TimerWidget'
import { useAuthStore } from '@/store/authStore'
import { useTimerStore } from '@/store/timerStore'
import { useActiveTimer, useTimerActions } from '@/hooks/useTimer'
import { TASK_PHASE } from '@/config/taskModule'
import api from '@/lib/api'

export function Topbar() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const active = useTimerStore((s) => s.active)
  const breakOverAllowance = useTimerStore((s) => s.breakOverAllowance)

  useActiveTimer()
  const { startBreak, startTraining, openNoteDialog } = useTimerActions()

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
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-white px-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Welcome back, <span className="font-medium text-foreground">{user?.name}</span>
        </p>
      </div>
      <div className="flex items-center gap-2">
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
            >
              <Coffee className="size-4" />
              {active?.type === 'break' ? 'End break' : 'Break'}
            </Button>
            <Button
              variant={active?.type === 'training' ? 'primary' : 'secondary'}
              size="sm"
              onClick={handleTraining}
              disabled={startTraining.isPending}
            >
              <GraduationCap className="size-4" />
              {active?.type === 'training' ? 'End training / meeting' : 'Training / Meeting'}
            </Button>
          </>
        )}
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="size-4" />
          Logout
        </Button>
      </div>
    </header>
  )
}
