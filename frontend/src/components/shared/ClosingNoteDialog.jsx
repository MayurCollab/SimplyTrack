import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatElapsed, formatTimeLogDuration } from '@/lib/time'
import { useTimerStore } from '@/store/timerStore'
import { useTimerActions } from '@/hooks/useTimer'
import { useStages } from '@/hooks/useMasters'
import { SearchableSelect } from '@/components/ui/searchable-select'

function sessionLabel(log) {
  if (!log) return 'Session'
  if (log.type === 'task') return log.taskId?.title || 'Task'
  if (log.type === 'break') return 'Break'
  if (log.type === 'training') return 'Training / Meeting'
  return 'Session'
}

function switchTargetLabel(pendingAction) {
  if (!pendingAction) return 'new session'
  if (pendingAction.type === 'task') return 'new task timer'
  if (pendingAction.type === 'break') return 'break'
  if (pendingAction.type === 'training') return 'training / meeting'
  return 'new session'
}

export function ClosingNoteDialog() {
  const noteDialog = useTimerStore((s) => s.noteDialog)
  const closeNoteDialog = useTimerStore((s) => s.closeNoteDialog)
  const { stopTaskTimer, stopBreak, stopTraining, submitPendingNote, completeTimerSwitch } =
    useTimerActions()
  const [note, setNote] = useState('')
  const [closingNoteStageId, setClosingNoteStageId] = useState('')
  const [now, setNow] = useState(Date.now())
  const { data: closingNoteStages = [] } = useStages('', 'closing_note')

  const saving =
    stopTaskTimer.isPending ||
    stopBreak.isPending ||
    stopTraining.isPending ||
    submitPendingNote.isPending ||
    completeTimerSwitch.isPending

  const isRunning = noteDialog && !noteDialog.timeLog?.stoppedAt

  useEffect(() => {
    if (!isRunning) return undefined
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [isRunning])

  useEffect(() => {
    if (!noteDialog) return

    setNote('')
    setClosingNoteStageId('')

    function handleKeyDown(event) {
      if (event.key !== 'Escape' || saving) return
      event.preventDefault()
      closeNoteDialog()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [noteDialog, closeNoteDialog, saving])

  if (!noteDialog) return null

  const { timeLog, mode, pendingAction } = noteDialog
  const durationLabel = isRunning
    ? formatElapsed(timeLog.startedAt, now)
    : formatTimeLogDuration(timeLog)

  const trimmedNote = note.trim()
  const noteTooShort = trimmedNote.length < 10
  const needsStage = timeLog.type !== 'break'
  const stageMissing = needsStage && !closingNoteStageId

  function handleCancel() {
    if (saving) return
    closeNoteDialog()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (noteTooShort || stageMissing) return

    if (mode === 'pending') {
      await submitPendingNote.mutateAsync({
        closingNote: trimmedNote,
        ...(needsStage ? { closingNoteStageId } : {}),
        timeLogId: timeLog._id,
      })
      setNote('')
      setClosingNoteStageId('')
      return
    }

    if (mode === 'switch') {
      await completeTimerSwitch.mutateAsync({
        timeLog,
        closingNote: trimmedNote,
        ...(needsStage ? { closingNoteStageId } : {}),
        pendingAction,
      })
      setNote('')
      setClosingNoteStageId('')
      return
    }

    // mode === 'stop' - stop the currently running session
    if (timeLog.type === 'task') {
      const taskId = timeLog.taskId?._id || timeLog.taskId
      await stopTaskTimer.mutateAsync({ taskId, closingNote: trimmedNote, closingNoteStageId })
    } else if (timeLog.type === 'break') {
      await stopBreak.mutateAsync({ closingNote: trimmedNote })
    } else if (timeLog.type === 'training') {
      await stopTraining.mutateAsync({ closingNote: trimmedNote, closingNoteStageId })
    }
    setNote('')
    setClosingNoteStageId('')
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="modal-backdrop absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleCancel}
        aria-hidden
      />
      <div className="modal-panel relative w-full max-w-md rounded-xl border border-border bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-foreground">Closing note</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {sessionLabel(timeLog)}
          {mode === 'switch'
            ? ` - add a note to switch to ${switchTargetLabel(pendingAction)}`
            : timeLog.autoClosedBySwitch
              ? ' (auto-stopped when switching)'
              : ''}
        </p>

        <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50/60 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Duration</p>
          <p className="mt-0.5 text-xl font-bold tabular-nums text-indigo-950">
            {durationLabel ?? '-'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {needsStage && (
            <div>
              <Label htmlFor="closingNoteStageSearch" required>
                Closing note stage
              </Label>
              <SearchableSelect
                id="closingNoteStageSearch"
                value={closingNoteStageId}
                onChange={setClosingNoteStageId}
                options={closingNoteStages
                  .filter((s) => s.isActive !== false)
                  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name))
                  .map((s) => ({ value: s._id, label: s.name }))}
                placeholder="Search stage..."
              />
              {stageMissing && (
                <p className="mt-1 text-xs text-muted-foreground">Please select a stage before saving.</p>
              )}
            </div>
          )}
          <div>
            <Label htmlFor="closingNote" required>
              Note
            </Label>
            <Textarea
              id="closingNote"
              rows={4}
              required
              minLength={10}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What did you work on / why break / training or meeting notes…"
              className="mt-1.5"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Minimum 10 characters ({trimmedNote.length}/10)
            </p>
            {note.length > 0 && noteTooShort && (
              <p className="mt-1 text-xs text-destructive">
                Closing note must be at least 10 characters
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={handleCancel} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || noteTooShort || stageMissing}>
              {saving ? 'Saving…' : mode === 'switch' ? 'Save & switch' : 'Save & continue'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
