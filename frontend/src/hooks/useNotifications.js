import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '@/lib/api'

const LIST_KEY = ['notifications']
const UNREAD_KEY = ['notifications', 'unread-count']

export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: async () => {
      const { data } = await api.get('/notifications', { params: { limit: 40 } })
      return data.data
    },
    enabled,
    // Keep panel fresh while open; unread badge polls separately
    refetchInterval: enabled ? 10_000 : false,
    refetchOnWindowFocus: true,
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
      qc.invalidateQueries({ queryKey: UNREAD_KEY })
    },
  })

  const replyToReviewPoint = useMutation({
    mutationFn: ({ taskId, pointId, message }) =>
      api.post(`/tasks/${taskId}/review-points/${pointId}/replies`, { message }),
    onSuccess: (res, vars) => {
      toast.success(res.data.message || 'Reply sent')
      const task = res.data?.data
      if (task?._id) {
        qc.setQueryData(['tasks', task._id], task)
      }
      qc.invalidateQueries({ queryKey: ['tasks'] })
      // Fresh unread for the other party will appear on their poll; refresh ours lightly
      qc.invalidateQueries({ queryKey: LIST_KEY })
      qc.invalidateQueries({ queryKey: UNREAD_KEY })
      return vars
    },
    onError: (err) =>
      toast.error(err.response?.data?.message || 'Failed to send reply'),
  })

  return { markRead, markAllRead, softDelete, replyToReviewPoint }
}
