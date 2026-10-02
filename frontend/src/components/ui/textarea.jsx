import { forwardRef } from 'react'
import { cn } from '@/lib/utils'
import { useUkAutocorrectHandlers } from '@/hooks/useUkAutocorrectHandlers'

export const Textarea = forwardRef(function Textarea(
  {
    className,
    onBlur,
    onChange,
    onKeyDown,
    readOnly,
    disabled,
    spellCheck,
    lang,
    autoCorrect,
    ...props
  },
  ref
) {
  const { enableUk, handleChange, handleBlur, handleKeyDown } = useUkAutocorrectHandlers({
    type: 'text',
    readOnly,
    disabled,
    onChange,
    onBlur,
    onKeyDown,
  })

  return (
    <textarea
      ref={ref}
      readOnly={readOnly}
      disabled={disabled}
      {...props}
      lang={lang ?? (enableUk ? 'en-GB' : undefined)}
      spellCheck={spellCheck ?? enableUk}
      autoCorrect={autoCorrect ?? (enableUk ? 'on' : undefined)}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={cn(
        'flex min-h-[88px] w-full resize-y rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
    />
  )
})
