import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const SIZE_CLASSES = {
  sm: 'max-w-md max-h-[85vh]',
  md: 'max-w-xl max-h-[90vh]',
  lg: 'max-w-4xl max-h-[94vh]',
  xl: 'max-w-6xl max-h-[96vh]',
  full: 'w-[min(96vw,90rem)] max-w-[96vw] h-[min(96vh,960px)] max-h-[96vh]',
}

export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  footer,
  className,
  size = 'lg',
}) {
  useEffect(() => {
    if (!open) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div
        className="modal-backdrop absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        className={cn(
          'modal-panel relative flex w-full flex-col overflow-hidden rounded-xl border border-border bg-white shadow-xl',
          SIZE_CLASSES[size] || SIZE_CLASSES.lg,
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-indigo-100 bg-indigo-50/50 px-5 py-3 sm:px-6 sm:py-3.5">
          <h2 id="sheet-title" className="text-lg font-bold text-slate-900">
            {title}
          </h2>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>

        <div className="modal-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6 sm:py-4">
          {children}
        </div>

        {footer ? (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-surface/60 px-5 py-3 sm:px-6 sm:py-3.5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  )
}
