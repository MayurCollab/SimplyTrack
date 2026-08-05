import { cn } from '@/lib/utils'
import logo from '@/assets/simplytrack-logo.png'

const SIZES = {
  sm: { img: 'size-7', text: 'text-base' },
  md: { img: 'size-8', text: 'text-lg' },
  lg: { img: 'size-10', text: 'text-2xl' },
  xl: { img: 'size-14', text: 'text-2xl' },
}

const TEXT_TRANSITION =
  'transition-[max-width,opacity,margin] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]'

export function Logo({ showText = true, collapsed = false, animate = false, size = 'md', className }) {
  const { img, text } = SIZES[size] ?? SIZES.md
  const renderText = animate || showText

  return (
    <div className={cn('flex min-w-0 items-center', animate ? 'gap-0' : 'gap-2.5', className)}>
      <img
        src={logo}
        alt="SimplyTrack"
        className={cn('shrink-0 object-contain', img)}
      />
      {renderText && (
        <span
          className={cn(
            'truncate font-semibold tracking-tight text-foreground',
            text,
            animate && [
              TEXT_TRANSITION,
              'overflow-hidden whitespace-nowrap',
              collapsed ? 'max-w-0 opacity-0' : 'ml-2.5 max-w-[9rem] opacity-100',
            ]
          )}
          aria-hidden={animate && collapsed}
        >
          SimplyTrack
        </span>
      )}
    </div>
  )
}
