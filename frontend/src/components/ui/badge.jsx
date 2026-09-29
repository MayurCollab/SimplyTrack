import { cn } from '@/lib/utils'

export function Badge({ className, variant = 'default', children, ...props }) {
  const variants = {
    default: 'bg-slate-100 text-slate-800',
    success: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    warning: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
    destructive: 'bg-red-50 text-red-700 ring-1 ring-red-200',
    outline: 'border border-border bg-white text-foreground',
    indigo: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
    sky: 'bg-sky-50 text-sky-800 ring-1 ring-sky-200',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}
