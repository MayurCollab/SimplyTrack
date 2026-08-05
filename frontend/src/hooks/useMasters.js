import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '@/lib/api'

export function useStages(search = '') {
  return useQuery({
    queryKey: ['stages', search],
    queryFn: async () => {
      const { data } = await api.get('/stages', { params: { search } })
      return data.data
    },
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

export function useServices(search = '') {
  return useQuery({
    queryKey: ['services', search],
    queryFn: async () => {
      const { data } = await api.get('/services', { params: { search } })
      return data.data
    },
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
  })
}

export function useClientMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['clients'] })

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

  return { create, update, updateStatus }
}

export function useProjects(filters = {}) {
  return useQuery({
    queryKey: ['projects', filters],
    queryFn: async () => {
      const { data } = await api.get('/projects', { params: filters })
      return data.data
    },
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
  })
}

export function useUsers(search = '') {
  return useQuery({
    queryKey: ['users', search],
    queryFn: async () => {
      const { data } = await api.get('/users', { params: { search } })
      return data.data
    },
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
