import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useUkAutocorrectHandlers } from '@/hooks/useUkAutocorrectHandlers'
import { useUkSpellcheck } from '@/hooks/useUkSpellcheck'
import { SpellcheckBackdrop, SpellSuggestionMenu } from '@/components/ui/spellcheck-ui'

/**
 * Textarea with optional UK English spellcheck (red underlines + suggestions).
 *
 * - ukSpellcheck (default true): Chrome-like underlines + right-click suggestions
 * - ukAutocorrect (default false): silent auto-replace on Space/blur — off in production
 */
export const Textarea = forwardRef(function Textarea(
  {
    className,
    onBlur,
    onChange,
    onKeyDown,
    onSelect,
    onScroll,
    onContextMenu,
    readOnly,
    disabled,
    spellCheck,
    lang,
    autoCorrect,
    ukSpellcheck = true,
    ukAutocorrect = false,
    value,
    defaultValue,
    ...props
  },
  ref
) {
  const fieldRef = useRef(null)
  useImperativeHandle(ref, () => fieldRef.current)

  const [mirrorText, setMirrorText] = useState(() =>
    value != null ? String(value) : defaultValue != null ? String(defaultValue) : ''
  )
  const [scroll, setScroll] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (value != null) setMirrorText(String(value))
  }, [value])

  const {
    enableUk,
    handleChange: autoChange,
    handleBlur,
    handleKeyDown,
  } = useUkAutocorrectHandlers({
    type: 'text',
    readOnly,
    disabled,
    ukSpellcheck,
    ukAutocorrect,
    onChange,
    onBlur,
    onKeyDown,
  })

  const {
    misspellings,
    menu,
    closeMenu,
    applySuggestion,
    handleContextMenu: spellContextMenu,
    handleSelect: spellSelect,
    notifyScanAfterChange,
  } = useUkSpellcheck({
    type: 'text',
    readOnly,
    disabled,
    ukSpellcheck,
    value: value != null ? String(value) : mirrorText,
    onChange,
    fieldRef,
  })

  const handleChange = useCallback(
    (e) => {
      autoChange(e)
      setMirrorText(e.currentTarget.value)
      notifyScanAfterChange(e.currentTarget)
    },
    [autoChange, notifyScanAfterChange]
  )

  const handleBlurWrapped = useCallback(
    (e) => {
      handleBlur(e)
      setMirrorText(e.currentTarget.value)
      notifyScanAfterChange(e.currentTarget)
    },
    [handleBlur, notifyScanAfterChange]
  )

  const handleContextMenu = useCallback(
    (e) => {
      onContextMenu?.(e)
      if (!e.defaultPrevented) spellContextMenu(e)
    },
    [onContextMenu, spellContextMenu]
  )

  const handleSelect = useCallback(
    (e) => {
      onSelect?.(e)
      spellSelect(e)
    },
    [onSelect, spellSelect]
  )

  const handleScroll = useCallback(
    (e) => {
      setScroll({ top: e.currentTarget.scrollTop, left: e.currentTarget.scrollLeft })
      onScroll?.(e)
    },
    [onScroll]
  )

  const showSpellUi = enableUk

  return (
    <div className={cn('relative w-full', showSpellUi && 'uk-spell-shell')}>
      {showSpellUi ? (
        <SpellcheckBackdrop
          text={mirrorText}
          misspellings={misspellings}
          multiline
          scrollTop={scroll.top}
          scrollLeft={scroll.left}
          className="leading-5"
        />
      ) : null}
      <textarea
        ref={fieldRef}
        readOnly={readOnly}
        disabled={disabled}
        {...(value !== undefined ? { value } : {})}
        {...(defaultValue !== undefined && value === undefined ? { defaultValue } : {})}
        {...props}
        lang={lang ?? (enableUk ? 'en-GB' : undefined)}
        spellCheck={enableUk ? false : (spellCheck ?? false)}
        autoCorrect={autoCorrect ?? 'off'}
        autoCapitalize={enableUk ? 'off' : undefined}
        autoComplete={props.autoComplete ?? 'off'}
        onChange={handleChange}
        onBlur={handleBlurWrapped}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
        onSelect={handleSelect}
        onScroll={handleScroll}
        className={cn(
          'relative z-[1] flex min-h-[88px] w-full resize-y rounded-lg border border-border bg-transparent px-3 py-2 text-sm leading-5 text-foreground placeholder:text-muted-foreground transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50',
          !showSpellUi && 'bg-white',
          className
        )}
        data-uk-spellcheck={enableUk ? 'true' : undefined}
      />
      {showSpellUi ? (
        <SpellSuggestionMenu menu={menu} onPick={applySuggestion} onClose={closeMenu} />
      ) : null}
    </div>
  )
})
