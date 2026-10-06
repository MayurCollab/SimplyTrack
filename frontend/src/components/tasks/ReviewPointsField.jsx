import { useState } from 'react'
import { Controller, useFieldArray } from 'react-hook-form'
import { format } from 'date-fns'
import { History, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { MentionField } from '@/components/shared/MentionField'
import { useNotificationMutations } from '@/hooks/useNotifications'
import { cn } from '@/lib/utils'

const ACTION_STYLES = {
  added: 'bg-emerald-50 text-emerald-700',
  updated: 'bg-sky-50 text-sky-700',
  removed: 'bg-red-50 text-red-700',
}

const ACTION_LABELS = {
  added: 'Added',
  updated: 'Updated',
  removed: 'Removed',
}

function ReviewPointsHistoryDialog({ open, history, onClose }) {
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
        aria-labelledby="review-history-title"
        className="modal-panel relative flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-white shadow-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <h3 id="review-history-title" className="text-lg font-semibold text-foreground">
            Review Points History
          </h3>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No history yet. Changes to review points will appear here after you save.
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
                    <p className="mt-2 text-xs text-muted-foreground">
                      <span className="line-through">{entry.previousDescription || '-'}</span>
                      {' → '}
                      <span className="text-sm font-medium text-foreground">
                        {entry.description || '-'}
                      </span>
                    </p>
                  ) : (
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {entry.description || 'Untitled review point'}
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

function PointReplies({
  taskId,
  pointId,
  replies = [],
  canReply,
  onTaskUpdated,
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const { replyToReviewPoint } = useNotificationMutations()

  if (!pointId) return null

  async function handleSend() {
    const message = text.trim()
    if (message.length < 2 || !taskId) return
    const res = await replyToReviewPoint.mutateAsync({
      taskId,
      pointId,
      message,
    })
    setText('')
    setOpen(false)
    onTaskUpdated?.(res.data?.data)
  }

  return (
    <div className="space-y-2 border-t border-border/70 pt-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          Replies {replies.length > 0 ? `(${replies.length})` : ''}
        </p>
        {canReply && taskId && (
          <button
            type="button"
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Cancel' : 'Reply'}
          </button>
        )}
      </div>

      {replies.length === 0 && !open && (
        <p className="text-xs text-muted-foreground">No replies yet.</p>
      )}

      {replies.length > 0 && (
        <ul className="space-y-2">
          {replies.map((reply) => (
            <li
              key={reply._id || `${reply.authorId}-${reply.createdAt}`}
              className="rounded-md border border-border/80 bg-white px-2.5 py-2"
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-xs font-semibold text-foreground">
                  {reply.authorName || 'User'}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {reply.createdAt
                    ? format(new Date(reply.createdAt), 'dd/MM/yyyy HH:mm')
                    : ''}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                {reply.message}
              </p>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="space-y-2">
          <Textarea
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a reply…"
            className="min-h-[4rem] text-sm"
          />
          <Button
            type="button"
            size="sm"
            disabled={text.trim().length < 2 || replyToReviewPoint.isPending}
            onClick={handleSend}
          >
            {replyToReviewPoint.isPending ? 'Sending…' : 'Send reply'}
          </Button>
        </div>
      )}
    </div>
  )
}

export function ReviewPointsField({
  control,
  register,
  errors,
  disabled,
  history = [],
  users = [],
  taskId,
  savedPoints = [],
  onTaskUpdated,
}) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'reviewPoints',
  })

  const savedById = new Map(
    (savedPoints || []).filter((p) => p?._id).map((p) => [String(p._id), p])
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <p className="text-sm font-medium text-foreground">Review Points</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="relative size-8 px-0 text-muted-foreground hover:text-foreground"
            onClick={() => setHistoryOpen(true)}
            title="View review points history"
            aria-label="View review points history"
          >
            <History className="size-4" />
            {history.length > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[9px] text-primary-foreground">
                {history.length > 99 ? '99+' : history.length}
              </span>
            ) : null}
          </Button>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => append({ description: '' })}
        >
          <Plus className="size-3.5" />
          Add
        </Button>
      </div>

      {fields.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No review points yet. Click Add to create one under remarks.
        </p>
      ) : (
        <div className="space-y-3">
          {fields.map((field, index) => {
            const rowError = errors?.reviewPoints?.[index]
            const pointId = field._id
            const saved = pointId ? savedById.get(String(pointId)) : null
            const replies = saved?.replies || []

            return (
              <div
                key={field.id}
                className="space-y-3 rounded-lg border border-border bg-muted/20 p-3"
              >
                {field._id ? (
                  <input type="hidden" {...register(`reviewPoints.${index}._id`)} />
                ) : null}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">
                      Description
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="size-8 px-0 text-muted-foreground hover:text-red-600"
                      disabled={disabled}
                      onClick={() => remove(index)}
                      title="Remove review point"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <Controller
                    control={control}
                    name={`reviewPoints.${index}.description`}
                    render={({ field: descField }) => (
                      <MentionField
                        id={`reviewPoints-${index}-description`}
                        multiline
                        rows={3}
                        value={descField.value || ''}
                        onChange={descField.onChange}
                        onBlur={descField.onBlur}
                        ref={descField.ref}
                        users={users}
                        disabled={disabled}
                        placeholder="Type @ to tag a teammate"
                      />
                    )}
                  />
                  {rowError?.description?.message && (
                    <p className="text-xs text-red-600">
                      {rowError.description.message}
                    </p>
                  )}
                </div>

                {pointId && (
                  <PointReplies
                    taskId={taskId}
                    pointId={pointId}
                    replies={replies}
                    canReply={Boolean(taskId)}
                    onTaskUpdated={onTaskUpdated}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      <ReviewPointsHistoryDialog
        open={historyOpen}
        history={history}
        onClose={() => setHistoryOpen(false)}
      />
    </div>
  )
}
