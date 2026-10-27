import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { homePath } from '@/lib/homePath'

export function ProtectedRoute() {
  const accessToken = useAuthStore((s) => s.accessToken)
  const location = useLocation()

  if (!accessToken) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}

export function RequirePlatform() {
  const user = useAuthStore((s) => s.user)
  if (!user?.isSuperAdmin) {
    return <Navigate to={homePath(user)} replace />
  }
  return <Outlet />
}

export function RequireFirm() {
  const user = useAuthStore((s) => s.user)
  if (user?.isSuperAdmin && !user.actingOrganizationId) {
    return <Navigate to="/organizations" replace />
  }
  return <Outlet />
}
