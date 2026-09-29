import { useAuthStore } from '@/store/authStore'

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const roleLabel = user?.role?.replace('_', ' ')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Role-aware widgets land in a later phase. Foundation auth is live.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Signed in as</p>
          <p className="mt-1 text-lg font-bold text-indigo-950">{user?.name}</p>
          <p className="mt-1 text-sm font-medium text-indigo-700">{user?.email}</p>
        </div>
        <div className="rounded-xl border border-sky-100 bg-sky-50/70 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-600">Role</p>
          <p className="mt-1 text-lg font-bold capitalize text-sky-950">{roleLabel}</p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Organization</p>
          <p className="mt-1 text-lg font-bold text-emerald-950">{user?.organizationName || '-'}</p>
        </div>
      </div>
    </div>
  )
}
