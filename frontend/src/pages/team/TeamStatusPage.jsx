import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '@/lib/api'
import { usePermission } from '@/hooks/usePermissions'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatElapsed, formatMinutesAsHms, formatClockTime } from '@/lib/time'
import { cn } from '@/lib/utils'

const STATUS_META = {
  on_task: { label: 'On task', className: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  on_break: { label: 'On break', className: 'bg-amber-50 text-amber-900 ring-amber-200' },
  on_training: { label: 'Training', className: 'bg-sky-50 text-sky-800 ring-sky-200' },
  pending_note: { label: 'Pending note', className: 'bg-violet-50 text-violet-800 ring-violet-200' },
  idle: { label: 'Idle', className: 'bg-slate-100 text-slate-600 ring-slate-200' },
}

function LiveElapsed({ startedAt }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return <span className="font-mono text-sm tabular-nums">{formatElapsed(startedAt, now)}</span>
}

function MemberRow({ member, canStop, onStop }) {
  const meta = STATUS_META[member.status] || STATUS_META.idle
  const activity = member.activeSession || member.pendingNote
  const task = activity?.task

  return (
    <tr className="border-b border-border last:border-0 even:bg-slate-50/60">
      <td className="px-4 py-3">
        <p className="font-semibold text-slate-900">{member.name}</p>
        <p className="text-xs text-muted-foreground">{member.email}</p>
      </td>
      <td className="px-4 py-3">
        <span
          className={cn(
            'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1',
            meta.className
          )}
        >
          {meta.label}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-slate-700">
        {task ? (
          <span>
            <span className="font-medium">{task.taskCode}</span> — {task.title}
          </span>
        ) : activity?.type === 'break' ? (
          'Break'
        ) : activity?.type === 'training' ? (
          'Training'
        ) : (
          '—'
        )}
        {activity?.startedAt && member.status !== 'idle' ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Since {formatClockTime(activity.startedAt)}
            {activity.stoppedAt == null ? (
              <>
                {' '}
                · <LiveElapsed startedAt={activity.startedAt} />
              </>
            ) : null}
          </p>
        ) : null}
      </td>
      <td className="px-4 py-3 text-sm">
        <div className="space-y-0.5 font-mono text-xs tabular-nums">
          <p>Task {formatMinutesAsHms(member.today?.taskMinutes)}</p>
          <p className="text-muted-foreground">
            Break {formatMinutesAsHms(member.today?.breakMinutes)}
            {member.today?.breakOverAllowance ? (
              <Badge variant="outline" className="ml-1 font-sans text-[10px]">
                Over allowance
              </Badge>
            ) : null}
          </p>
          {(member.today?.trainingMinutes || 0) > 0 ? (
            <p className="text-muted-foreground">
              Training {formatMinutesAsHms(member.today?.trainingMinutes)}
            </p>
          ) : null}
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {member.lastLoginAt ? (
          <>
            <p>{formatClockTime(member.lastLoginAt)}</p>
            {member.lastLoginIp ? <p className="mt-0.5 font-mono">{member.lastLoginIp}</p> : null}
          </>
        ) : (
          'Never'
        )}
      </td>
      <td className="px-4 py-3 text-right">
        {canStop && member.activeSession?.stoppedAt == null && member.activeSession ? (
          <Button type="button" size="sm" variant="outline" onClick={() => onStop(member)}>
            Stop timer
          </Button>
        ) : null}
      </td>
    </tr>
  )
}

export default function TeamStatusPage() {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const { allowed: canView } = usePermission('team_status', 'view')
  const { allowed: canStop } = usePermission('team_status', 'edit')
  const [stopTarget, setStopTarget] = useState(null)
  const [reason, setReason] = useState('')

  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['team-status'],
    queryFn: async () => {
      const { data } = await api.get('/team-status')
      return data.data
    },
    enabled: canView,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  })

  const stopTimer = useMutation({
    mutationFn: ({ userId, reason: stopReason }) =>
      api.post(`/team-status/users/${userId}/stop-timer`, { reason: stopReason }),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Timer stopped')
      setStopTarget(null)
      setReason('')
      qc.invalidateQueries({ queryKey: ['team-status'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not stop timer'),
  })

  const groups = (data?.groups || []).filter((g) => (g.members?.length || 0) > 0)
  const isOwnerView = user?.role === 'owner' || user?.role === 'super_admin'

  if (!canView) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        You do not have permission to view team status.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Team status</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isOwnerView
              ? 'Managers and staff grouped by reporting manager. Updates every 10 seconds.'
              : 'Your direct reports. Updates every 10 seconds.'}
          </p>
        </div>
        {dataUpdatedAt ? (
          <p className="text-xs text-muted-foreground">
            Updated {new Date(dataUpdatedAt).toLocaleTimeString()}
            {data?.timezone ? ` · ${data.timezone}` : ''}
          </p>
        ) : null}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading team status…</p>
      ) : (
        groups.map((group) => (
          <section key={group.managerId || 'none'} className="overflow-hidden rounded-xl border border-border bg-white">
            {isOwnerView ? (
              <div className="border-b border-indigo-100 bg-indigo-50/80 px-4 py-2">
                <h2 className="text-sm font-bold text-indigo-900">{group.managerName}</h2>
                <p className="text-xs text-indigo-700/80">{group.members?.length || 0} members</p>
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-sm">
                <thead className="border-b border-border bg-slate-50/80 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-4 py-2.5">Member</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Current activity</th>
                    <th className="px-4 py-2.5">Today</th>
                    <th className="px-4 py-2.5">Last login</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(group.members || []).map((member) => (
                    <MemberRow
                      key={member.userId}
                      member={member}
                      canStop={canStop}
                      onStop={setStopTarget}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}

      {stopTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Stop timer</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Stop {stopTarget.name}&apos;s active timer. The session will close with a note:
              &quot;Closed by [you]&quot; (optional reason below).
            </p>
            <textarea
              className="mt-3 w-full rounded-lg border border-border px-3 py-2 text-sm"
              rows={3}
              placeholder="Optional reason (shown in the closing note)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setStopTarget(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={stopTimer.isPending}
                onClick={() =>
                  stopTimer.mutate({ userId: stopTarget.userId, reason: reason.trim() })
                }
              >
                {stopTimer.isPending ? 'Stopping…' : 'Stop timer'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
