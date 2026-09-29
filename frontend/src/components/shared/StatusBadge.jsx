import { cn } from '@/lib/utils'

const PRIORITY = {
  low: 'bg-sky-50 text-sky-800 ring-1 ring-sky-200',
  medium: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
  high: 'bg-red-50 text-red-700 ring-1 ring-red-200',
}

export function PriorityBadge({ priority }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold capitalize',
        PRIORITY[priority] || PRIORITY.medium
      )}
    >
      {priority}
    </span>
  )
}

export function StatusBadge({ name, color }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{
        backgroundColor: `${color || '#6B7280'}22`,
        color: color || '#6B7280',
      }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: color || '#6B7280' }} />
      {name}
    </span>
  )
}
