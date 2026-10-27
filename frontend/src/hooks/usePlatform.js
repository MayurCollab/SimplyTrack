import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

export function useOrganizations() {
  return useQuery({
    queryKey: ['platform', 'organizations'],
    queryFn: async () => {
      const { data } = await api.get('/platform/organizations')
      return data.data
    },
  })
}

export function useOrganizationStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isActive }) =>
      api.patch(`/platform/organizations/${id}/status`, { isActive }),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Organization updated')
      qc.invalidateQueries({ queryKey: ['platform', 'organizations'] })
    },
    onError: (err) =>
      toast.error(err.response?.data?.message || 'Could not update organization'),
  })
}

export function useEnterOrganization() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  return useMutation({
    mutationFn: (id) => api.post(`/platform/organizations/${id}/enter`),
    onSuccess: (res) => {
      qc.clear()
      setAuth({ user: res.data.user, accessToken: res.data.accessToken })
      navigate('/dashboard')
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not open organization'),
  })
}

export function useExitOrganization() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  return useMutation({
    mutationFn: () => api.post('/platform/exit'),
    onSuccess: (res) => {
      qc.clear()
      setAuth({ user: res.data.user, accessToken: res.data.accessToken })
      toast.success('Left organization')
      navigate('/organizations')
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not leave organization'),
  })
}

export function useAdmins() {
  return useQuery({
    queryKey: ['platform', 'admins'],
    queryFn: async () => {
      const { data } = await api.get('/platform/admins')
      return data.data
    },
  })
}

export function useAdminMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['platform', 'admins'] })

  const create = useMutation({
    mutationFn: (body) => api.post('/platform/admins', body),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Admin added')
      invalidate()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not add admin'),
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, isActive }) => api.patch(`/platform/admins/${id}/status`, { isActive }),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Admin updated')
      invalidate()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not update admin'),
  })

  return { create, updateStatus }
}
