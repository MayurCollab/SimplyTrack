import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { homePath } from '@/lib/homePath'

export function PublicOnlyRoute() {
  const accessToken = useAuthStore((s) => s.accessToken)
  const user = useAuthStore((s) => s.user)

  if (accessToken) {
    return <Navigate to={homePath(user)} replace />
  }

  return <Outlet />
}
