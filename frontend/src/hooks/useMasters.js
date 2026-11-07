import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

/** Super-admin on platform view has no org until they enter a firm. */
function useFirmContext() {
  const user = useAuthStore((s) => s.user)
  if (!user) return false
  if (user.isSuperAdmin) return Boolean(user.actingOrganizationId)
  return Boolean(user.organizationId)
}

export function useStages(search = '', type = 'workflow') {
  const inFirm = useFirmContext()
  return useQuery({
    queryKey: ['stages', type, search],
    queryFn: async () => {
      const { data } = await api.get('/stages', { params: { search, type } })
      return data.data
    },
    enabled: inFirm,
    staleTime: 60_000,
  })
}

export function useStageMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['stages'] })

  const create = useMutation({
    mutationFn: (body) => api.post('/stages', body),
    onSuccess: (res) => { toast.success(res.data.message || 'Stage created'); invalidate() },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to create stage'),
  })

  const update = useMutation({
    mutationFn: ({ id, ...body }) => api.patch(`/stages/${id}`, body),
    onSuccess: (res) => { toast.success(res.data.message || 'Stage updated'); invalidate() },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to update stage'),
  })

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/stages/${id}`),
    onSuccess: (res) => { toast.success(res.data.message || 'Stage deleted'); invalidate() },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to delete stage'),
  })

  return { create, update, remove }
}

export function useClosingNoteStages(search = '') {
  return useStages(search, 'closing_note')
}

export function useServices(search = '') {
  return useQuery({
    queryKey: ['services', search],
    queryFn: async () => {
      const { data } = await api.get('/services', { params: { search } })
      return data.data
    },
    staleTime: 60_000,
  })
}

export function useServiceMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['services'] })

  const create = useMutation({
    mutationFn: (body) => api.post('/services', body),
    onSuccess: (res) => { toast.success(res.data.message || 'Service created'); invalidate() },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to create service'),
  })

  const update = useMutation({
    mutationFn: ({ id, ...body }) => api.patch(`/services/${id}`, body),
    onSuccess: (res) => { toast.success(res.data.message || 'Service updated'); invalidate() },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to update service'),
  })

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/services/${id}`),
    onSuccess: (res) => { toast.success(res.data.message || 'Service deleted'); invalidate() },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to delete service'),
  })

  return { create, update, remove }
}

export function useClients(search = '') {
  return useQuery({
    queryKey: ['clients', search],
    queryFn: async () => {
      const { data } = await api.get('/clients', { params: { search } })
      return data.data
    },
    staleTime: 60_000,
  })
}

export function useClientMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['clients'] })
    qc.invalidateQueries({ queryKey: ['dashboard', 'overview'] })
  }

  const create = useMutation({
    mutationFn: (body) => api.post('/clients', body),
    onSuccess: (res) => { toast.success(res.data.message || 'Client created'); invalidate() },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to create client'),
  })

  const update = useMutation({
    mutationFn: ({ id, ...body }) => api.patch(`/clients/${id}`, body),
    onSuccess: (res) => { toast.success(res.data.message || 'Client updated'); invalidate() },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to update client'),
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, isActive }) => api.patch(`/clients/${id}/status`, { isActive }),
    onSuccess: (res) => { toast.success(res.data.message || 'Client status updated'); invalidate() },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to update status'),
  })

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/clients/${id}`),
    onSuccess: (res) => { toast.success(res.data.message || 'Client deleted'); invalidate() },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to delete client'),
  })

  return { create, update, updateStatus, remove }
}

export function useProjects(filters = {}) {
  return useQuery({
    queryKey: ['projects', filters],
    queryFn: async () => {
      const { data } = await api.get('/projects', { params: filters })
      return data.data
    },
    staleTime: 60_000,
  })
}

export function useProjectMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['projects'] })

  const create = useMutation({
    mutationFn: (body) => api.post('/projects', body),
    onSuccess: (res) => { toast.success(res.data.message || 'Project created'); invalidate() },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to create project'),
  })

  const update = useMutation({
    mutationFn: ({ id, ...body }) => api.patch(`/projects/${id}`, body),
    onSuccess: (res) => { toast.success(res.data.message || 'Project updated'); invalidate() },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to update project'),
  })

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/projects/${id}`),
    onSuccess: (res) => { toast.success(res.data.message || 'Project deleted'); invalidate() },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to delete project'),
  })

  return { create, update, remove }
}

export function useManagers() {
  return useQuery({
    queryKey: ['users', 'managers'],
    queryFn: async () => {
      const { data } = await api.get('/users/managers')
      return data.data
    },
    staleTime: 60_000,
  })
}

export function useUsers(search = '') {
  return useQuery({
    queryKey: ['users', search],
    queryFn: async () => {
      const { data } = await api.get('/users', { params: { search } })
      return data.data
    },
    staleTime: 60_000,
  })
}

export function useUserMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['users'] })

  const create = useMutation({
    mutationFn: (body) => api.post('/users', body),
    onSuccess: (res) => { toast.success(res.data.message || 'User created'); invalidate() },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to create user'),
  })

  const update = useMutation({
    mutationFn: ({ id, ...body }) => api.patch(`/users/${id}`, body),
    onSuccess: (res) => { toast.success(res.data.message || 'User updated'); invalidate() },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to update user'),
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, isActive }) => api.patch(`/users/${id}/status`, { isActive }),
    onSuccess: (res) => { toast.success(res.data.message || 'User status updated'); invalidate() },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to update status'),
  })

  return { create, update, updateStatus }
}

export function useAlerts() {
  return useQuery({
    queryKey: ['alerts'],
    queryFn: async () => {
      const { data } = await api.get('/alerts')
      return data.data
    },
  })
}

export function useAlertMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['alerts'] })

  const create = useMutation({
    mutationFn: (body) => api.post('/alerts', body),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Alert created')
      invalidate()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to create alert'),
  })

  const update = useMutation({
    mutationFn: ({ id, ...body }) => api.patch(`/alerts/${id}`, body),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Alert updated')
      invalidate()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to update alert'),
  })

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/alerts/${id}`),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Alert deleted')
      invalidate()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to delete alert'),
  })

  return { create, update, remove }
}
