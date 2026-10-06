import { useCallback } from 'react'
import {
  autocorrectUkText,
  autocorrectWordBeforeCaret,
  getUkSpellchecker,
  getUkSpellcheckerSync,
  shouldUkAutocorrect,
} from '@/lib/ukAutocorrect'

/**
 * Optional UK English *auto-replace* handlers.
 *
 * Default production behaviour is Chrome-like spellcheck only (underlines +
 * suggestions) — that lives in useUkSpellcheck and does NOT mutate text.
 *
 * Pass ukAutocorrect={true} only when silent replace on Space/blur is wanted.
 */
export function useUkAutocorrectHandlers({
  type = 'text',
  readOnly,
  disabled,
  ukSpellcheck = true,
  ukAutocorrect = false,
  onChange,
  onBlur,
  onKeyDown,
}) {
  const enableUk = shouldUkAutocorrect(type, readOnly, disabled, ukSpellcheck)
  const enableAutoReplace = enableUk && ukAutocorrect === true

  const handleChange = useCallback(
    (e) => {
      if (!enableAutoReplace) {
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

      if (shouldFix && !warm) {
        const snapshot = value
        const snapshotCaret = caret
        getUkSpellchecker()
          .then((checker) => {
            const result = autocorrectWordBeforeCaret(checker, snapshot, snapshotCaret)
            if (!result) return
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
    [enableAutoReplace, onChange]
  )

  const handleBlur = useCallback(
    (e) => {
      if (enableAutoReplace && e.currentTarget.value) {
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
    [enableAutoReplace, onBlur, onChange]
  )

  const handleKeyDown = useCallback(
    (e) => {
      onKeyDown?.(e)
    },
    [onKeyDown]
  )

  return {
    enableUk,
    enableAutoReplace,
    handleChange,
    handleBlur,
    handleKeyDown,
  }
}
