import { forwardRef } from 'react'
import { cn } from '@/lib/utils'
import { useUkAutocorrectHandlers } from '@/hooks/useUkAutocorrectHandlers'

export const Input = forwardRef(function Input(
  {
    className,
    type = 'text',
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
    type,
    readOnly,
    disabled,
    onChange,
    onBlur,
    onKeyDown,
  })

  return (
    <input
      ref={ref}
      type={type}
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
        'flex h-10 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
    />
  )
})
