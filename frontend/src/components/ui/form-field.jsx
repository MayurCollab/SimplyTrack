import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'

export function FormField({ label, htmlFor, error, required, children, className }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <Label htmlFor={htmlFor} required={required}>
          {label}
        </Label>
      ) : null}
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}

export function FormRow({ children, className }) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2', className)}>
      {children}
    </div>
  )
}

export function FormSwitchRow({ label, children }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3">
      <Label className="mb-0">{label}</Label>
      {children}
    </div>
  )
}
