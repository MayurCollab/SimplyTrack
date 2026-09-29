import { cn } from '@/lib/utils'

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  type = 'button',
  disabled,
  children,
  ...props
}) {
  const variants = {
    primary:
      'bg-primary text-primary-foreground shadow-sm shadow-indigo-500/25 hover:bg-[#3d3ff2] hover:shadow-md hover:shadow-indigo-500/30 active:bg-[#3537e6] focus-visible:ring-primary',
    secondary:
      'bg-white text-slate-700 border border-slate-200 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 focus-visible:ring-primary',
    outline:
      'bg-white text-slate-700 border border-slate-200 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 focus-visible:ring-primary',
    ghost:
      'bg-transparent text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 focus-visible:ring-primary',
    destructive:
      'bg-rose-600 text-white shadow-sm shadow-rose-500/20 hover:bg-rose-700 active:bg-rose-800 focus-visible:ring-rose-500',
  }

  const sizes = {
    sm: 'h-8 px-3 text-sm',
    md: 'h-10 px-4 text-sm',
    lg: 'h-11 px-5 text-base',
  }

  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}
