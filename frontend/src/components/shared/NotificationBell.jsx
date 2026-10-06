import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { Bell, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  useNotifications,
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

export function NotificationBell() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [replyingId, setReplyingId] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [reviewingId, setReviewingId] = useState(null)
  const [reviewDecision, setReviewDecision] = useState(null)
  const [reviewComment, setReviewComment] = useState('')
  const rootRef = useRef(null)

  const { data: unreadCount = 0 } = useUnreadNotificationCount()
  const { data: notifications = [], isLoading } = useNotifications(open)
  const { markRead, markAllRead, softDelete, replyToReviewPoint } =
    useNotificationMutations()
  const { approve: approveShare, reject: rejectShare } = useShareRequestMutations()

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
    }
  }, [open])

  function handleItemClick(notification) {
    const taskId = taskIdFromNotification(notification)

    // Mark read + navigate immediately (don't wait on network)
    if (!notification.isRead) {
      markRead.mutate(notification._id)
    }
    setOpen(false)

    if (taskId) {
      // Prefetch task so the sheet opens without waiting on cold fetch
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
        {unreadCount > 0 && (
          <span
            className="absolute right-1 top-1 size-2 rounded-full bg-rose-500 ring-2 ring-white"
            aria-hidden
          />
        )}
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-900/10"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            {unreadCount > 0 && (
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

          <div className="max-h-96 overflow-y-auto">
            {isLoading && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Loading…
              </p>
            )}
            {!isLoading && notifications.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                No notifications yet
              </p>
            )}
            {!isLoading &&
              notifications.map((n) => {
                const replyable = canReplyToNotification(n)
                const isReplying = replyingId === n._id
                const shareReviewable = canReviewShareNotification(n)
                const isReviewing = reviewingId === n._id

                return (
                  <div
                    key={n._id}
                    className={cn(
                      'border-b border-slate-50 px-3 py-2.5 last:border-b-0',
                      !n.isRead && 'bg-indigo-50/60'
                    )}
                  >
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleItemClick(n)}
                        className="flex min-w-0 flex-1 gap-3 text-left transition-colors hover:opacity-90"
                      >
                        <span
                          className={cn(
                            'mt-1.5 size-2 shrink-0 rounded-full',
                            n.isRead ? 'bg-transparent' : 'bg-rose-500'
                          )}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm leading-snug text-slate-800">
                            {n.message}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {n.createdAt
                              ? formatDistanceToNow(new Date(n.createdAt), {
                                  addSuffix: true,
                                })
                              : ''}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        title="Delete notification"
                        aria-label="Delete notification"
                        className="mt-0.5 shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                        disabled={softDelete.isPending}
                        onClick={(e) => {
                          e.stopPropagation()
                          softDelete.mutate(n._id)
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
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
