/** @type {import('nspell').default | null} */
let spell = null
/** @type {Promise<import('nspell').default> | null} */
let loading = null

const SKIP_TYPES = new Set([
  'password',
  'email',
  'number',
  'date',
  'time',
  'datetime-local',
  'month',
  'week',
  'url',
  'tel',
  'color',
  'file',
  'hidden',
  'checkbox',
  'radio',
  'range',
])

const WORD_ONLY_RE = /^[A-Za-z][A-Za-z']*$/
const WORD_RE = /[A-Za-z][A-Za-z']*/g

/** Common typos that Hunspell may accept as rare/valid words. */
const COMMON_TYPOS = {
  mach: 'much',
  teh: 'the',
  adn: 'and',
  recieve: 'receive',
  seperate: 'separate',
  occured: 'occurred',
  definately: 'definitely',
  accomodate: 'accommodate',
  wierd: 'weird',
  untill: 'until',
}

/** Common US → UK spellings (applied before Hunspell suggestions). */
const US_TO_UK = {
  color: 'colour',
  colors: 'colours',
  colored: 'coloured',
  coloring: 'colouring',
  favor: 'favour',
  favors: 'favours',
  favorite: 'favourite',
  favorites: 'favourites',
  honor: 'honour',
  honors: 'honours',
  humor: 'humour',
  labor: 'labour',
  neighbor: 'neighbour',
  neighbors: 'neighbours',
  organize: 'organise',
  organized: 'organised',
  organizes: 'organises',
  organizing: 'organising',
  organization: 'organisation',
  organizations: 'organisations',
  recognize: 'recognise',
  recognized: 'recognised',
  recognizes: 'recognises',
  recognizing: 'recognising',
  realization: 'realisation',
  realize: 'realise',
  realized: 'realised',
  realizes: 'realises',
  center: 'centre',
  centers: 'centres',
  theater: 'theatre',
  theaters: 'theatres',
  meter: 'metre',
  meters: 'metres',
  liter: 'litre',
  liters: 'litres',
  defense: 'defence',
  offense: 'offence',
  traveling: 'travelling',
  traveled: 'travelled',
  canceled: 'cancelled',
  canceling: 'cancelling',
  modeling: 'modelling',
  modeled: 'modelled',
  labeled: 'labelled',
  labeling: 'labelling',
  fulfill: 'fulfil',
  fulfillment: 'fulfilment',
  skeptical: 'sceptical',
  catalog: 'catalogue',
  dialog: 'dialogue',
  analog: 'analogue',
}

/**
 * Lazily initialise the UK English (en-GB) Hunspell checker.
 * Dictionary files are code-split so they don't inflate the main bundle.
 */
export function getUkSpellchecker() {
  if (spell) return Promise.resolve(spell)
  if (!loading) {
    loading = Promise.all([
      import('nspell'),
      import('@/assets/dictionaries/en-gb/index.aff?raw'),
      import('@/assets/dictionaries/en-gb/index.dic?raw'),
    ]).then(([nspellMod, affMod, dicMod]) => {
      const nspell = nspellMod.default
      const aff = affMod.default
      const dic = dicMod.default
      if (typeof aff !== 'string' || typeof dic !== 'string' || !aff || !dic) {
        throw new Error('UK English dictionary failed to load')
      }
      spell = nspell({ aff, dic })
      return spell
    })
  }
  return loading
}

/** Sync access when dictionary is already warm (avoids flicker while typing). */
export function getUkSpellcheckerSync() {
  return spell
}

/**
 * Whether an input should receive UK English autocorrect / spellcheck.
 */
export function shouldUkAutocorrect(type, readOnly, disabled, optIn = true) {
  if (optIn === false) return false
  if (readOnly || disabled) return false
  if (!type || type === 'text' || type === 'search') return true
  return !SKIP_TYPES.has(type)
}

function matchCase(original, suggestion) {
  if (original === original.toUpperCase()) return suggestion.toUpperCase()
  if (original[0] === original[0].toUpperCase()) {
    return suggestion.charAt(0).toUpperCase() + suggestion.slice(1)
  }
  return suggestion
}

function sharedPrefixLength(a, b) {
  const n = Math.min(a.length, b.length)
  let i = 0
  while (i < n && a[i].toLowerCase() === b[i].toLowerCase()) i += 1
  return i
}

/** Pick the safest UK suggestion - avoid “color” → “colon” style mistakes. */
function pickBestSuggestion(word, suggestions) {
  if (!suggestions?.length) return null

  const lower = word.toLowerCase()
  const scored = suggestions.map((s) => {
    const sl = s.toLowerCase()
    const lenDiff = Math.abs(sl.length - lower.length)
    const prefix = sharedPrefixLength(lower, sl)
    // Prefer close length, long shared prefix, and UK-ish -our/-ise/-re endings
    const ukBonus =
      (sl.endsWith('our') ||
        sl.endsWith('ise') ||
        sl.endsWith('yse') ||
        sl.endsWith('re') ||
        sl.endsWith('ogue') ||
        sl.includes('ll')) &&
      !sl.endsWith('or')
        ? 2
        : 0
    const score = prefix * 3 - lenDiff * 2 + ukBonus
    return { s, score, lenDiff, prefix }
  })

  scored.sort((a, b) => b.score - a.score || a.lenDiff - b.lenDiff)
  const best = scored[0]
  // Only auto-apply when the suggestion is close enough
  if (!best || best.lenDiff > 2 || best.prefix < Math.min(3, lower.length - 1)) {
    return null
  }
  return best.s
}

function correctWord(checker, word) {
  if (!word || word.length < 3) return word

  const lower = word.toLowerCase()
  if (COMMON_TYPOS[lower]) {
    return matchCase(word, COMMON_TYPOS[lower])
  }
  if (US_TO_UK[lower]) {
    return matchCase(word, US_TO_UK[lower])
  }

  if (checker.correct(word)) return word

  const best = pickBestSuggestion(word, checker.suggest(word))
  if (!best) return word
  return matchCase(word, best)
}

/**
 * Correct misspelled words using the first UK English suggestion.
 * Preserves surrounding punctuation and whitespace.
 */
export function autocorrectUkText(checker, text) {
  if (!text || typeof text !== 'string') return text
  return text.replace(WORD_RE, (w) => correctWord(checker, w))
}

/**
 * Correct only the word immediately before the caret (used while typing on Space).
 * Returns null when nothing changed.
 */
export function autocorrectWordBeforeCaret(checker, text, caret) {
  if (!text || typeof caret !== 'number' || caret <= 0) return null

  let end = caret
  while (end > 0 && /[\s.,!?;:]/.test(text[end - 1])) end -= 1
  if (end <= 0) return null

  let start = end
  while (start > 0 && /[A-Za-z']/.test(text[start - 1])) start -= 1

  const word = text.slice(start, end)
  if (!WORD_ONLY_RE.test(word)) return null

  const fixed = correctWord(checker, word)
  if (fixed === word) return null

  const next = text.slice(0, start) + fixed + text.slice(end)
  const nextCaret = caret + (fixed.length - word.length)
  return { value: next, caret: nextCaret }
}

function isKnownWord(checker, word) {
  if (!word || word.length < 2) return true
  const lower = word.toLowerCase()
  if (COMMON_TYPOS[lower] || US_TO_UK[lower]) return false
  return checker.correct(word)
}

/**
 * UK English suggestions for a misspelled word (Chrome-like menu).
 * Prefers typo/US→UK maps, then Hunspell suggestions with case preserved.
 */
export function suggestUkCorrections(checker, word, limit = 5) {
  if (!word || !checker) return []

  const lower = word.toLowerCase()
  if (COMMON_TYPOS[lower]) {
    return [matchCase(word, COMMON_TYPOS[lower])]
  }
  if (US_TO_UK[lower]) {
    return [matchCase(word, US_TO_UK[lower])]
  }

  if (checker.correct(word)) return []

  const raw = checker.suggest(word) || []
  const seen = new Set()
  const out = []
  for (const s of raw) {
    if (!s) continue
    const cased = matchCase(word, s)
    const key = cased.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(cased)
    if (out.length >= limit) break
  }
  return out
}

/**
 * Find misspelled word ranges for red underlines.
 * Skips the word currently being typed at the caret (Chrome-like).
 */
export function findMisspellings(checker, text, caret = -1) {
  if (!checker || !text || typeof text !== 'string') return []

  /** @type {{ start: number, end: number, word: string }[]} */
  const misses = []
  WORD_RE.lastIndex = 0
  let match
  while ((match = WORD_RE.exec(text)) !== null) {
    const word = match[0]
    const start = match.index
    const end = start + word.length

    // Don't underline the unfinished word at the caret
    if (
      typeof caret === 'number' &&
      caret >= 0 &&
      caret >= start &&
      caret <= end
    ) {
      continue
    }

    if (!WORD_ONLY_RE.test(word)) continue
    if (isKnownWord(checker, word)) continue

    misses.push({ start, end, word })
  }
  return misses
}

/** Replace a character range and return the new string. */
export function replaceRange(text, start, end, replacement) {
  return text.slice(0, start) + replacement + text.slice(end)
}

/** Word under a character index (for right-click / caret). */
export function getWordAtIndex(text, index) {
  if (!text || typeof index !== 'number' || index < 0 || index > text.length) {
    return null
  }

  let start = index
  let end = index

  // If clicked on trailing punctuation/space, step back into the word
  if (start > 0 && (start === text.length || !/[A-Za-z']/.test(text[start]))) {
    start -= 1
    end = start + 1
  }

  while (start > 0 && /[A-Za-z']/.test(text[start - 1])) start -= 1
  while (end < text.length && /[A-Za-z']/.test(text[end])) end += 1

  const word = text.slice(start, end)
  if (!WORD_ONLY_RE.test(word)) return null
  return { start, end, word }
}
