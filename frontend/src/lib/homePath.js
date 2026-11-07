export function homePath(user) {
  if (user?.isSuperAdmin && !user.actingOrganizationId) return '/organizations'
  return '/dashboard'
}

/** Prefer dashboard when allowed; otherwise first firm module the user can view. */
export function homePathWithPermissions(user, can) {
  if (user?.isSuperAdmin && !user.actingOrganizationId) return '/organizations'
  if (!can || can('dashboard', 'view')) return '/dashboard'
  const fallbacks = [
    ['tasks', '/tasks'],
    ['clients', '/clients'],
    ['projects', '/projects'],
    ['services', '/services'],
    ['reports', '/reports'],
    ['team_status', '/team-status'],
    ['settings', '/settings'],
  ]
  for (const [module, path] of fallbacks) {
    if (can(module, 'view')) return path
  }
  return '/tasks'
}
