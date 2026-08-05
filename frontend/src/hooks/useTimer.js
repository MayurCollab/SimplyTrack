import { useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '@/lib/api'
import { useTimerStore } from '@/store/timerStore'

export function useActiveTimer() {
  const setActiveState = useTimerStore((s) => s.setActiveState)
  const openNoteDialog = useTimerStore((s) => s.openNoteDialog)

  const query = useQuery({
    queryKey: ['timelogs', 'active'],
    queryFn: async () => {
      const { data } = await api.get('/timelogs/active')
      return data.data
    },
    refetchInterval: 30_000,
  })

  useEffect(() => {
    if (query.data) {
      setActiveState(query.data)
      if (query.data.pendingNote) {
        openNoteDialog({
          timeLog: query.data.pendingNote,
          mode: 'pending',
        })
      }
    }
  }, [query.data, setActiveState, openNoteDialog])

  return query
}

export function useTimerActions() {
  const qc = useQueryClient()
  const openNoteDialog = useTimerStore((s) => s.openNoteDialog)
  const closeNoteDialog = useTimerStore((s) => s.closeNoteDialog)

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['timelogs', 'active'] })
    qc.invalidateQueries({ queryKey: ['tasks'] })
  }, [qc])

  function handleConflict(err) {
    const pending = err.response?.data?.data?.pendingNote
    if (err.response?.status === 409 && pending) {
      openNoteDialog({ timeLog: pending, mode: 'pending' })
      toast.message('Add a closing note for your previous session')
      return true
    }
    return false
  }

  const startTaskTimer = useMutation({
    mutationFn: (taskId) => api.post(`/tasks/${taskId}/timer/start`),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Timer started')
      invalidate()
    },
    onError: (err) => {
      if (!handleConflict(err)) {
        toast.error(err.response?.data?.message || 'Could not start timer')
      } else {
        invalidate()
      }
    },
  })

  const stopTaskTimer = useMutation({
    mutationFn: ({ taskId, closingNote }) =>
      api.post(`/tasks/${taskId}/timer/stop`, { closingNote }),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Timer stopped')
      closeNoteDialog()
      invalidate()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not stop timer'),
  })

  const startBreak = useMutation({
    mutationFn: () => api.post('/timelogs/break/start'),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Break started')
      invalidate()
    },
    onError: (err) => {
      if (!handleConflict(err)) {
        toast.error(err.response?.data?.message || 'Could not start break')
      } else {
        invalidate()
      }
    },
  })

  const stopBreak = useMutation({
    mutationFn: ({ closingNote }) => api.post('/timelogs/break/stop', { closingNote }),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Break stopped')
      closeNoteDialog()
      invalidate()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not stop break'),
  })

  const startTraining = useMutation({
    mutationFn: () => api.post('/timelogs/training/start'),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Training started')
      invalidate()
    },
    onError: (err) => {
      if (!handleConflict(err)) {
        toast.error(err.response?.data?.message || 'Could not start training')
      } else {
        invalidate()
      }
    },
  })

  const stopTraining = useMutation({
    mutationFn: ({ closingNote }) => api.post('/timelogs/training/stop', { closingNote }),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Training stopped')
      closeNoteDialog()
      invalidate()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not stop training'),
  })

  const submitPendingNote = useMutation({
    mutationFn: ({ closingNote, timeLogId }) =>
      api.post('/timelogs/pending-note', { closingNote, timeLogId }),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Closing note saved')
      closeNoteDialog()
      invalidate()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not save note'),
  })

  return {
    startTaskTimer,
    stopTaskTimer,
    startBreak,
    stopBreak,
    startTraining,
    stopTraining,
    submitPendingNote,
    openNoteDialog,
    closeNoteDialog,
  }
}

export function useTasks(filters = {}) {
  return useQuery({
    queryKey: ['tasks', filters],
    queryFn: async () => {
      const { data } = await api.get('/tasks', { params: filters })
      return data.data
    },
  })
}

export function useTask(id) {
  return useQuery({
    queryKey: ['tasks', id],
    queryFn: async () => {
      const { data } = await api.get(`/tasks/${id}`)
      return data.data
    },
    enabled: !!id,
  })
}

export function useTaskMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['tasks'] })

  const create = useMutation({
    mutationFn: (body) => api.post('/tasks', body),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Task created')
      invalidate()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to create task'),
  })

  const update = useMutation({
    mutationFn: ({ id, ...body }) => api.patch(`/tasks/${id}`, body),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Task updated')
      invalidate()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to update task'),
  })

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/tasks/${id}`),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Task deleted')
      invalidate()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to delete task'),
  })

  return { create, update, remove }
}
