export function homePath(user) {
  if (user?.isSuperAdmin && !user.actingOrganizationId) return '/organizations'
  return '/dashboard'
}
