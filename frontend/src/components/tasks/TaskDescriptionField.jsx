import { useState } from 'react'
import { format } from 'date-fns'
import { History, Pencil, Save, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { MentionField } from '@/components/shared/MentionField'
import { cn } from '@/lib/utils'

const ACTION_STYLES = {
  added: 'bg-emerald-50 text-emerald-700',
  updated: 'bg-sky-50 text-sky-700',
}

const ACTION_LABELS = {
  added: 'Saved',
  updated: 'Updated',
}

function DescriptionHistoryDialog({ open, history, onClose }) {
  if (!open) return null

  const entries = [...(history || [])].sort(
    (a, b) => new Date(b.changedAt || 0) - new Date(a.changedAt || 0)
  )

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="modal-backdrop absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-description-history-title"
        className="modal-panel relative flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-white shadow-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <h3
            id="task-description-history-title"
            className="text-lg font-semibold text-foreground"
          >
            Task Description History
          </h3>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No history yet. Saved changes to the task description will appear here.
            </p>
          ) : (
            <ol className="space-y-3">
              {entries.map((entry) => (
                <li
                  key={entry._id || `${entry.action}-${entry.changedAt}-${entry.description}`}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        ACTION_STYLES[entry.action] || 'bg-muted text-foreground'
                      )}
                    >
                      {ACTION_LABELS[entry.action] || entry.action}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {entry.changedAt
                        ? format(new Date(entry.changedAt), 'dd/MM/yyyy HH:mm')
                        : '-'}
                    </span>
                    {entry.changedBy?.name && (
                      <span className="text-xs text-muted-foreground">
                        · {entry.changedBy.name}
                      </span>
                    )}
                  </div>

                  {entry.action === 'updated' &&
                  entry.previousDescription !== entry.description ? (
                    <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                      <span className="line-through">{entry.previousDescription || '-'}</span>
                      {' → '}
                      <span className="text-sm font-medium text-foreground">
                        {entry.description || '-'}
                      </span>
                    </p>
                  ) : (
                    <p className="mt-2 whitespace-pre-wrap text-sm font-medium text-foreground">
                      {entry.description || '-'}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Task Description with Save / Edit / History.
 * Draft typing stays local — only Save commits to the form value + history.
 */
export function TaskDescriptionField({
  value = '',
  onChange,
  users = [],
  history = [],
  onHistoryChange,
  canSave = false,
  canEditDescription = false,
  disabled = false,
  onPersist,
}) {
  const [draft, setDraft] = useState(value || '')
  const [locked, setLocked] = useState(Boolean(String(value || '').trim()))
  const [historyOpen, setHistoryOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!canSave) {
      toast.error("You don't have permission to save task description")
      return
    }
    const next = String(draft || '').trim()
    if (!next) {
      toast.error('Enter a task description before saving')
      return
    }

    const previous = String(value || '').trim()
    if (next === previous && locked) {
      toast.message('No changes to save')
      return
    }

    const action = previous ? 'updated' : 'added'
    const entry = {
      action,
      changedAt: new Date().toISOString(),
      description: next,
      previousDescription: previous,
    }

    // Lock immediately so the UI feels instant
    setLocked(true)
    setDraft(next)
    onChange?.(next)
    setSaving(true)

    try {
      if (onPersist) {
        await onPersist(next)
      } else {
        onHistoryChange?.([...(history || []), entry])
        toast.success('Task description saved')
      }
    } catch (err) {
      // Roll back lock if persist failed (mutation toast already shown when onPersist is set)
      setLocked(false)
      setDraft(draft)
      if (!onPersist) {
        toast.error(err?.response?.data?.message || err?.message || 'Failed to save description')
      }
    } finally {
      setSaving(false)
    }
  }

  function handleEdit() {
    if (!canEditDescription) {
      toast.error("You don't have permission to edit task description")
      return
    }
    setLocked(false)
  }

  const readOnly = locked || disabled

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="description" className="mb-0">
          Task Description
        </Label>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2"
            onClick={() => setHistoryOpen(true)}
            title="History"
          >
            <History className="size-3.5" />
            <span className="text-xs">History</span>
            {(history || []).length > 0 && (
              <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold tabular-nums">
                {(history || []).length}
              </span>
            )}
          </Button>
          {locked && canEditDescription && !disabled && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2"
              onClick={handleEdit}
              title="Edit"
            >
              <Pencil className="size-3.5" />
              <span className="text-xs">Edit</span>
            </Button>
          )}
          {!locked && canSave && !disabled && (
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5 px-2.5"
              onClick={handleSave}
              disabled={saving}
            >
              <Save className="size-3.5" />
              <span className="text-xs">{saving ? 'Saving…' : 'Save'}</span>
            </Button>
          )}
        </div>
      </div>

      <MentionField
        id="description"
        multiline
        rows={3}
        value={draft}
        onChange={(v) => {
          setDraft(v)
          // Create flow: keep form in sync so Create Task includes the text.
          // Edit flow: only commit via Save so Update Task can't bypass history.
          if (!onPersist) onChange?.(v)
        }}
        users={users}
        placeholder="Type @ to tag a teammate"
        readOnly={readOnly}
        disabled={disabled}
        className={
          readOnly
            ? 'border-slate-200 bg-slate-50 text-slate-900 opacity-100 disabled:opacity-100'
            : ''
        }
      />

      <p className="text-xs text-muted-foreground">
        {locked
          ? 'Saved. Use Edit to change this description.'
          : 'Enter details, then click Save. Type @ to tag someone by name or email.'}
      </p>

      <DescriptionHistoryDialog
        open={historyOpen}
        history={history}
        onClose={() => setHistoryOpen(false)}
      />
    </div>
  )
}
