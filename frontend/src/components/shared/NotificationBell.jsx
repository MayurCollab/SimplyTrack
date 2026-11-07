import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { Bell, Check, History, RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  useNotifications,
  useDeletedNotifications,
  useUnreadNotificationCount,
  useNotificationMutations,
} from '@/hooks/useNotifications'
import { useShareRequestMutations } from '@/hooks/useShareRequests'
import api from '@/lib/api'
import { cn } from '@/lib/utils'

function taskIdFromNotification(n) {
  return n?.taskId?._id || n?.taskId || null
}

function shareRequestIdFromNotification(n) {
  return n?.shareRequestId?._id || n?.shareRequestId || null
}

function canReplyToNotification(n) {
  const type = n?.type
  const pointId = n?.reviewPointId
  const taskId = taskIdFromNotification(n)
  return (
    Boolean(taskId && pointId) &&
    (type === 'mention_review_point' || type === 'review_point_reply')
  )
}

function canReviewShareNotification(n) {
  return n?.type === 'hour_share_requested' && Boolean(shareRequestIdFromNotification(n))
}

function unreadBadgeLabel(count) {
  if (count <= 0) return null
  if (count > 99) return '99+'
  return String(count)
}

const TOASTED_STORAGE_KEY = 'simplytrack:toasted-notification-ids'

function loadToastedIds() {
  try {
    const raw = sessionStorage.getItem(TOASTED_STORAGE_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr.map(String) : [])
  } catch {
    return new Set()
  }
}

function persistToastedIds(set) {
  try {
    // Cap size so sessionStorage stays small
    const ids = [...set].slice(-200)
    sessionStorage.setItem(TOASTED_STORAGE_KEY, JSON.stringify(ids))
  } catch {
    /* ignore quota */
  }
}

