import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Controller, useFieldArray, useWatch } from 'react-hook-form'
import { format } from 'date-fns'
import {
  Maximize2,
  Minimize2,
  Pencil,
  Reply,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MentionField } from '@/components/shared/MentionField'
import { useNotificationMutations } from '@/hooks/useNotifications'
import { useAuthStore } from '@/store/authStore'
import api from '@/lib/api'
import { cn } from '@/lib/utils'

function previewText(value, max = 100) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function QuoteCard({ authorName, preview, mine = false }) {
  if (!preview) return null
  return (
    <div
      className={cn(
        'mb-1 rounded border-l-[3px] px-2 py-1 text-[11px]',
        mine
          ? 'border-indigo-200 bg-indigo-500/20 text-indigo-50'
          : 'border-indigo-400 bg-indigo-50 text-slate-600'
      )}
    >
      <p className={cn('font-semibold', mine ? 'text-indigo-100' : 'text-indigo-700')}>
        {authorName || 'Message'}
      </p>
      <p className="line-clamp-2 opacity-90">{preview}</p>
    </div>
  )
}

function MessageActions({ onReply, onEdit, onDelete, canReply, canEdit, canDelete }) {
  if (!canReply && !canEdit && !canDelete) return null
  return (
    <div className="absolute -top-3 right-1 z-10 flex items-center gap-0.5 rounded-full border border-slate-200 bg-white px-0.5 py-0.5 shadow-sm opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      {canReply && (
        <button
          type="button"
          title="Reply"
          onClick={onReply}
          className="rounded-full p-1 text-indigo-600 hover:bg-indigo-50"
        >
          <Reply className="size-3.5" />
        </button>
      )}
      {canEdit && (
        <button
          type="button"
          title="Edit"
          onClick={onEdit}
          className="rounded-full p-1 text-slate-600 hover:bg-slate-100"
        >
          <Pencil className="size-3.5" />
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          title="Delete"
          onClick={onDelete}
          className="rounded-full p-1 text-red-600 hover:bg-red-50"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  )
}

