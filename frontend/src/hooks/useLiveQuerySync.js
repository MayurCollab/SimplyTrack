import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/authStore'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001/api'

function mergeReplyIntoTaskCache(qc, { taskId, pointId, reply }) {
  if (!taskId || !pointId || !reply) return
  const merge = (task) => {
    if (!task || String(task._id) !== String(taskId)) return task
    return {
      ...task,
      reviewPoints: (task.reviewPoints || []).map((p) => {
        if (String(p._id) !== String(pointId)) return p
        const replies = [...(p.replies || [])]
        const idx = replies.findIndex((r) => String(r._id) === String(reply._id))
        if (idx >= 0) replies[idx] = { ...replies[idx], ...reply }
        else replies.push(reply)
        return { ...p, replies }
      }),
    }
  }
  qc.setQueryData(['tasks', taskId], (prev) => (prev ? merge(prev) : prev))
  qc.setQueriesData({ queryKey: ['tasks'] }, (old) => {
    if (!Array.isArray(old)) return old
    return old.map((t) => merge(t))
  })
}

function refreshNotifications(qc) {
  void qc.invalidateQueries({ queryKey: ['notifications'] })
  void qc.invalidateQueries({ queryKey: ['notifications', 'unread-count'] })
  void qc.invalidateQueries({ queryKey: ['notifications', 'live-sync'] })
}

/**
 * Live sync via Server-Sent Events so other users see messages, tags,
 * assignments, and requests without refreshing or switching modules.
 */
export function useLiveQuerySync() {
  const qc = useQueryClient()
  const accessToken = useAuthStore((s) => s.accessToken)
  const userId = useAuthStore((s) => s.user?.id || s.user?._id)
  const esRef = useRef(null)
  const retryRef = useRef(null)
  const attemptRef = useRef(0)

  useEffect(() => {
    if (!accessToken) return undefined

    let cancelled = false

    function clearRetry() {
      if (retryRef.current) {
        window.clearTimeout(retryRef.current)
        retryRef.current = null
      }
    }

    function handleEvent(raw) {
      let event
      try {
        event = JSON.parse(raw)
      } catch {
        return
      }
      if (!event?.type || event.type === 'connected') return

      // Ignore echoes for the current user (actor already updated locally)
      if (event.actorId && userId && String(event.actorId) === String(userId)) {
        if (event.type === 'notification') return
      }

      switch (event.type) {
        case 'notification': {
          refreshNotifications(qc)
          if (event.notificationType === 'task_assigned' || event.notificationType?.startsWith('mention')) {
            void qc.invalidateQueries({ queryKey: ['tasks'] })
            void qc.invalidateQueries({ queryKey: ['dashboard', 'overview'] })
          }
          if (
            event.notificationType === 'time_adjustment_submitted' ||
            event.notificationType === 'time_adjustment_decided'
          ) {
            void qc.invalidateQueries({ queryKey: ['time-adjustments'] })
            void qc.invalidateQueries({ queryKey: ['timelogs', 'mine'] })
          }
          if (event.notificationType?.startsWith('hour_share')) {
            void qc.invalidateQueries({ queryKey: ['task-share-requests'] })
            void qc.invalidateQueries({ queryKey: ['tasks'] })
          }
          if (event.notificationType === 'timer_stopped_by_admin') {
            void qc.invalidateQueries({ queryKey: ['timelogs', 'active'] })
            void qc.invalidateQueries({ queryKey: ['team-status'] })
          }
          if (event.notificationType === 'review_point_reply' && event.taskId) {
            void qc.invalidateQueries({ queryKey: ['tasks', event.taskId] })
          }
          if (event.message && document.visibilityState === 'visible') {
            toast.info(event.message, { duration: 4000 })
          }
          break
        }
        case 'task.message': {
          mergeReplyIntoTaskCache(qc, {
            taskId: event.taskId,
            pointId: event.pointId,
            reply: event.reply,
          })
          if (event.taskId) {
            void qc.invalidateQueries({ queryKey: ['tasks', event.taskId] })
          }
          refreshNotifications(qc)
          break
        }
        case 'task.changed': {
          void qc.invalidateQueries({ queryKey: ['tasks'] })
          if (event.taskId) {
            void qc.invalidateQueries({ queryKey: ['tasks', event.taskId] })
          }
          if (event.reason === 'create' || event.reason === 'assign' || event.reason === 'share_approved') {
            void qc.invalidateQueries({ queryKey: ['dashboard', 'overview'] })
          }
          break
        }
        case 'share_request': {
          void qc.invalidateQueries({ queryKey: ['task-share-requests'] })
          void qc.invalidateQueries({ queryKey: ['tasks'] })
          refreshNotifications(qc)
          break
        }
        case 'timer': {
          void qc.invalidateQueries({ queryKey: ['timelogs', 'active'] })
          void qc.invalidateQueries({ queryKey: ['team-status'] })
          refreshNotifications(qc)
          break
        }
        case 'team_status': {
          void qc.invalidateQueries({ queryKey: ['team-status'] })
          break
        }
        case 'time_adjustment': {
          void qc.invalidateQueries({ queryKey: ['time-adjustments'] })
          void qc.invalidateQueries({ queryKey: ['timelogs', 'mine'] })
          refreshNotifications(qc)
          break
        }
        default:
          break
      }
    }

    function connect() {
      if (cancelled) return
      clearRetry()

      if (esRef.current) {
        try {
          esRef.current.close()
        } catch {
          // ignore
        }
        esRef.current = null
      }

      const url = `${API_BASE}/realtime/stream?access_token=${encodeURIComponent(accessToken)}`
      const es = new EventSource(url)
      esRef.current = es

      const onPayload = (e) => handleEvent(e.data)

      es.addEventListener('connected', onPayload)
      es.addEventListener('notification', onPayload)
      es.addEventListener('task.message', onPayload)
      es.addEventListener('task.changed', onPayload)
      es.addEventListener('share_request', onPayload)
      es.addEventListener('timer', onPayload)
      es.addEventListener('team_status', onPayload)
      es.addEventListener('time_adjustment', onPayload)
      es.onmessage = onPayload

      es.onopen = () => {
        attemptRef.current = 0
      }

      es.onerror = () => {
        try {
          es.close()
        } catch {
          // ignore
        }
        if (esRef.current === es) esRef.current = null
        if (cancelled) return
        const attempt = Math.min(attemptRef.current + 1, 6)
        attemptRef.current = attempt
        const delay = Math.min(30_000, 1000 * 2 ** (attempt - 1))
        retryRef.current = window.setTimeout(connect, delay)
      }
    }

    connect()

    function onVisibility() {
      if (document.visibilityState === 'visible' && !esRef.current && !cancelled) {
        connect()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      clearRetry()
      document.removeEventListener('visibilitychange', onVisibility)
      if (esRef.current) {
        try {
          esRef.current.close()
        } catch {
          // ignore
        }
        esRef.current = null
      }
    }
  }, [accessToken, userId, qc])
}
