import { useCallback, useEffect, useRef, useState } from 'react'
import {
  findMisspellings,
  getUkSpellchecker,
  getUkSpellcheckerSync,
  getWordAtIndex,
  replaceRange,
  shouldUkAutocorrect,
  suggestUkCorrections,
} from '@/lib/ukAutocorrect'

/**
 * Chrome-like UK spellcheck: red underlines + suggestion menu.
 * Never mutates text unless the user picks a suggestion.
 */
export function useUkSpellcheck({
  type = 'text',
  readOnly,
  disabled,
  ukSpellcheck = true,
  value,
  onChange,
  fieldRef,
}) {
  const enableUk = shouldUkAutocorrect(type, readOnly, disabled, ukSpellcheck)
  const [misspellings, setMisspellings] = useState([])
  const [menu, setMenu] = useState(null)
  const scanTimer = useRef(null)
  const caretRef = useRef(-1)

  const scan = useCallback(
    (text, caret = -1) => {
      if (!enableUk) {
        setMisspellings([])
        return
      }
      const warm = getUkSpellcheckerSync()
      if (warm) {
        setMisspellings(findMisspellings(warm, text || '', caret))
        return
      }
      getUkSpellchecker()
        .then((checker) => {
          setMisspellings(findMisspellings(checker, text || '', caret))
        })
        .catch(() => setMisspellings([]))
    },
    [enableUk]
  )

  const scheduleScan = useCallback(
    (text, caret = -1) => {
      caretRef.current = caret
      if (scanTimer.current) clearTimeout(scanTimer.current)
      scanTimer.current = setTimeout(() => scan(text, caret), 120)
    },
    [scan]
  )

  useEffect(() => {
    if (!enableUk) {
      setMisspellings([])
      return undefined
    }
    const text = value ?? fieldRef?.current?.value ?? ''
    scheduleScan(text, caretRef.current)
    return () => {
      if (scanTimer.current) clearTimeout(scanTimer.current)
    }
  }, [enableUk, value, fieldRef, scheduleScan])

  const closeMenu = useCallback(() => setMenu(null), [])

  useEffect(() => {
    if (!menu) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') closeMenu()
    }
    const t = setTimeout(() => {
      window.addEventListener('pointerdown', closeMenu)
    }, 0)
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', closeMenu)
    }
  }, [menu, closeMenu])

  const openMenuForWord = useCallback(
    (e, hit) => {
      if (!hit) return false

      const openFor = (checker) => {
        const suggestions = suggestUkCorrections(checker, hit.word, 6)
        if (!suggestions.length) return false
        e.preventDefault()
        e.stopPropagation()
        setMenu({
          x: e.clientX,
          y: e.clientY,
          start: hit.start,
          end: hit.end,
          word: hit.word,
          suggestions,
        })
        return true
      }

      const warm = getUkSpellcheckerSync()
      if (warm) return openFor(warm)

      getUkSpellchecker()
        .then((checker) => openFor(checker))
        .catch(() => {})
      return true
    },
    []
  )

  const handleContextMenu = useCallback(
    (e) => {
      if (!enableUk) return

      const el = e.currentTarget
      const text = el.value ?? ''
      const index = typeof el.selectionStart === 'number' ? el.selectionStart : -1
      const hit = getWordAtIndex(text, index)
      if (!hit) return

      openMenuForWord(e, hit)
    },
    [enableUk, openMenuForWord]
  )

  const handleSelect = useCallback(
    (e) => {
      const el = e.currentTarget
      caretRef.current = el.selectionStart ?? -1
      scheduleScan(el.value ?? '', caretRef.current)
    },
    [scheduleScan]
  )

  const notifyScanAfterChange = useCallback(
    (el) => {
      caretRef.current = el?.selectionStart ?? -1
      scheduleScan(el?.value ?? '', caretRef.current)
    },
    [scheduleScan]
  )

  const applySuggestion = useCallback(
    (suggestion) => {
      if (!menu || !fieldRef?.current) {
        closeMenu()
        return
      }
      const el = fieldRef.current
      const next = replaceRange(el.value, menu.start, menu.end, suggestion)
      const nextCaret = menu.start + suggestion.length
      el.value = next
      el.focus()
      try {
        el.setSelectionRange(nextCaret, nextCaret)
      } catch {
        /* ignore */
      }
      onChange?.({
        target: el,
        currentTarget: el,
        type: 'change',
      })
      closeMenu()
      scheduleScan(next, nextCaret)
    },
    [menu, fieldRef, onChange, closeMenu, scheduleScan]
  )

  return {
    enableUk,
    misspellings,
    menu,
    closeMenu,
    applySuggestion,
    handleContextMenu,
    handleSelect,
    notifyScanAfterChange,
  }
}
