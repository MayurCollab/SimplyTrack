import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

export function usePermissions() {
  const user = useAuthStore((s) => s.user)

  const { data, isLoading } = useQuery({
    queryKey: ['permissions', 'me', user?.id],
    queryFn: async () => {
      const { data } = await api.get('/permissions/me')
      return data.data
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  })

  function can(module, action) {
    if (!user) return false
    if (user.role === 'super_admin' || user.role === 'owner') return true
    return Boolean(data?.[module]?.[action])
  }

  return { permissions: data, isLoading, can }
}

export function usePermission(module, action) {
  const { can, isLoading } = usePermissions()
  return { allowed: can(module, action), isLoading }
}
