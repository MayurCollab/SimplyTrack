import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export function FilterBar({
  search,
  onSearchChange,
  placeholder = 'Search…',
  children,
  className,
}) {
  return (
    <div
      className={cn(
        'mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-white p-3 shadow-sm',
        className
      )}
    >
      <div className="relative min-w-[220px] flex-1 basis-[240px] max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={placeholder}
          className="pl-9"
          ukSpellcheck={false}
        />
      </div>
      {children}
    </div>
  )
}
