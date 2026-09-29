import { format } from 'date-fns'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePermission } from '@/hooks/usePermissions'
import { useTaskSuggestions, useSuggestionMutations } from '@/hooks/useTimer'

export function SuggestedTasksBanner() {
  const { allowed: canAdd } = usePermission('tasks', 'add')
  const { allowed: canEdit } = usePermission('tasks', 'edit')
  const { data: suggestions = [], isLoading } = useTaskSuggestions()
  const { accept, dismiss } = useSuggestionMutations()

  if (isLoading || !suggestions.length) return null

  return (
    <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-sky-900">Suggested recurring tasks</h2>
        <span className="text-xs text-sky-700">{suggestions.length} pending</span>
      </div>
      <ul className="space-y-2">
        {suggestions.map((s) => (
          <li
            key={s._id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-sky-100 bg-white px-3 py-2 text-sm"
          >
            <div>
              <p className="font-medium text-foreground">
                {s.clientId?.organizationName || 'Client'} — {s.serviceId?.name || 'Service'} —{' '}
                {s.compliancePeriodValue}
              </p>
              <p className="text-xs font-semibold text-muted-foreground">
                Due{' '}
                <span className="font-bold text-slate-800">
                  {s.dueDate ? format(new Date(s.dueDate), 'dd/MM/yyyy') : '—'}
                </span>
                {s.recurrenceId?.frequency ? ` · ${s.recurrenceId.frequency}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {canAdd && (
                <Button
                  size="sm"
                  onClick={() => accept.mutate(s._id)}
                  disabled={accept.isPending}
                >
                  <Check className="size-3.5" />
                  Accept
                </Button>
              )}
              {canEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => dismiss.mutate(s._id)}
                  disabled={dismiss.isPending}
                >
                  <X className="size-3.5" />
                  Dismiss
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