export function NotificationBell() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [showDeleted, setShowDeleted] = useState(false)
  const [highlightId, setHighlightId] = useState(null)
  const [replyingId, setReplyingId] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [reviewingId, setReviewingId] = useState(null)
  const [reviewDecision, setReviewDecision] = useState(null)
  const [reviewComment, setReviewComment] = useState('')
  const rootRef = useRef(null)
  const itemRefs = useRef(new Map())
  const toastedIdsRef = useRef(null)
  const primedRef = useRef(false)

  const { data: unreadCount = 0 } = useUnreadNotificationCount()
  // Always keep inbox warm so opening the panel is instant
  const { data: notifications = [], isLoading, isFetched } = useNotifications(true)
  const { data: deletedNotifications = [], isLoading: deletedLoading } =
    useDeletedNotifications(open && showDeleted)
  const { markRead, markAllRead, softDelete, restore, replyToReviewPoint } =
    useNotificationMutations()
  const { approve: approveShare, reject: rejectShare } = useShareRequestMutations()

  // Toast once per notification id (sessionStorage survives remounts / navigation)
  useEffect(() => {
    if (!isFetched || !Array.isArray(notifications)) return

    if (!toastedIdsRef.current) {
      toastedIdsRef.current = loadToastedIds()
    }

    const unread = notifications.filter((n) => n && !n.isRead && !n.deletedAt)

    // First successful fetch: seed existing unread so only *new* ones popup later
    if (!primedRef.current) {
      for (const n of unread) toastedIdsRef.current.add(String(n._id))
      persistToastedIds(toastedIdsRef.current)
      primedRef.current = true
      return
    }

    const fresh = unread.filter((n) => !toastedIdsRef.current.has(String(n._id)))
    for (const n of fresh) {
      const id = String(n._id)
      toastedIdsRef.current.add(id)
      toast(n.message || 'New notification', {
        id: `notif-${id}`,
        description: 'Click to open in Notifications',
        duration: 8000,
        action: {
          label: 'View',
          onClick: () => {
            setShowDeleted(false)
            setHighlightId(id)
            setOpen(true)
          },
        },
      })
    }
    if (fresh.length) persistToastedIds(toastedIdsRef.current)
  }, [notifications, isFetched])

  useEffect(() => {
    if (!open || !highlightId) return
    const el = itemRefs.current.get(String(highlightId))
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
    const timer = setTimeout(() => setHighlightId(null), 4000)
    return () => clearTimeout(timer)
  }, [open, highlightId, notifications, showDeleted])

  useEffect(() => {
    if (!open) return

    function onPointerDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false)
      }
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      setReplyingId(null)
      setReplyText('')
      setReviewingId(null)
      setReviewDecision(null)
      setReviewComment('')
      setShowDeleted(false)
    }
  }, [open])

  function handleItemClick(notification) {
    const taskId = taskIdFromNotification(notification)

    if (!notification.isRead) {
      markRead.mutate(notification._id)
    }
    setOpen(false)

    if (taskId) {
      qc.prefetchQuery({
        queryKey: ['tasks', taskId],
        queryFn: async () => {
          const { data } = await api.get(`/tasks/${taskId}`)
          return data.data
        },
        staleTime: 10_000,
      })
      navigate(`/tasks?open=${taskId}&t=${Date.now()}`)
    }
  }

  async function handleSendReply(notification) {
    const taskId = taskIdFromNotification(notification)
    const pointId = notification.reviewPointId
    const message = replyText.trim()
    if (!taskId || !pointId || message.length < 2) return

    await replyToReviewPoint.mutateAsync({ taskId, pointId, message })
    if (!notification.isRead) {
      markRead.mutate(notification._id)
    }
    setReplyingId(null)
    setReplyText('')
  }

  async function handleShareReview(notification) {
    const requestId = shareRequestIdFromNotification(notification)
    if (!requestId || !reviewDecision) return

    const payload = {
      requestId,
      managerComment: reviewComment.trim(),
    }
    if (reviewDecision === 'approve') {
      await approveShare.mutateAsync(payload)
    } else {
      await rejectShare.mutateAsync(payload)
    }
    if (!notification.isRead) {
      markRead.mutate(notification._id)
    }
    setReviewingId(null)
    setReviewDecision(null)
    setReviewComment('')
  }

  const reviewingBusy = approveShare.isPending || rejectShare.isPending
  const badge = unreadBadgeLabel(unreadCount)
  const list = showDeleted ? deletedNotifications : notifications
  // Only show spinner when we have nothing cached yet
  const listLoading = showDeleted
    ? deletedLoading && list.length === 0
    : isLoading && list.length === 0

  return (
    <div className="relative" ref={rootRef}>
      <Button
        variant="ghost"
        size="sm"
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : 'Notifications'
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className="relative size-8 px-0 text-slate-500 hover:bg-indigo-50 hover:text-indigo-700"
      >
        <Bell className="size-4" />
        {badge && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white"
            aria-hidden
          >
            {badge}
          </span>
        )}
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-900/10"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
            <p className="text-sm font-semibold text-slate-900">
              {showDeleted ? 'Deleted notifications' : 'Notifications'}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                title={showDeleted ? 'Back to notifications' : 'Deleted history'}
                aria-label={showDeleted ? 'Back to notifications' : 'Deleted history'}
                className={cn(
                  'rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800',
                  showDeleted && 'bg-indigo-50 text-indigo-700'
                )}
                onClick={() => setShowDeleted((v) => !v)}
              >
                <History className="size-3.5" />
              </button>
              {!showDeleted && unreadCount > 0 && (
                <button
                  type="button"
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                  disabled={markAllRead.isPending}
                  onClick={() => markAllRead.mutate()}
                >
                  Mark all as read
                </button>
              )}
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {listLoading && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Loading…
              </p>
            )}
            {!listLoading && list.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                {showDeleted ? 'No deleted notifications' : 'No notifications yet'}
              </p>
            )}
            {!listLoading &&
              list.map((n) => {
                const replyable = !showDeleted && canReplyToNotification(n)
                const isReplying = replyingId === n._id
                const shareReviewable = !showDeleted && canReviewShareNotification(n)
                const isReviewing = reviewingId === n._id
                const isHighlighted = highlightId && String(n._id) === String(highlightId)

                return (
                  <div
                    key={n._id}
                    ref={(el) => {
                      if (el) itemRefs.current.set(String(n._id), el)
                      else itemRefs.current.delete(String(n._id))
                    }}
                    className={cn(
                      'border-b border-slate-50 px-3 py-2.5 last:border-b-0',
                      !showDeleted && !n.isRead && 'bg-indigo-50/60',
                      isHighlighted && 'ring-2 ring-inset ring-indigo-400'
                    )}
                  >
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (showDeleted) return
                          handleItemClick(n)
                        }}
                        className={cn(
                          'flex min-w-0 flex-1 gap-3 text-left transition-colors hover:opacity-90',
                          showDeleted && 'cursor-default'
                        )}
                      >
                        <span
                          className={cn(
                            'mt-1.5 size-2 shrink-0 rounded-full',
                            showDeleted || n.isRead ? 'bg-transparent' : 'bg-rose-500'
                          )}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm leading-snug text-slate-800">
                            {n.message}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {showDeleted && n.deletedAt
                              ? `Deleted ${formatDistanceToNow(new Date(n.deletedAt), {
                                  addSuffix: true,
                                })}`
                              : n.createdAt
                                ? formatDistanceToNow(new Date(n.createdAt), {
                                    addSuffix: true,
                                  })
                                : ''}
                          </span>
                        </span>
                      </button>

                      <div className="mt-0.5 flex shrink-0 flex-col gap-0.5">
                        {showDeleted ? (
                          <button
                            type="button"
                            title="Restore notification"
                            aria-label="Restore notification"
                            className="rounded p-1 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700"
                            disabled={restore.isPending}
                            onClick={(e) => {
                              e.stopPropagation()
                              restore.mutate(n._id)
                            }}
                          >
                            <RotateCcw className="size-3.5" />
                          </button>
                        ) : (
                          <>
                            {!n.isRead && (
                              <button
                                type="button"
                                title="Mark as read"
                                aria-label="Mark as read"
                                className="rounded p-1 text-slate-400 hover:bg-indigo-50 hover:text-indigo-700"
                                disabled={markRead.isPending}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  markRead.mutate(n._id)
                                }}
                              >
                                <Check className="size-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              title="Delete notification"
                              aria-label="Delete notification"
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                              disabled={softDelete.isPending}
                              onClick={(e) => {
                                e.stopPropagation()
                                softDelete.mutate(n._id)
                              }}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {shareReviewable && (
                      <div className="mt-2 pl-5" onClick={(e) => e.stopPropagation()}>
                        {!isReviewing ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="text-xs font-semibold text-emerald-700 hover:text-emerald-900"
                              onClick={() => {
                                setReviewingId(n._id)
                                setReviewDecision('approve')
                                setReviewComment('')
                              }}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="text-xs font-semibold text-red-600 hover:text-red-800"
                              onClick={() => {
                                setReviewingId(n._id)
                                setReviewDecision('reject')
                                setReviewComment('')
                              }}
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <Textarea
                              rows={2}
                              value={reviewComment}
                              onChange={(e) => setReviewComment(e.target.value)}
                              placeholder="Optional comment…"
                              className="min-h-[3.5rem] text-sm"
                              autoFocus
                            />
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant={reviewDecision === 'reject' ? 'destructive' : 'default'}
                                disabled={reviewingBusy}
                                onClick={() => handleShareReview(n)}
                              >
                                {reviewingBusy
                                  ? 'Saving…'
                                  : reviewDecision === 'approve'
                                    ? 'Confirm approve'
                                    : 'Confirm reject'}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={reviewingBusy}
                                onClick={() => {
                                  setReviewingId(null)
                                  setReviewDecision(null)
                                  setReviewComment('')
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {replyable && (
                      <div className="mt-2 pl-5">
                        {!isReplying ? (
                          <button
                            type="button"
                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                            onClick={(e) => {
                              e.stopPropagation()
                              setReplyingId(n._id)
                              setReplyText('')
                            }}
                          >
                            Reply
                          </button>
                        ) : (
                          <div
                            className="space-y-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Textarea
                              rows={2}
                              value={replyText}
                              onChange={(e) => setReplyText(e.target.value)}
                              placeholder="Write your reply…"
                              className="min-h-[4rem] text-sm"
                              autoFocus
                            />
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                disabled={
                                  replyText.trim().length < 2 ||
                                  replyToReviewPoint.isPending
                                }
                                onClick={() => handleSendReply(n)}
                              >
                                {replyToReviewPoint.isPending ? 'Sending…' : 'Send reply'}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={replyToReviewPoint.isPending}
                                onClick={() => {
                                  setReplyingId(null)
                                  setReplyText('')
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}
