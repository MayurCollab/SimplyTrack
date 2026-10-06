import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/form-field'

function roundHours(value) {
  return Math.round(Number(value || 0) * 100) / 100
}

function defaultKeepHours(task) {
  const logged = roundHours((task?.totalLoggedMinutes || 0) / 60)
  const budget = Number(task?.budgetHours) || 0
  if (budget <= 0) return 0
  return Math.min(logged, roundHours(budget - 0.01))
}

export function ShareHoursDialog({
  open,
  task,
  users = [],
  loading,
  onConfirm,
  onCancel,
}) {
  const budget = Number(task?.budgetHours) || 0
  const [toUserId, setToUserId] = useState('')
  const [keepHours, setKeepHours] = useState('')
  const [comment, setComment] = useState('')
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (!open || !task) return
    setToUserId('')
    setKeepHours(String(defaultKeepHours(task)))
    setComment('')
    setErrors({})
  }, [open, task?._id])

  const keep = roundHours(keepHours)
  const transfer = roundHours(budget - keep)

  const members = useMemo(() => {
    const assigneeId = String(task?.assigneeId?._id || task?.assigneeId || '')
    return users.filter((u) => u.isActive !== false && String(u._id) !== assigneeId)
  }, [users, task])

  if (!open) return null

  async function handleConfirm() {
    const next = {}
    if (!toUserId) next.toUserId = 'Select a member'
    if (!(keep >= 0)) next.keepHours = 'Enter hours you will keep'
    if (!(transfer >= 0.01)) next.keepHours = 'Transfer hours must be at least 0.01'
    if (Math.abs(keep + transfer - budget) >= 0.011) {
      next.keepHours = `Keep + transfer must equal ${budget}h`
    }
    setErrors(next)
    if (Object.keys(next).length) return

    await onConfirm({
      toUserId,
      keepHours: keep,
      transferHours: transfer,
      requesterComment: comment.trim(),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="modal-backdrop absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden
      />
      <div className="modal-panel relative w-full max-w-md rounded-xl border border-border bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-foreground">Share remaining hours</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {task?.taskCode ? `${task.taskCode} — ` : ''}
          {task?.title || 'Task'}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Total budget stays <span className="font-semibold tabular-nums">{budget}h</span>. Manager
          must approve before the other member sees this shared task.
        </p>

        <div className="mt-4 space-y-4">
          <FormField label="Hours you keep" htmlFor="keepHours" error={errors.keepHours}>
            <Input
              id="keepHours"
              type="number"
              min={0}
              step={0.1}
              value={keepHours}
              onChange={(e) => setKeepHours(e.target.value)}
            />
          </FormField>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <div className="flex justify-between tabular-nums">
              <span className="text-slate-600">You keep</span>
              <span className="font-semibold text-slate-900">{keep.toFixed(1)}h</span>
            </div>
            <div className="mt-1 flex justify-between tabular-nums">
              <span className="text-slate-600">Share with member</span>
              <span className="font-semibold text-indigo-700">{transfer.toFixed(1)}h</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 tabular-nums">
              <span className="text-slate-600">Total budget</span>
              <span className="font-semibold text-slate-900">{budget.toFixed(1)}h</span>
            </div>
          </div>

          <FormField label="Share with" htmlFor="toUserId" error={errors.toUserId}>
            <Select id="toUserId" value={toUserId} onChange={(e) => setToUserId(e.target.value)}>
              <option value="">Select member…</option>
              {members.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Comment (optional)" htmlFor="requesterComment">
            <Textarea
              id="requesterComment"
              rows={2}
              maxLength={300}
              placeholder="Short note for your manager…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </FormField>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading ? 'Sending…' : 'Send to manager'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function ReviewShareRequestDialog({
  open,
  request,
  decision,
  loading,
  onConfirm,
  onCancel,
}) {
  const [comment, setComment] = useState('')

  useEffect(() => {
    if (open) setComment('')
  }, [open, request?._id, decision])

  if (!open || !request) return null

  const isApprove = decision === 'approve'
  const taskLabel = request.taskId?.taskCode
    ? `${request.taskId.taskCode} — ${request.taskId.title || ''}`
    : request.taskId?.title || 'Task'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="modal-backdrop absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden
      />
      <div className="modal-panel relative w-full max-w-md rounded-xl border border-border bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-foreground">
          {isApprove ? 'Approve hour share' : 'Reject hour share'}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{taskLabel}</p>
        <div className="mt-3 space-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <p>
            <span className="text-slate-500">From</span>{' '}
            <span className="font-medium">{request.requestedById?.name || '—'}</span>
            <span className="text-slate-400"> → </span>
            <span className="font-medium">{request.toUserId?.name || '—'}</span>
          </p>
          <p className="tabular-nums text-slate-700">
            {Number(request.keepHours).toFixed(1)}h keep · {Number(request.transferHours).toFixed(1)}h
            share
          </p>
          {request.requesterComment ? (
            <p className="text-slate-600">“{request.requesterComment}”</p>
          ) : null}
        </div>

        <div className="mt-4">
          <FormField label="Your comment (optional)" htmlFor="managerComment">
            <Textarea
              id="managerComment"
              rows={2}
              maxLength={300}
              placeholder="Short note…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </FormField>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={isApprove ? 'default' : 'destructive'}
            onClick={() => onConfirm({ managerComment: comment.trim() })}
            disabled={loading}
          >
            {loading ? 'Saving…' : isApprove ? 'Approve' : 'Reject'}
          </Button>
        </div>
      </div>
    </div>
  )
}
