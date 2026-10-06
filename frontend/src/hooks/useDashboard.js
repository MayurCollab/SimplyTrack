import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'

export function useDashboardOverview() {
  return useQuery({
    queryKey: ['dashboard', 'overview'],
    queryFn: async () => {
      const { data } = await api.get('/dashboard/overview')
      return data.data
    },
  })
}
