import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/form-field'

function todayInput() {
  return new Date().toISOString().slice(0, 10)
}

export function CompleteTaskDialog({ open, task, loading, onConfirm, onCancel }) {
  const [completionDate, setCompletionDate] = useState(todayInput())
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setCompletionDate(todayInput())
      setError('')
    }
  }, [open, task?._id])

  if (!open) return null

  async function handleConfirm() {
    if (!completionDate) {
      setError('Completion date is required')
      return
    }
    setError('')
    await onConfirm({ completionDate })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="modal-backdrop absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden
      />
      <div className="modal-panel relative w-full max-w-sm rounded-xl border border-border bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-foreground">Mark Task Complete</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {task?.taskCode ? `${task.taskCode} — ` : ''}
          {task?.title || 'Task'}
        </p>
        <div className="mt-4 space-y-4">
          <FormField label="Task Completion Date" htmlFor="completionDate" error={error}>
            <Input
              id="completionDate"
              type="date"
              value={completionDate}
              onChange={(e) => setCompletionDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Backdated dates are allowed.</p>
          </FormField>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading ? 'Saving…' : 'Mark Complete'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function IgnoreTaskDialog({ open, task, loading, onConfirm, onCancel }) {
  const [ignoreDate, setIgnoreDate] = useState(todayInput())
  const [remarks, setRemarks] = useState('')
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (open) {
      setIgnoreDate(todayInput())
      setRemarks('')
      setErrors({})
    }
  }, [open, task?._id])

  if (!open) return null

  async function handleConfirm() {
    const next = {}
    if (!ignoreDate) next.ignoreDate = 'Ignore date is required'
    if (!remarks.trim()) next.remarks = 'Remarks are required'
    setErrors(next)
    if (Object.keys(next).length) return
    await onConfirm({ ignoreDate, remarks: remarks.trim() })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="modal-backdrop absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden
      />
      <div className="modal-panel relative w-full max-w-sm rounded-xl border border-border bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-foreground">Ignore Task</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {task?.taskCode ? `${task.taskCode} — ` : ''}
          {task?.title || 'Task'}
        </p>
        <div className="mt-4 space-y-4">
          <FormField label="Ignore Date" htmlFor="ignoreDate" error={errors.ignoreDate}>
            <Input
              id="ignoreDate"
              type="date"
              value={ignoreDate}
              onChange={(e) => setIgnoreDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Backdated dates are allowed.</p>
          </FormField>
          <FormField label="Remarks" htmlFor="ignoreRemarks" error={errors.remarks}>
            <Textarea
              id="ignoreRemarks"
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Why is this task no longer required?"
            />
          </FormField>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={loading}>
            {loading ? 'Saving…' : 'Ignore Task'}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Prompt for Query Sent Date or Reply Received Date when status changes. */
export function StatusDatePromptDialog({ open, type, loading, onConfirm, onCancel }) {
  const [date, setDate] = useState(todayInput())
  const [error, setError] = useState('')

  const isQuerySent = type === 'query_sent'
  const title = isQuerySent ? 'Query Sent Date' : 'Reply Received Date'
  const description = isQuerySent
    ? 'Status is changing to Query Sent. Enter the date the query was sent.'
    : 'Leaving Waiting for Client. Enter the date the reply was received.'

  useEffect(() => {
    if (open) {
      setDate(todayInput())
      setError('')
    }
  }, [open, type])

  if (!open) return null

  async function handleConfirm() {
    if (!date) {
      setError(`${title} is required`)
      return
    }
    setError('')
    await onConfirm({ date })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="modal-backdrop absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden
      />
      <div className="modal-panel relative w-full max-w-sm rounded-xl border border-border bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        <div className="mt-4">
          <FormField label={title} htmlFor="statusDatePrompt" error={error}>
            <Input
              id="statusDatePrompt"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Backdated dates are allowed.</p>
          </FormField>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={loading}>
            Continue
          </Button>
        </div>
      </div>
    </div>
  )
}