function ChatBubble({
  mine,
  authorName,
  timeLabel,
  message,
  quote,
  isRoot,
  isEdited,
  isDeleted,
  onReply,
  onEdit,
  onDelete,
  canReply,
  canEdit,
  canDelete,
}) {
  return (
    <div className={cn('group relative flex w-full', mine ? 'justify-end' : 'justify-start')}>
      <div className={cn('relative max-w-[88%] sm:max-w-[78%]')}>
        {!isDeleted && (
          <MessageActions
            canReply={canReply}
            canEdit={canEdit}
            canDelete={canDelete}
            onReply={onReply}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        )}

        <div
          className={cn(
            'rounded-2xl px-3 py-1.5 shadow-sm',
            isDeleted
              ? 'border border-dashed border-slate-300 bg-slate-100 text-slate-500'
              : mine
                ? 'rounded-br-md bg-indigo-600 text-white'
                : 'rounded-bl-md border border-slate-200 bg-white text-slate-900'
          )}
        >
          <div
            className={cn(
              'mb-0.5 flex flex-wrap items-center gap-x-2 gap-y-0 text-[10px]',
              isDeleted ? 'text-slate-500' : mine ? 'text-indigo-100' : 'text-slate-500'
            )}
          >
            <span className={cn('font-semibold', !isDeleted && !mine && 'text-slate-700')}>
              {mine ? 'You' : authorName || 'User'}
            </span>
            {isRoot && !isDeleted && (
              <span className="rounded bg-amber-100 px-1 py-px font-medium text-amber-800">
                Review point
              </span>
            )}
            {timeLabel ? <span>{timeLabel}</span> : null}
            {isEdited && !isDeleted ? <span className="italic">edited</span> : null}
          </div>

          {isDeleted ? (
            <p className="text-sm italic">This message was deleted</p>
          ) : (
            <>
              {quote?.preview ? (
                <QuoteCard authorName={quote.authorName} preview={quote.preview} mine={mine} />
              ) : null}
              <p className="whitespace-pre-wrap text-sm leading-snug">{message}</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ReviewConversation({
  taskId,
  pointId,
  rootDescription,
  rootEditedAt,
  rootDeletedAt,
  replies = [],
  disabled,
  onTaskUpdated,
  users = [],
  maximized,
  onToggleMaximize,
}) {
  const currentUser = useAuthStore((s) => s.user)
  const {
    replyToReviewPoint,
    editReviewPointReply,
    softDeleteReviewPointReply,
    updateReviewPointRoot,
  } = useNotificationMutations()

  const [text, setText] = useState('')
  const [replyTarget, setReplyTarget] = useState(null)
  const [editing, setEditing] = useState(null) // { kind: 'root'|'reply', id?, draft }
  const [localReplies, setLocalReplies] = useState(null)
  const scrollRef = useRef(null)
  // Session user exposes both id and _id; either must match reply.authorId for right-side bubbles
  const myId = String(currentUser?._id || currentUser?.id || '')

  // Prefer server replies; fall back to optimistic local list while sending
  const displayReplies = localReplies ?? replies

  useEffect(() => {
    setLocalReplies(null)
  }, [replies])

  const onTaskUpdatedRef = useRef(onTaskUpdated)
  const localRepliesRef = useRef(localReplies)
  useEffect(() => {
    onTaskUpdatedRef.current = onTaskUpdated
  }, [onTaskUpdated])
  useEffect(() => {
    localRepliesRef.current = localReplies
  }, [localReplies])

  // Live-sync chat for the other member (edits/deletes/new replies) while sheet is open
  useEffect(() => {
    if (!taskId || !pointId) return
    let cancelled = false

    async function syncChat() {
      // Don't overwrite an in-flight optimistic edit/delete
      if (localRepliesRef.current) return
      try {
        const { data } = await api.get(`/tasks/${taskId}`)
        if (cancelled || !data?.data) return
        const point = (data.data.reviewPoints || []).find(
          (p) => String(p._id) === String(pointId)
        )
        if (!point) return
        onTaskUpdatedRef.current?.({
          __chatSync: true,
          pointId,
          replies: point.replies || [],
          description: point.description,
          descriptionEditedAt: point.descriptionEditedAt,
          descriptionDeletedAt: point.descriptionDeletedAt,
        })
      } catch {
        /* ignore transient poll errors */
      }
    }

    const timer = setInterval(syncChat, 4000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [taskId, pointId])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [displayReplies.length, rootDescription, rootDeletedAt, maximized])

  function canManageReply(reply) {
    if (disabled) return false
    const role = currentUser?.role
    if (
      currentUser?.isSuperAdmin ||
      role === 'owner' ||
      role === 'manager' ||
      role === 'super_admin'
    ) {
      return true
    }
    if (!myId) return false
    const author = String(reply.authorId?._id || reply.authorId || '')
    return author === myId
  }

  function startReplyToRoot() {
    if (rootDeletedAt) return
    setEditing(null)
    setReplyTarget({
      id: null,
      authorName: 'Review point',
      preview: previewText(rootDescription),
      isRoot: true,
    })
  }

  function startReplyToMessage(reply) {
    if (reply.deletedAt) return
    setEditing(null)
    setReplyTarget({
      id: reply._id,
      authorName: reply.authorName || 'User',
      preview: previewText(reply.message),
      isRoot: false,
    })
  }

  function applyReplyPayload(payload) {
    if (!payload) return
    if (payload.reply && payload.pointId) {
      onTaskUpdated?.({
        __replyPatch: true,
        taskId: payload.taskId || taskId,
        pointId: payload.pointId,
        reply: payload.reply,
      })
      return
    }
    if (payload._id) onTaskUpdated?.(payload)
  }

  async function handleSend() {
    const message = text.trim()
    if (message.length < 2 || !taskId || !pointId) return

    if (editing?.kind === 'root') {
      setEditing(null)
      setText('')
      try {
        const res = await updateReviewPointRoot.mutateAsync({
          taskId,
          pointId,
          description: message,
        })
        applyReplyPayload(res.data?.data)
      } catch {
        setText(message)
        setEditing({ kind: 'root', draft: message })
      }
      return
    }

    if (editing?.kind === 'reply') {
      const replyId = editing.id
      // Show edited text immediately (no reopen needed)
      setLocalReplies(
        (replies || []).map((r) =>
          String(r._id) === String(replyId)
            ? { ...r, message, editedAt: new Date().toISOString() }
            : r
        )
      )
      setEditing(null)
      setText('')
      try {
        const res = await editReviewPointReply.mutateAsync({
          taskId,
          pointId,
          replyId,
          message,
        })
        applyReplyPayload(res.data?.data)
        setLocalReplies(null)
      } catch {
        setLocalReplies(null)
        setText(message)
        setEditing({ kind: 'reply', id: replyId, draft: message })
      }
      return
    }

    // Optimistic bubble on the right immediately
    const optimisticId = `tmp-${Date.now()}`
    const optimistic = {
      _id: optimisticId,
      authorId: myId,
      authorName: currentUser?.name || 'You',
      message,
      replyToId: replyTarget?.id || null,
      replyToPreview: replyTarget?.preview || '',
      replyToAuthorName: replyTarget?.authorName || '',
      createdAt: new Date().toISOString(),
      editedAt: null,
      deletedAt: null,
    }
    setLocalReplies([...(replies || []), optimistic])
    setText('')
    const pendingTarget = replyTarget
    setReplyTarget(null)

    try {
      const res = await replyToReviewPoint.mutateAsync({
        taskId,
        pointId,
        message,
        replyToId: pendingTarget?.id || null,
        replyToPreview: pendingTarget?.preview || '',
        replyToAuthorName: pendingTarget?.authorName || '',
      })
      applyReplyPayload(res.data?.data)
      setLocalReplies(null)
    } catch {
      setLocalReplies(null)
      setText(message)
      setReplyTarget(pendingTarget)
    }
  }

  async function handleDeleteRoot() {
    if (!taskId || !pointId || rootDeletedAt) return
    const res = await updateReviewPointRoot.mutateAsync({
      taskId,
      pointId,
      softDelete: true,
    })
    applyReplyPayload(res.data?.data)
  }

  async function handleDeleteReply(reply) {
    if (!taskId || !pointId || reply.deletedAt) return
    // Soft-delete in UI immediately — no confirm popup
    setLocalReplies(
      (replies || []).map((r) =>
        String(r._id) === String(reply._id)
          ? { ...r, deletedAt: new Date().toISOString() }
          : r
      )
    )
    try {
      const res = await softDeleteReviewPointReply.mutateAsync({
        taskId,
        pointId,
        replyId: reply._id,
      })
      applyReplyPayload(res.data?.data)
      setLocalReplies(null)
    } catch {
      setLocalReplies(null)
    }
  }

  function beginEditRoot() {
    if (rootDeletedAt || disabled) return
    setReplyTarget(null)
    setEditing({ kind: 'root', draft: rootDescription || '' })
    setText(rootDescription || '')
  }

  function beginEditReply(reply) {
    if (reply.deletedAt || disabled) return
    setReplyTarget(null)
    setEditing({ kind: 'reply', id: reply._id, draft: reply.message || '' })
    setText(reply.message || '')
  }

  function cancelComposerMode() {
    setEditing(null)
    setReplyTarget(null)
    setText('')
  }

  function handleComposerKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      // New messages send optimistically — only block while editing
      const blocked =
        editing &&
        (editReviewPointReply.isPending || updateReviewPointRoot.isPending)
      if (text.trim().length >= 2 && !blocked) handleSend()
    }
  }

  const busy =
    editReviewPointReply.isPending ||
    softDeleteReviewPointReply.isPending ||
    updateReviewPointRoot.isPending

  const composerLabel = editing
    ? editing.kind === 'root'
      ? 'Editing review point…'
      : 'Editing message…'
    : replyTarget
      ? `Reply to ${replyTarget.authorName}…`
      : 'Type a message… (@ to tag)'

  const chatBody = (
    <div
      className={cn(
        'flex flex-col overflow-hidden bg-[#f0f0f0]',
        maximized ? 'h-full rounded-none' : 'h-[22rem] rounded-b-xl'
      )}
    >
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-2.5"
      >
        {(rootDescription?.trim() || rootDeletedAt) && (
          <ChatBubble
            mine={false}
            authorName="Review point"
            isRoot
            isEdited={Boolean(rootEditedAt)}
            isDeleted={Boolean(rootDeletedAt)}
            message={rootDescription}
            canReply={Boolean(taskId && pointId) && !disabled && !rootDeletedAt}
            canEdit={!disabled && !rootDeletedAt}
            canDelete={!disabled && !rootDeletedAt}
            onReply={startReplyToRoot}
            onEdit={beginEditRoot}
            onDelete={handleDeleteRoot}
          />
        )}

        {displayReplies.map((reply) => {
          const mine = Boolean(
            myId && String(reply.authorId?._id || reply.authorId || '') === myId
          )
          const manage = canManageReply(reply)
          return (
            <ChatBubble
              key={reply._id || `${reply.authorId}-${reply.createdAt}`}
              mine={mine}
              authorName={reply.authorName || 'User'}
              timeLabel={
                reply.createdAt ? format(new Date(reply.createdAt), 'dd/MM/yyyy HH:mm') : ''
              }
              message={reply.message}
              isEdited={Boolean(reply.editedAt)}
              isDeleted={Boolean(reply.deletedAt)}
              quote={
                reply.replyToPreview && !reply.deletedAt
                  ? {
                      authorName: reply.replyToAuthorName || 'Message',
                      preview: reply.replyToPreview,
                    }
                  : null
              }
              canReply={Boolean(taskId && pointId) && !disabled && !reply.deletedAt}
              canEdit={manage && !reply.deletedAt}
              canDelete={manage && !reply.deletedAt}
              onReply={() => startReplyToMessage(reply)}
              onEdit={() => beginEditReply(reply)}
              onDelete={() => handleDeleteReply(reply)}
            />
          )
        })}

        {!rootDescription?.trim() && !rootDeletedAt && replies.length === 0 && (
          <p className="py-8 text-center text-xs text-muted-foreground">
            No messages yet. Write the opening review point below, then save the task — or send
            chat replies after the task is saved.
          </p>
        )}
      </div>

      {taskId && pointId && !disabled ? (
        <div className="shrink-0 border-t border-slate-200 bg-white px-3 py-2">
          {(replyTarget || editing) && (
            <div className="mb-1.5 flex items-start gap-2 rounded-lg border border-indigo-100 bg-indigo-50/80 px-2 py-1.5">
              {editing ? (
                <Pencil className="mt-0.5 size-3.5 shrink-0 text-indigo-600" />
              ) : (
                <Reply className="mt-0.5 size-3.5 shrink-0 text-indigo-600" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-indigo-700">
                  {editing
                    ? editing.kind === 'root'
                      ? 'Editing review point'
                      : 'Editing message'
                    : `Replying to ${replyTarget.authorName}`}
                </p>
                {!editing && replyTarget?.preview ? (
                  <p className="truncate text-xs text-slate-600">{replyTarget.preview}</p>
                ) : null}
              </div>
              <button
                type="button"
                className="rounded p-0.5 text-slate-400 hover:bg-indigo-100 hover:text-slate-700"
                onClick={cancelComposerMode}
                aria-label="Cancel"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-end gap-2" onKeyDown={handleComposerKeyDown}>
            <div className="min-w-0 flex-1">
              <MentionField
                multiline
                rows={2}
                value={text}
                onChange={setText}
                users={users}
                placeholder={composerLabel}
                className="min-h-[2.5rem] resize-none border-slate-200 text-sm text-slate-900"
              />
            </div>
            <Button
              type="button"
              size="sm"
              className="h-9 shrink-0 gap-1.5 px-3"
              disabled={text.trim().length < 2 || busy}
              onClick={handleSend}
            >
              <Send className="size-3.5" />
              {busy ? '…' : editing ? 'Save' : 'Send'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="shrink-0 border-t border-slate-200 bg-white px-3 py-2 text-xs text-muted-foreground">
          {disabled
            ? 'Conversation is read-only.'
            : 'Save the task once to enable live chat replies.'}
        </div>
      )}
    </div>
  )

  if (maximized) {
    return createPortal(
      <div className="fixed inset-0 z-[70] flex flex-col bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 bg-[#5b5fc7] px-4 py-2.5 text-white">
          <p className="text-sm font-semibold">Review conversation</p>
          <button
            type="button"
            onClick={onToggleMaximize}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium hover:bg-white/10"
          >
            <Minimize2 className="size-3.5" />
            Exit full screen
          </button>
        </div>
        <div className="min-h-0 flex-1">{chatBody}</div>
      </div>,
      document.body
    )
  }

  return chatBody
}

export function ReviewPointsField({
  control,
  register,
  errors,
  disabled,
  users = [],
  taskId,
  savedPoints = [],
  onTaskUpdated,
}) {
  const [maximized, setMaximized] = useState(false)
  const [draftRootOpen, setDraftRootOpen] = useState(false)
  const { fields, append } = useFieldArray({
    control,
    name: 'reviewPoints',
  })
  const watchedPoints = useWatch({ control, name: 'reviewPoints' }) || []

  // Single conversation only — ensure one form row exists
  useEffect(() => {
    if (fields.length === 0 && !disabled) {
      append({ description: '' })
    }
  }, [fields.length, disabled, append])

  const savedById = useMemo(
    () =>
      new Map((savedPoints || []).filter((p) => p?._id).map((p) => [String(p._id), p])),
    [savedPoints]
  )

  // Prefer first saved point; otherwise first form field
  const index = 0
  const field = fields[0]
  const pointId = field?._id || watchedPoints[0]?._id
  const saved = pointId ? savedById.get(String(pointId)) : savedPoints?.[0] || null
  const effectivePointId = pointId || saved?._id
  const replies = saved?.replies || []
  const isSaved = Boolean(effectivePointId)
  const rootDescription =
    watchedPoints[0]?.description || saved?.description || ''
  const rowError = errors?.reviewPoints?.[0]
  const showDraftEditor = !isSaved || draftRootOpen

  if (!field) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Review Points</p>
        <p className="text-xs text-muted-foreground">Loading conversation…</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">Review Points</p>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {effectivePointId ? (
          <input type="hidden" {...register(`reviewPoints.${index}._id`)} />
        ) : null}

        {/* Keep extra legacy points in the form payload without showing them */}
        {fields.slice(1).map((extra, i) => (
          <div key={extra.id} className="hidden">
            {extra._id ? (
              <input type="hidden" {...register(`reviewPoints.${i + 1}._id`)} />
            ) : null}
            <Controller
              control={control}
              name={`reviewPoints.${i + 1}.description`}
              render={({ field: f }) => <input type="hidden" {...f} />}
            />
          </div>
        ))}

        <div className="flex items-center justify-between bg-[#5b5fc7] px-3 py-2 text-white">
          <p className="text-xs font-semibold">
            Conversation
            {isSaved ? (
              <span className="ml-2 font-normal text-white/80">
                {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
              </span>
            ) : (
              <span className="ml-2 font-normal text-amber-200">New — save task to chat</span>
            )}
          </p>
          {isSaved ? (
            <button
              type="button"
              onClick={() => setMaximized(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-white/25"
              title="Open conversation in full screen"
            >
              <Maximize2 className="size-3.5" />
              Maximize
            </button>
          ) : null}
        </div>

        {/* Opening message for brand-new (unsaved) points */}
        {showDraftEditor && (
          <div className="space-y-1.5 border-b border-slate-100 bg-white px-3 py-2.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Opening message
              </label>
              {isSaved && (
                <button
                  type="button"
                  className="text-[11px] font-medium text-indigo-600 hover:underline"
                  onClick={() => setDraftRootOpen(false)}
                >
                  Done
                </button>
              )}
            </div>
            <Controller
              control={control}
              name={`reviewPoints.${index}.description`}
              render={({ field: descField }) => (
                <MentionField
                  id={`reviewPoints-${index}-description`}
                  multiline
                  rows={2}
                  value={descField.value || ''}
                  onChange={descField.onChange}
                  onBlur={descField.onBlur}
                  ref={descField.ref}
                  users={users}
                  disabled={disabled}
                  placeholder="Type the review point… (@ to tag a teammate)"
                  className="min-h-[3rem] text-sm text-slate-900"
                />
              )}
            />
            {rowError?.description?.message && (
              <p className="text-xs text-red-600">{rowError.description.message}</p>
            )}
            {!isSaved && (
              <p className="text-[10px] text-muted-foreground">
                Save / Update Task to create this conversation, then chat live here.
              </p>
            )}
          </div>
        )}

        {isSaved && !draftRootOpen && (
          <Controller
            control={control}
            name={`reviewPoints.${index}.description`}
            render={({ field: descField }) => (
              <input type="hidden" {...descField} value={descField.value || ''} />
            )}
          />
        )}

        {isSaved ? (
          <ReviewConversation
            taskId={taskId}
            pointId={effectivePointId}
            rootDescription={rootDescription}
            rootEditedAt={saved?.descriptionEditedAt}
            rootDeletedAt={saved?.descriptionDeletedAt}
            replies={replies}
            disabled={disabled}
            onTaskUpdated={(task) => {
              onTaskUpdated?.(task)
              // Keep form description in sync after root edit/delete
              const point = (task?.reviewPoints || []).find(
                (p) => String(p._id) === String(effectivePointId)
              )
              if (point && typeof point.description === 'string') {
                // parent setEditing handles savedPoints; form still needs description
              }
            }}
            users={users}
            maximized={maximized}
            onToggleMaximize={() => setMaximized((v) => !v)}
          />
        ) : null}
      </div>
    </div>
  )
}
