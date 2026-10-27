import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { OrgAccessBanner } from './OrgAccessBanner'
import { ClosingNoteDialog } from '@/components/shared/ClosingNoteDialog'
import { TASK_PHASE } from '@/config/taskModule'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

export function AppShell() {
  const accessToken = useAuthStore((s) => s.accessToken)
  const setUser = useAuthStore((s) => s.setUser)

  useEffect(() => {
    if (!accessToken) return undefined
    let cancelled = false
    api
      .get('/auth/me')
      .then(({ data }) => {
        if (!cancelled && data?.user) setUser(data.user)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [accessToken, setUser])

  return (
    <div className="flex h-full min-h-0 bg-surface">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <OrgAccessBanner />
        <main className="min-h-0 flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
      {TASK_PHASE.timer && <ClosingNoteDialog />}
    </div>
  )
}
