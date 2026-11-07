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
    const actions = data?.[module]
    if (!actions) return false
    if (actions[action] != null) return Boolean(actions[action])
    // Back-compat for new task description flags not yet set in Permissions
    if (module === 'tasks' && action === 'saveTaskDescription') {
      return Boolean(actions.add)
    }
    if (module === 'tasks' && action === 'editTaskDescription') {
      return Boolean(actions.edit)
    }
    return false
  }

  return { permissions: data, isLoading, can }
}

export function usePermission(module, action) {
  const { can, isLoading } = usePermissions()
  return { allowed: can(module, action), isLoading }
}
