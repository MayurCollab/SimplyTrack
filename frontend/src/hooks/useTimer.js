import { useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '@/lib/api'
import { useTimerStore } from '@/store/timerStore'

export function useActiveTimer() {
  const setActiveState = useTimerStore((s) => s.setActiveState)
  const dismissedPendingNoteId = useTimerStore((s) => s.dismissedPendingNoteId)

  const query = useQuery({
    queryKey: ['timelogs', 'active'],
    queryFn: async () => {
      const { data } = await api.get('/timelogs/active')
      return data.data
    },
    refetchInterval: 30_000,
  })

  useEffect(() => {
    if (!query.data) return

    setActiveState(query.data)

    const pending = query.data.pendingNote
    if (!pending || String(pending._id) === String(dismissedPendingNoteId)) return

    const { noteDialog } = useTimerStore.getState()
    if (
      noteDialog?.mode === 'pending' &&
      String(noteDialog.timeLog?._id) === String(pending._id)
    ) {
      return
    }

    useTimerStore.getState().openPendingClosingNote(pending)
  }, [query.data, setActiveState, dismissedPendingNoteId])

  return query
}

export function useTimerActions() {
  const qc = useQueryClient()
  const openNoteDialog = useTimerStore((s) => s.openNoteDialog)
  const openPendingClosingNote = useTimerStore((s) => s.openPendingClosingNote)
  const closeNoteDialog = useTimerStore((s) => s.closeNoteDialog)

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['timelogs', 'active'] })
    qc.invalidateQueries({ queryKey: ['tasks'] })
  }, [qc])

  function handleConflict(err, pendingAction) {
    const data = err.response?.data?.data
    if (err.response?.status !== 409) return { handled: false }

    if (data?.pendingNote) {
      useTimerStore.getState().openPendingClosingNote(data.pendingNote)
      return { handled: true, invalidate: true }
    }

    if (data?.activeSession) {
      useTimerStore.getState().openNoteDialog({
        timeLog: data.activeSession,
        mode: 'switch',
        pendingAction,
      })
      return { handled: true, invalidate: false }
    }

    return { handled: false }
  }

  const completeTimerSwitch = useMutation({
    mutationFn: async ({ timeLog, closingNote, closingNoteStageId, pendingAction }) => {
      const note = closingNote.trim()

      if (timeLog.type === 'task') {
        const taskId = timeLog.taskId?._id || timeLog.taskId
        await api.post(`/tasks/${taskId}/timer/stop`, { closingNote: note, closingNoteStageId })
      } else if (timeLog.type === 'break') {
        await api.post('/timelogs/break/stop', { closingNote: note })
      } else if (timeLog.type === 'training') {
        await api.post('/timelogs/training/stop', { closingNote: note, closingNoteStageId })
      }

      if (pendingAction.type === 'task') {
        return api.post(`/tasks/${pendingAction.taskId}/timer/start`)
      }
      if (pendingAction.type === 'break') {
        return api.post('/timelogs/break/start')
      }
      if (pendingAction.type === 'training') {
        return api.post('/timelogs/training/start')
      }

      throw new Error('Unknown timer action')
    },
    onSuccess: (res) => {
      toast.success(res.data.message || 'Timer started')
      closeNoteDialog()
      invalidate()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not switch timer'),
  })

  const startTaskTimer = useMutation({
    mutationFn: (taskId) => api.post(`/tasks/${taskId}/timer/start`),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Timer started')
      invalidate()
    },
    onError: (err, taskId) => {
      const result = handleConflict(err, { type: 'task', taskId })
      if (!result.handled) {
        toast.error(err.response?.data?.message || 'Could not start timer')
      } else if (result.invalidate) {
        invalidate()
      }
    },
  })

  const stopTaskTimer = useMutation({
    mutationFn: ({ taskId, closingNote, closingNoteStageId }) =>
      api.post(`/tasks/${taskId}/timer/stop`, { closingNote, closingNoteStageId }),
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
      const result = handleConflict(err, { type: 'break' })
      if (!result.handled) {
        toast.error(err.response?.data?.message || 'Could not start break')
      } else if (result.invalidate) {
        invalidate()
      }
    },
  })

  const stopBreak = useMutation({
    mutationFn: ({ closingNote, closingNoteStageId }) =>
      api.post('/timelogs/break/stop', { closingNote, closingNoteStageId }),
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
      const result = handleConflict(err, { type: 'training' })
      if (!result.handled) {
        toast.error(err.response?.data?.message || 'Could not start training')
      } else if (result.invalidate) {
        invalidate()
      }
    },
  })

  const stopTraining = useMutation({
    mutationFn: ({ closingNote, closingNoteStageId }) =>
      api.post('/timelogs/training/stop', { closingNote, closingNoteStageId }),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Training stopped')
      closeNoteDialog()
      invalidate()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not stop training'),
  })

  const submitPendingNote = useMutation({
    mutationFn: ({ closingNote, closingNoteStageId, timeLogId }) =>
      api.post('/timelogs/pending-note', { closingNote, closingNoteStageId, timeLogId }),
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
    completeTimerSwitch,
    openNoteDialog,
    openPendingClosingNote,
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

export function useTask(id, options = {}) {
  return useQuery({
    queryKey: ['tasks', id],
    queryFn: async () => {
      const { data } = await api.get(`/tasks/${id}`)
      return data.data
    },
    enabled: !!id,
    ...options,
  })
}

export function useTaskMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['tasks'] })
    qc.invalidateQueries({ queryKey: ['task-suggestions'] })
  }

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

  const complete = useMutation({
    mutationFn: ({ id, completionDate }) =>
      api.post(`/tasks/${id}/complete`, { completionDate }),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Task completed')
      invalidate()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to complete task'),
  })

  const ignore = useMutation({
    mutationFn: ({ id, ignoreDate, remarks }) =>
      api.post(`/tasks/${id}/ignore`, { ignoreDate, remarks }),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Task ignored')
      invalidate()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to ignore task'),
  })

  return { create, update, remove, complete, ignore }
}

export function useRecurringCheck(clientId, serviceId) {
  return useQuery({
    queryKey: ['tasks', 'recurring-check', clientId, serviceId],
    queryFn: async () => {
      const { data } = await api.get('/tasks/recurring/check', {
        params: { clientId, serviceId },
      })
      return data.data
    },
    enabled: Boolean(clientId && serviceId),
  })
}

export function useTaskSuggestions() {
  return useQuery({
    queryKey: ['task-suggestions'],
    queryFn: async () => {
      const { data } = await api.get('/tasks/suggestions')
      return data.data
    },
    refetchInterval: 60_000,
  })
}

export function useSuggestionMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['task-suggestions'] })
    qc.invalidateQueries({ queryKey: ['tasks'] })
  }

  const accept = useMutation({
    mutationFn: (id) => api.post(`/tasks/suggestions/${id}/accept`),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Suggested task created')
      invalidate()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to accept suggestion'),
  })

  const dismiss = useMutation({
    mutationFn: (id) => api.post(`/tasks/suggestions/${id}/dismiss`),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Suggestion dismissed')
      invalidate()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to dismiss suggestion'),
  })

  return { accept, dismiss }
}
