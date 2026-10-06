import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '@/lib/api'

const SHARE_KEY = ['task-share-requests']

export function useShareRequests(status = 'pending', enabled = true) {
  return useQuery({
    queryKey: [...SHARE_KEY, status],
    queryFn: async () => {
      const { data } = await api.get('/task-share-requests', {
        params: { status },
      })
      return data.data
    },
    enabled,
    refetchInterval: enabled ? 30_000 : false,
  })
}

export function useShareRequestMutations() {
  const qc = useQueryClient()

  function invalidate() {
    qc.invalidateQueries({ queryKey: SHARE_KEY })
    qc.invalidateQueries({ queryKey: ['tasks'] })
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }

  const create = useMutation({
    mutationFn: ({ taskId, ...body }) => api.post(`/tasks/${taskId}/share-requests`, body),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Share request sent')
      invalidate()
    },
    onError: (err) =>
      toast.error(err.response?.data?.message || 'Failed to send share request'),
  })

  const approve = useMutation({
    mutationFn: ({ requestId, managerComment = '' }) =>
      api.post(`/task-share-requests/${requestId}/approve`, { managerComment }),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Share approved')
      invalidate()
    },
    onError: (err) =>
      toast.error(err.response?.data?.message || 'Failed to approve share request'),
  })

  const reject = useMutation({
    mutationFn: ({ requestId, managerComment = '' }) =>
      api.post(`/task-share-requests/${requestId}/reject`, { managerComment }),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Share rejected')
      invalidate()
    },
    onError: (err) =>
      toast.error(err.response?.data?.message || 'Failed to reject share request'),
  })

  return { create, approve, reject }
}
