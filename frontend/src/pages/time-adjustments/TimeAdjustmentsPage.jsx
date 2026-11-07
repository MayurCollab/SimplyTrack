import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { usePermission } from '@/hooks/usePermissions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { formatClockTime, formatMinutesAsHms } from '@/lib/time'
import { cn } from '@/lib/utils'

function toLocalInputValue(date) {
  if (!date) return ''
  const d = new Date(date)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function defaultDateRange() {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 7)
  const fmt = (d) => d.toISOString().slice(0, 10)
  return { from: fmt(from), to: fmt(to) }
}

const STATUS_CLASS = {
  pending: 'bg-amber-50 text-amber-900 ring-amber-200',
  approved: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  rejected: 'bg-red-50 text-red-800 ring-red-200',
  cancelled: 'bg-slate-100 text-slate-600 ring-slate-200',
}

export default function TimeAdjustmentsPage() {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const isOwner = user?.role === 'owner' || user?.role === 'super_admin'
  const { allowed: canAdd } = usePermission('time_adjustments', 'add')
  const { allowed: canReview } = usePermission('time_adjustments', 'edit')

  const [range, setRange] = useState(defaultDateRange)
  const [selectedLogId, setSelectedLogId] = useState('')
  const [kind, setKind] = useState('correct_existing')
  const [requestedStart, setRequestedStart] = useState('')
  const [requestedStop, setRequestedStop] = useState('')
  const [description, setDescription] = useState('')
  const [missingType, setMissingType] = useState('break')
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [reviewTarget, setReviewTarget] = useState(null)
  const [reviewComment, setReviewComment] = useState('')
  const [appliedStart, setAppliedStart] = useState('')
  const [appliedStop, setAppliedStop] = useState('')

  const livePoll = { refetchInterval: 10_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true }

  const showTaskPicker = canAdd && kind === 'add_missing' && missingType === 'task'

  // Same source as Tasks module (open lifecycle) — do not filter by staffId or the
  // dropdown stays empty when the requester is not the assignee/helper.
  const { data: availableTasks = [], isLoading: loadingTasks } = useQuery({
    queryKey: ['tasks', 'time-adjustment-picker'],
    queryFn: async () => {
      const { data } = await api.get('/tasks', { params: { lifecycle: 'open' } })
      return data.data || []
    },
    enabled: showTaskPicker,
    staleTime: 15_000,
  })

  const taskOptions = useMemo(
    () =>
      [...availableTasks].sort((a, b) =>
        String(a.taskCode || a.title || '').localeCompare(String(b.taskCode || b.title || ''))
      ),
    [availableTasks]
  )

  const { data: requests = [], isLoading: loadingRequests, dataUpdatedAt } = useQuery({
    queryKey: ['time-adjustments'],
    queryFn: async () => {
      const { data } = await api.get('/time-adjustment-requests', { params: { status: 'all' } })
      return data.data || []
    },
    ...livePoll,
  })

  const { data: myLogs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ['timelogs', 'mine', range.from, range.to],
    queryFn: async () => {
      const { data } = await api.get('/timelogs/mine', { params: range })
      return data.data || []
    },
    enabled: canAdd && kind === 'correct_existing',
    ...livePoll,
  })

  const selectedLog = useMemo(
    () => myLogs.find((l) => String(l._id) === String(selectedLogId)),
    [myLogs, selectedLogId]
  )

  const createRequest = useMutation({
    mutationFn: (body) => api.post('/time-adjustment-requests', body),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Request submitted')
      setDescription('')
      setSelectedLogId('')
      setSelectedTaskId('')
      qc.invalidateQueries({ queryKey: ['time-adjustments'] })
      qc.invalidateQueries({ queryKey: ['timelogs', 'mine'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not submit request'),
  })

  const reviewRequest = useMutation({
    mutationFn: ({ id, action, body }) => api.post(`/time-adjustment-requests/${id}/${action}`, body),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Updated')
      setReviewTarget(null)
      setReviewComment('')
      qc.invalidateQueries({ queryKey: ['time-adjustments'] })
      qc.invalidateQueries({ queryKey: ['timelogs', 'mine'] })
      qc.invalidateQueries({ queryKey: ['timelogs', 'active'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Action failed'),
  })

  function onSelectLog(logId) {
    setSelectedLogId(logId)
    const log = myLogs.find((l) => String(l._id) === logId)
    if (log) {
      setRequestedStart(toLocalInputValue(log.startedAt))
      setRequestedStop(toLocalInputValue(log.stoppedAt))
    }
  }

  function submitCreate(e) {
    e.preventDefault()
    const body = {
      kind,
      description,
      requestedStartedAt: new Date(requestedStart).toISOString(),
      requestedStoppedAt: new Date(requestedStop).toISOString(),
    }
    if (kind === 'correct_existing') {
      if (!selectedLogId) {
        toast.error('Select a completed session')
        return
      }
      body.timeLogId = selectedLogId
    } else {
      body.type = missingType
      if (missingType === 'task') {
        if (!selectedTaskId) {
          toast.error('Select the task you worked on')
          return
        }
        body.taskId = selectedTaskId
      }
    }
    createRequest.mutate(body)
  }

  function onMissingTypeChange(value) {
    setMissingType(value)
    setSelectedTaskId('')
  }

  function openReview(row) {
    setReviewTarget(row)
    setReviewComment('')
    setAppliedStart(toLocalInputValue(row.requestedStartedAt))
    setAppliedStop(toLocalInputValue(row.requestedStoppedAt))
  }

  if (!canAdd && !isOwner && !canReview) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        You do not have access to time adjustments.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Time adjustments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Request corrections to your timer sessions. Owners review and apply changes. This list
          refreshes every 10 seconds.
        </p>
        {dataUpdatedAt ? (
          <p className="text-xs text-muted-foreground">
            Last updated {new Date(dataUpdatedAt).toLocaleTimeString()}
          </p>
        ) : null}
      </div>

      {canAdd ? (
        <form
          onSubmit={submitCreate}
          className="space-y-4 rounded-xl border border-border bg-white p-4 shadow-sm"
        >
          <h2 className="text-sm font-bold text-slate-800">New request</h2>
          <div className="flex flex-wrap gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Kind</span>
              <Select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="correct_existing">Correct existing session</option>
                <option value="add_missing">Add missing session</option>
              </Select>
            </label>
            {kind === 'add_missing' ? (
              <label className="text-sm">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Type</span>
                <Select value={missingType} onChange={(e) => onMissingTypeChange(e.target.value)}>
                  <option value="break">Break</option>
                  <option value="training">Training</option>
                  <option value="task">Task</option>
                </Select>
              </label>
            ) : (
              <>
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">From</span>
                  <Input
                    type="date"
                    value={range.from}
                    onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">To</span>
                  <Input
                    type="date"
                    value={range.to}
                    onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                  />
                </label>
              </>
            )}
          </div>

          {kind === 'correct_existing' ? (
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Session</span>
              <Select
                value={selectedLogId}
                onChange={(e) => onSelectLog(e.target.value)}
                disabled={loadingLogs}
              >
                <option value="">Select a completed session…</option>
                {myLogs.map((log) => (
                  <option key={log._id} value={log._id}>
                    {formatClockTime(log.startedAt)} – {formatClockTime(log.stoppedAt)} · {log.type}
                    {log.taskId?.taskCode ? ` · ${log.taskId.taskCode}` : ''}
                  </option>
                ))}
              </Select>
              {selectedLog ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Recorded duration:{' '}
                  {formatMinutesAsHms(
                    selectedLog.correctedDurationMinutes ?? selectedLog.systemDurationMinutes
                  )}
                </p>
              ) : null}
            </label>
          ) : null}

          {showTaskPicker ? (
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Task you worked on
              </span>
              <Select
                value={selectedTaskId}
                onChange={(e) => setSelectedTaskId(e.target.value)}
                disabled={loadingTasks}
                required
              >
                <option value="">
                  {loadingTasks ? 'Loading tasks…' : 'Select a task…'}
                </option>
                {taskOptions.map((task) => (
                  <option key={task._id} value={task._id}>
                    {task.taskCode ? `${task.taskCode} — ` : ''}
                    {task.title || 'Untitled'}
                  </option>
                ))}
              </Select>
              {!loadingTasks && taskOptions.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  No open tasks available. Create or open a task first.
                </p>
              ) : null}
            </label>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Requested start
              </span>
              <Input
                type="datetime-local"
                value={requestedStart}
                onChange={(e) => setRequestedStart(e.target.value)}
                required
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Requested stop
              </span>
              <Input
                type="datetime-local"
                value={requestedStop}
                onChange={(e) => setRequestedStop(e.target.value)}
                required
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              Description (min 10 characters)
            </span>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              required
              minLength={10}
            />
          </label>

          <Button type="submit" disabled={createRequest.isPending}>
            {createRequest.isPending ? 'Submitting…' : 'Submit request'}
          </Button>
        </form>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-border bg-white">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-bold text-slate-800">
            {isOwner ? 'All requests' : 'My requests'}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50/80 text-xs uppercase text-slate-600">
              <tr>
                <th className="px-4 py-2">Ticket</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">When</th>
                <th className="px-4 py-2">Description</th>
                {isOwner && canReview ? <th className="px-4 py-2 text-right">Review</th> : null}
              </tr>
            </thead>
            <tbody>
              {loadingRequests ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-muted-foreground">
                    No requests yet.
                  </td>
                </tr>
              ) : (
                requests.map((row) => (
                  <tr key={row._id} className="border-t border-border even:bg-slate-50/50">
                    <td className="px-4 py-3 font-mono text-xs font-semibold">{row.ticketNumber}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold capitalize ring-1',
                          STATUS_CLASS[row.status] || STATUS_CLASS.pending
                        )}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatClockTime(row.requestedStartedAt)} –{' '}
                      {formatClockTime(row.requestedStoppedAt)}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-sm" title={row.description}>
                      {row.description}
                    </td>
                    {isOwner && canReview ? (
                      <td className="px-4 py-3 text-right">
                        {row.status === 'pending' ? (
                          <Button type="button" size="sm" variant="outline" onClick={() => openReview(row)}>
                            Review
                          </Button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {reviewTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-bold">{reviewTarget.ticketNumber}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{reviewTarget.description}</p>
            <p className="mt-2 text-xs text-slate-600">
              Requested: {formatClockTime(reviewTarget.requestedStartedAt)} –{' '}
              {formatClockTime(reviewTarget.requestedStoppedAt)}
            </p>
            {reviewTarget.originalStartedAt ? (
              <p className="text-xs text-slate-600">
                Original: {formatClockTime(reviewTarget.originalStartedAt)} –{' '}
                {formatClockTime(reviewTarget.originalStoppedAt)}
              </p>
            ) : null}

            <label className="mt-4 block text-sm">
              <span className="mb-1 block text-xs font-medium">Applied start (optional adjust)</span>
              <Input
                type="datetime-local"
                value={appliedStart}
                onChange={(e) => setAppliedStart(e.target.value)}
              />
            </label>
            <label className="mt-2 block text-sm">
              <span className="mb-1 block text-xs font-medium">Applied stop</span>
              <Input
                type="datetime-local"
                value={appliedStop}
                onChange={(e) => setAppliedStop(e.target.value)}
              />
            </label>
            <label className="mt-2 block text-sm">
              <span className="mb-1 block text-xs font-medium">Comment</span>
              <Textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} rows={2} />
            </label>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setReviewTarget(null)}>
                Close
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={reviewRequest.isPending}
                onClick={() =>
                  reviewRequest.mutate({
                    id: reviewTarget._id,
                    action: 'reject',
                    body: { reviewerComment: reviewComment },
                  })
                }
              >
                Reject
              </Button>
              <Button
                type="button"
                disabled={reviewRequest.isPending}
                onClick={() =>
                  reviewRequest.mutate({
                    id: reviewTarget._id,
                    action: 'approve',
                    body: {
                      reviewerComment: reviewComment,
                      appliedStartedAt: new Date(appliedStart).toISOString(),
                      appliedStoppedAt: new Date(appliedStop).toISOString(),
                    },
                  })
                }
              >
                Approve
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
