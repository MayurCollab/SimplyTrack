import { useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '@/lib/api'
import { useTimerStore } from '@/store/timerStore'
import { useAuthStore } from '@/store/authStore'

export function useActiveTimer() {
  const setActiveState = useTimerStore((s) => s.setActiveState)
  const dismissedPendingNoteId = useTimerStore((s) => s.dismissedPendingNoteId)
  const user = useAuthStore((s) => s.user)
  const inFirm = Boolean(
    user && (!user.isSuperAdmin || user.actingOrganizationId) && (user.organizationId || user.actingOrganizationId)
  )

  const query = useQuery({
    queryKey: ['timelogs', 'active'],
    queryFn: async () => {
      const { data } = await api.get('/timelogs/active')
      return data.data
    },
    enabled: inFirm,
    staleTime: 10_000,
    refetchInterval: inFirm ? 30_000 : false,
    placeholderData: (prev) => prev,
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

  /** Light refresh — avoid full task-list refetch on every timer click */
  const refreshActive = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['timelogs', 'active'] })
    void qc.invalidateQueries({ queryKey: ['dashboard', 'overview'] })
  }, [qc])

  const patchTaskLoggedMinutes = useCallback(
    (task) => {
      if (!task?._id) return
      const id = String(task._id)
      qc.setQueriesData({ queryKey: ['tasks'] }, (old) => {
        if (!Array.isArray(old)) {
          if (old && String(old._id) === id) {
            return { ...old, totalLoggedMinutes: task.totalLoggedMinutes ?? old.totalLoggedMinutes }
          }
          return old
        }
        return old.map((t) =>
          String(t._id) === id
            ? {
                ...t,
                totalLoggedMinutes: task.totalLoggedMinutes ?? t.totalLoggedMinutes,
                lastTimerStoppedAt: task.lastTimerStoppedAt || new Date().toISOString(),
              }
            : t
        )
      })
    },
    [qc]
  )

  const patchActiveFromSession = useCallback(
    (session) => {
      if (!session) return
      const prev = qc.getQueryData(['timelogs', 'active']) || {}
      qc.setQueryData(['timelogs', 'active'], {
        ...prev,
        active: session,
        pendingNote: null,
      })
    },
    [qc]
  )

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
        await api.post('/timelogs/training/stop', { closingNote: note })
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
      patchActiveFromSession(res.data.data)
      refreshActive()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not switch timer'),
  })

  const startTaskTimer = useMutation({
    mutationFn: (taskId) => api.post(`/tasks/${taskId}/timer/start`),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Timer started')
      patchActiveFromSession(res.data.data)
      const session = res.data.data
      const taskId = session?.taskId?._id || session?.taskId
      if (taskId) {
        qc.setQueriesData({ queryKey: ['tasks'] }, (old) => {
          if (!Array.isArray(old)) return old
          return old.map((t) =>
            String(t._id) === String(taskId)
              ? { ...t, lastTimerStartedAt: session.startedAt || new Date().toISOString() }
              : t
          )
        })
      }
    },
    onError: (err, taskId) => {
      const result = handleConflict(err, { type: 'task', taskId })
      if (!result.handled) {
        toast.error(err.response?.data?.message || 'Could not start timer')
      } else if (result.invalidate) {
        refreshActive()
      }
    },
  })

  const stopTaskTimer = useMutation({
    mutationFn: ({ taskId, closingNote, closingNoteStageId }) =>
      api.post(`/tasks/${taskId}/timer/stop`, { closingNote, closingNoteStageId }),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Timer stopped')
      closeNoteDialog()
      const prev = qc.getQueryData(['timelogs', 'active']) || {}
      qc.setQueryData(['timelogs', 'active'], { ...prev, active: null, pendingNote: null })
      patchTaskLoggedMinutes(res.data.data?.task)
      void qc.invalidateQueries({ queryKey: ['dashboard', 'overview'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not stop timer'),
  })

  const startBreak = useMutation({
    mutationFn: () => api.post('/timelogs/break/start'),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Break started')
      patchActiveFromSession(res.data.data)
    },
    onError: (err) => {
      const result = handleConflict(err, { type: 'break' })
      if (!result.handled) {
        toast.error(err.response?.data?.message || 'Could not start break')
      } else if (result.invalidate) {
        refreshActive()
      }
    },
  })

  const stopBreak = useMutation({
    mutationFn: ({ closingNote, closingNoteStageId }) =>
      api.post('/timelogs/break/stop', { closingNote, closingNoteStageId }),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Break stopped')
      closeNoteDialog()
      const prev = qc.getQueryData(['timelogs', 'active']) || {}
      qc.setQueryData(['timelogs', 'active'], { ...prev, active: null, pendingNote: null })
      refreshActive()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not stop break'),
  })

  const startTraining = useMutation({
    mutationFn: () => api.post('/timelogs/training/start'),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Training started')
      patchActiveFromSession(res.data.data)
    },
    onError: (err) => {
      const result = handleConflict(err, { type: 'training' })
      if (!result.handled) {
        toast.error(err.response?.data?.message || 'Could not start training')
      } else if (result.invalidate) {
        refreshActive()
      }
    },
  })

  const stopTraining = useMutation({
    mutationFn: ({ closingNote, closingNoteStageId }) =>
      api.post('/timelogs/training/stop', { closingNote, closingNoteStageId }),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Training stopped')
      closeNoteDialog()
      const prev = qc.getQueryData(['timelogs', 'active']) || {}
      qc.setQueryData(['timelogs', 'active'], { ...prev, active: null, pendingNote: null })
      refreshActive()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not stop training'),
  })

  const submitPendingNote = useMutation({
    mutationFn: ({ closingNote, closingNoteStageId, timeLogId }) =>
      api.post('/timelogs/pending-note', { closingNote, closingNoteStageId, timeLogId }),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Closing note saved')
      closeNoteDialog()
      refreshActive()
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
    staleTime: 15_000,
    placeholderData: (prev) => prev,
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

  const create = useMutation({
    mutationFn: (body) => api.post('/tasks', body),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Task created')
      const created = res.data.data
      if (created) {
        qc.setQueryData(['tasks', created._id], created)
        qc.setQueriesData({ queryKey: ['tasks'] }, (old) => {
          if (!Array.isArray(old)) return old
          if (old.some((t) => String(t._id) === String(created._id))) return old
          return [created, ...old]
        })
      }
      void qc.invalidateQueries({ queryKey: ['task-suggestions'] })
      void qc.invalidateQueries({ queryKey: ['dashboard', 'overview'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to create task'),
  })

  const update = useMutation({
    mutationFn: ({ id, ...body }) => api.patch(`/tasks/${id}`, body),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Task updated')
      const updated = res.data.data
      if (updated) {
        qc.setQueryData(['tasks', updated._id], updated)
        qc.setQueriesData({ queryKey: ['tasks'] }, (old) => {
          if (!Array.isArray(old)) return old
          return old.map((t) =>
            String(t._id) === String(updated._id) ? { ...t, ...updated } : t
          )
        })
      }
      void qc.invalidateQueries({ queryKey: ['dashboard', 'overview'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to update task'),
  })

  /** Fast description-only save — patches cache, no full list/dashboard refetch */
  const saveDescription = useMutation({
    mutationFn: ({ id, description }) => api.patch(`/tasks/${id}`, { description }),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Task description saved')
      const updated = res.data.data
      if (updated) {
        qc.setQueryData(['tasks', updated._id], updated)
        qc.setQueriesData({ queryKey: ['tasks'] }, (old) => {
          if (!Array.isArray(old)) return old
          return old.map((t) =>
            String(t._id) === String(updated._id)
              ? {
                  ...t,
                  description: updated.description,
                  descriptionHistory: updated.descriptionHistory,
                  descriptionMentions: updated.descriptionMentions,
                }
              : t
          )
        })
      }
    },
    onError: (err) =>
      toast.error(err.response?.data?.message || 'Failed to save description'),
  })

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/tasks/${id}`),
    onSuccess: (res, id) => {
      toast.success(res.data.message || 'Task deleted')
      qc.removeQueries({ queryKey: ['tasks', id] })
      qc.setQueriesData({ queryKey: ['tasks'] }, (old) => {
        if (!Array.isArray(old)) return old
        return old.filter((t) => String(t._id) !== String(id))
      })
      void qc.invalidateQueries({ queryKey: ['dashboard', 'overview'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to delete task'),
  })

  const complete = useMutation({
    mutationFn: ({ id, completionDate }) =>
      api.post(`/tasks/${id}/complete`, { completionDate }),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Task completed')
      const updated = res.data.data
      if (updated) {
        qc.setQueryData(['tasks', updated._id], updated)
        qc.setQueriesData({ queryKey: ['tasks'] }, (old) => {
          if (!Array.isArray(old)) return old
          return old.map((t) => (String(t._id) === String(updated._id) ? { ...t, ...updated } : t))
        })
      }
      // Cache already patched — refresh dashboard in background only
      void qc.invalidateQueries({ queryKey: ['dashboard', 'overview'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to complete task'),
  })

  const ignore = useMutation({
    mutationFn: ({ id, ignoreDate, remarks }) =>
      api.post(`/tasks/${id}/ignore`, { ignoreDate, remarks }),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Task ignored')
      const updated = res.data.data
      if (updated) {
        qc.setQueryData(['tasks', updated._id], updated)
        qc.setQueriesData({ queryKey: ['tasks'] }, (old) => {
          if (!Array.isArray(old)) return old
          return old.map((t) => (String(t._id) === String(updated._id) ? { ...t, ...updated } : t))
        })
      }
      void qc.invalidateQueries({ queryKey: ['dashboard', 'overview'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to ignore task'),
  })

  return { create, update, saveDescription, remove, complete, ignore }
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
    qc.invalidateQueries({ queryKey: ['dashboard', 'overview'] })
  }

  const accept = useMutation({
    mutationFn: (id) => api.post(`/tasks/suggestions/${id}/accept`),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Converted to task')
      invalidate()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to convert to task'),
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
