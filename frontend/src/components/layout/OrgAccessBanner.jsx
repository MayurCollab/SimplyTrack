import { Button } from '@/components/ui/button'
import { useExitOrganization } from '@/hooks/usePlatform'
import { useAuthStore } from '@/store/authStore'

export function OrgAccessBanner() {
  const user = useAuthStore((s) => s.user)
  const exit = useExitOrganization()

  if (!user?.isSuperAdmin || !user.actingOrganizationId) return null

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-6 py-2">
      <p className="text-sm text-amber-950">
        Viewing <span className="font-semibold">{user.organizationName || 'organization'}</span>
      </p>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => exit.mutate()}
        disabled={exit.isPending}
      >
        {exit.isPending ? 'Leaving…' : 'Exit'}
      </Button>
    </div>
  )
}
