import { useCallback } from 'react'
import {
  autocorrectUkText,
  autocorrectWordBeforeCaret,
  getUkSpellchecker,
  getUkSpellcheckerSync,
  shouldUkAutocorrect,
} from '@/lib/ukAutocorrect'

/**
 * Shared UK English autocorrect handlers for Input / Textarea.
 * - Live: corrects the previous word when Space / punctuation is typed
 * - Blur: corrects the whole field
 *
 * Corrections mutate the event target value *before* calling parent onChange,
 * so react-hook-form and controlled parents both see the fixed text.
 */
export function useUkAutocorrectHandlers({
  type = 'text',
  readOnly,
  disabled,
  onChange,
  onBlur,
  onKeyDown,
}) {
  const enableUk = shouldUkAutocorrect(type, readOnly, disabled)

  const handleChange = useCallback(
    (e) => {
      if (!enableUk) {
        onChange?.(e)
        return
      }

      const el = e.currentTarget
      const caret = el.selectionStart
      const value = el.value
      const justTyped = typeof caret === 'number' && caret > 0 ? value[caret - 1] : ''
      const shouldFix = justTyped && /[\s.,!?;:]/.test(justTyped)

      const warm = getUkSpellcheckerSync()

      if (shouldFix && warm) {
        const result = autocorrectWordBeforeCaret(warm, value, caret)
        if (result) {
          el.value = result.value
          onChange?.(e)
          const nextCaret = result.caret
          requestAnimationFrame(() => {
            try {
              el.setSelectionRange(nextCaret, nextCaret)
            } catch {
              /* ignore */
            }
          })
          return
        }
      }

      onChange?.(e)

      // Dictionary still loading - correct once it is ready
      if (shouldFix && !warm) {
        const snapshot = value
        const snapshotCaret = caret
        getUkSpellchecker()
          .then((checker) => {
            const result = autocorrectWordBeforeCaret(checker, snapshot, snapshotCaret)
            if (!result) return
            // Only apply if the field still ends with the same unfinished word+space
            if (!el.value.startsWith(snapshot.trimEnd()) && el.value !== snapshot) return
            el.value = result.value + el.value.slice(snapshot.length)
            el.dispatchEvent(new Event('input', { bubbles: true }))
            onChange?.({
              ...e,
              target: el,
              currentTarget: el,
            })
          })
          .catch((err) => console.warn('[ukAutocorrect] failed:', err))
      }
    },
    [enableUk, onChange]
  )

  const handleBlur = useCallback(
    (e) => {
      if (enableUk && e.currentTarget.value) {
        const el = e.currentTarget
        const apply = (checker) => {
          const next = autocorrectUkText(checker, el.value)
          if (next === el.value) return
          el.value = next
          onChange?.({
            ...e,
            target: el,
            currentTarget: el,
            type: 'change',
          })
        }

        const warm = getUkSpellcheckerSync()
        if (warm) {
          apply(warm)
        } else {
          getUkSpellchecker()
            .then(apply)
            .catch((err) => console.warn('[ukAutocorrect] failed:', err))
        }
      }
      onBlur?.(e)
    },
    [enableUk, onBlur, onChange]
  )

  const handleKeyDown = useCallback(
    (e) => {
      onKeyDown?.(e)
    },
    [onKeyDown]
  )

  return {
    enableUk,
    handleChange,
    handleBlur,
    handleKeyDown,
  }
}
