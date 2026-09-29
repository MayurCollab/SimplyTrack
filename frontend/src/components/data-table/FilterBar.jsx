import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

export function FilterBar({ search, onSearchChange, placeholder = 'Search…', children }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-white p-3 shadow-sm">
      <div className="relative min-w-[200px] flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={placeholder}
          className="pl-9"
        />
      </div>
      {children}
    </div>
  )
}
