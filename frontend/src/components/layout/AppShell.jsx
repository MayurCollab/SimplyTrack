import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { ClosingNoteDialog } from '@/components/shared/ClosingNoteDialog'
import { TASK_PHASE } from '@/config/taskModule'

export function AppShell() {
  return (
    <div className="flex h-full min-h-0 bg-surface">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-h-0 flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
      {TASK_PHASE.timer && <ClosingNoteDialog />}
    </div>
  )
}
