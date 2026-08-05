import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { formatMinutes } from '@/lib/time'
import { useTimerStore } from '@/store/timerStore'
import { useTimerActions } from '@/hooks/useTimer'

function sessionLabel(log) {
  if (!log) return 'Session'
  if (log.type === 'task') return log.taskId?.title || 'Task'
  if (log.type === 'break') return 'Break'
  if (log.type === 'training') return 'Training / Meeting'
  return 'Session'
}

export function ClosingNoteDialog() {
  const noteDialog = useTimerStore((s) => s.noteDialog)
  const closeNoteDialog = useTimerStore((s) => s.closeNoteDialog)
  const { stopTaskTimer, stopBreak, stopTraining, submitPendingNote } = useTimerActions()
  const [note, setNote] = useState('')

  if (!noteDialog) return null

  const { timeLog, mode } = noteDialog
  const duration =
    timeLog.systemDurationMinutes ??
    (timeLog.startedAt && timeLog.stoppedAt
      ? Math.max(0, (new Date(timeLog.stoppedAt) - new Date(timeLog.startedAt)) / 60000)
      : null)

  const saving =
    stopTaskTimer.isPending ||
    stopBreak.isPending ||
    stopTraining.isPending ||
    submitPendingNote.isPending

  const trimmedNote = note.trim()
  const noteTooShort = trimmedNote.length < 15

  async function handleSubmit(e) {
    e.preventDefault()
    if (noteTooShort) return

    if (mode === 'pending') {
      await submitPendingNote.mutateAsync({
        closingNote: trimmedNote,
        timeLogId: timeLog._id,
      })
      setNote('')
      return
    }

    // mode === 'stop' - stop the currently running session
    if (timeLog.type === 'task') {
      const taskId = timeLog.taskId?._id || timeLog.taskId
      await stopTaskTimer.mutateAsync({ taskId, closingNote: trimmedNote })
    } else if (timeLog.type === 'break') {
      await stopBreak.mutateAsync({ closingNote: trimmedNote })
    } else if (timeLog.type === 'training') {
      await stopTraining.mutateAsync({ closingNote: trimmedNote })
    }
    setNote('')
  }

  const canDismiss = mode !== 'pending'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="modal-backdrop absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={canDismiss ? closeNoteDialog : undefined}
        aria-hidden
      />
      <div className="modal-panel relative w-full max-w-md rounded-xl border border-border bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-foreground">Closing note</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {sessionLabel(timeLog)}
          {timeLog.autoClosedBySwitch ? ' (auto-stopped when switching)' : ''}
        </p>

        <div className="mt-4 rounded-lg bg-surface px-4 py-3">
          <p className="text-xs text-muted-foreground">Duration (system-computed, read-only)</p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">
            {duration != null ? formatMinutes(duration) : '-'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <Label htmlFor="closingNote" required>
              Note
            </Label>
            <textarea
              id="closingNote"
              spellCheck
              rows={4}
              required
              minLength={15}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What did you work on / why break / training or meeting notes…"
              className="mt-1.5 flex w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Minimum 15 characters ({trimmedNote.length}/15)
            </p>
            {note.length > 0 && noteTooShort && (
              <p className="mt-1 text-xs text-destructive">
                Closing note must be at least 15 characters
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            {canDismiss && (
              <Button type="button" variant="secondary" onClick={closeNoteDialog} disabled={saving}>
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={saving || noteTooShort}>
              {saving ? 'Saving…' : 'Save & continue'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
