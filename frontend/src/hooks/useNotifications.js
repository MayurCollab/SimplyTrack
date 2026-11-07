import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '@/lib/api'

const LIST_KEY = ['notifications']
const DELETED_KEY = ['notifications', 'deleted']
const UNREAD_KEY = ['notifications', 'unread-count']

export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: async () => {
      const { data } = await api.get('/notifications', { params: { limit: 40 } })
      return data.data
    },
    // Prefetch while logged in so opening the panel is instant
    enabled,
    refetchInterval: enabled ? 15_000 : false,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  })
}

/** @deprecated Prefer useNotifications — kept for callers that only want the poll */
export function useNotificationInboxPoll(enabled = true) {
  return useNotifications(enabled)
}

export function useDeletedNotifications(enabled = true) {
  return useQuery({
    queryKey: DELETED_KEY,
    queryFn: async () => {
      const { data } = await api.get('/notifications', {
        params: { limit: 40, deleted: '1' },
      })
      return data.data
    },
    enabled,
    staleTime: 5_000,
  })
}

export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: UNREAD_KEY,
    queryFn: async () => {
      const { data } = await api.get('/notifications/unread-count')
      return data.data?.count ?? 0
    },
    refetchInterval: 12_000,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  })
}

export function useNotificationMutations() {
  const qc = useQueryClient()

  function setUnreadCount(updater) {
    qc.setQueryData(UNREAD_KEY, (prev) => {
      const current = typeof prev === 'number' ? prev : 0
      const next = typeof updater === 'function' ? updater(current) : updater
      return Math.max(0, next)
    })
  }

  function patchList(updater) {
    qc.setQueryData(LIST_KEY, (prev) => {
      if (!Array.isArray(prev)) return prev
      return updater(prev)
    })
  }

  const markRead = useMutation({
    mutationFn: (id) => api.patch(`/notifications/${id}/read`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: LIST_KEY })
      await qc.cancelQueries({ queryKey: UNREAD_KEY })
      const prevList = qc.getQueryData(LIST_KEY)
      const prevUnread = qc.getQueryData(UNREAD_KEY)
      let wasUnread = false
      patchList((list) =>
        list.map((n) => {
          if (n._id !== id) return n
          wasUnread = !n.isRead
          return { ...n, isRead: true, readAt: new Date().toISOString() }
        })
      )
      if (wasUnread) setUnreadCount((c) => c - 1)
      return { prevList, prevUnread }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prevList) qc.setQueryData(LIST_KEY, ctx.prevList)
      if (ctx?.prevUnread !== undefined) qc.setQueryData(UNREAD_KEY, ctx.prevUnread)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: UNREAD_KEY })
    },
  })

  const markAllRead = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: LIST_KEY })
      await qc.cancelQueries({ queryKey: UNREAD_KEY })
      const prevList = qc.getQueryData(LIST_KEY)
      const prevUnread = qc.getQueryData(UNREAD_KEY)
      patchList((list) =>
        list.map((n) => ({ ...n, isRead: true, readAt: n.readAt || new Date().toISOString() }))
      )
      setUnreadCount(0)
      return { prevList, prevUnread }
    },
    onError: (_err, _v, ctx) => {
      if (ctx?.prevList) qc.setQueryData(LIST_KEY, ctx.prevList)
      if (ctx?.prevUnread !== undefined) qc.setQueryData(UNREAD_KEY, ctx.prevUnread)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: LIST_KEY })
      qc.invalidateQueries({ queryKey: UNREAD_KEY })
    },
  })

  const softDelete = useMutation({
    mutationFn: (id) => api.delete(`/notifications/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: LIST_KEY })
      await qc.cancelQueries({ queryKey: UNREAD_KEY })
      const prevList = qc.getQueryData(LIST_KEY)
      const prevUnread = qc.getQueryData(UNREAD_KEY)
      let wasUnread = false
      patchList((list) =>
        list.filter((n) => {
          if (n._id !== id) return true
          wasUnread = !n.isRead
          return false
        })
      )
      if (wasUnread) setUnreadCount((c) => c - 1)
      return { prevList, prevUnread }
    },
    onError: (err, _id, ctx) => {
      if (ctx?.prevList) qc.setQueryData(LIST_KEY, ctx.prevList)
      if (ctx?.prevUnread !== undefined) qc.setQueryData(UNREAD_KEY, ctx.prevUnread)
      toast.error(err.response?.data?.message || 'Failed to delete notification')
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: LIST_KEY })
      qc.invalidateQueries({ queryKey: DELETED_KEY })
      qc.invalidateQueries({ queryKey: UNREAD_KEY })
    },
  })

  const restore = useMutation({
    mutationFn: (id) => api.patch(`/notifications/${id}/restore`),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Notification restored')
      qc.invalidateQueries({ queryKey: LIST_KEY })
      qc.invalidateQueries({ queryKey: DELETED_KEY })
      qc.invalidateQueries({ queryKey: UNREAD_KEY })
    },
    onError: (err) =>
      toast.error(err.response?.data?.message || 'Failed to restore notification'),
  })

  function patchTaskCache(task) {
    if (!task?._id) return
    qc.setQueryData(['tasks', task._id], task)
    qc.setQueriesData({ queryKey: ['tasks'] }, (old) => {
      if (!Array.isArray(old)) return old
      return old.map((t) => (String(t._id) === String(task._id) ? { ...t, ...task } : t))
    })
  }

  function mergeReplyIntoTaskCache({ taskId, pointId, reply }) {
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

  const replyToReviewPoint = useMutation({
    mutationFn: ({ taskId, pointId, message, replyToId, replyToPreview, replyToAuthorName }) =>
      api.post(`/tasks/${taskId}/review-points/${pointId}/replies`, {
        message,
        replyToId: replyToId || null,
        replyToPreview: replyToPreview || '',
        replyToAuthorName: replyToAuthorName || '',
      }),
    onSuccess: (res) => {
      // No success toast — chat already shows the message (keeps send feeling instant)
      const payload = res.data?.data
      if (payload?.reply) mergeReplyIntoTaskCache(payload)
      else patchTaskCache(payload)
      void qc.invalidateQueries({ queryKey: UNREAD_KEY })
    },
    onError: (err) =>
      toast.error(err.response?.data?.message || 'Failed to send reply'),
  })

  const editReviewPointReply = useMutation({
    mutationFn: ({ taskId, pointId, replyId, message }) =>
      api.patch(`/tasks/${taskId}/review-points/${pointId}/replies/${replyId}`, { message }),
    onSuccess: (res) => {
      const payload = res.data?.data
      if (payload?.reply) mergeReplyIntoTaskCache(payload)
      else patchTaskCache(payload)
    },
    onError: (err) =>
      toast.error(err.response?.data?.message || 'Failed to update message'),
  })

  const softDeleteReviewPointReply = useMutation({
    mutationFn: ({ taskId, pointId, replyId }) =>
      api.delete(`/tasks/${taskId}/review-points/${pointId}/replies/${replyId}`),
    onSuccess: (res) => {
      const payload = res.data?.data
      if (payload?.reply) mergeReplyIntoTaskCache(payload)
      else patchTaskCache(payload)
    },
    onError: (err) =>
      toast.error(err.response?.data?.message || 'Failed to delete message'),
  })

  const updateReviewPointRoot = useMutation({
    mutationFn: ({ taskId, pointId, description, softDelete }) =>
      api.patch(`/tasks/${taskId}/review-points/${pointId}`, {
        ...(softDelete ? { softDelete: true } : { description }),
      }),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Message updated')
      patchTaskCache(res.data?.data)
    },
    onError: (err) =>
      toast.error(err.response?.data?.message || 'Failed to update message'),
  })

  return {
    markRead,
    markAllRead,
    softDelete,
    restore,
    replyToReviewPoint,
    editReviewPointReply,
    softDeleteReviewPointReply,
    updateReviewPointRoot,
  }
}
