function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function getActiveMention(text, caret) {
  const value = String(text || '')
  const pos = Math.max(0, Math.min(caret ?? value.length, value.length))
  const before = value.slice(0, pos)
  const match = before.match(/(^|[\s.,;:!?()[\]{}"'])@([^\n]*)$/)
  if (!match) return null

  const query = match[2]
  if (query.includes('  ')) return null

  const start = pos - query.length - 1
  return { start, query }
}

export function filterMentionUsers(users = [], query = '') {
  const q = String(query || '').trim().toLowerCase()
  const list = users.filter((user) => user && user.isActive !== false && user.email)
  if (!q) return list.slice(0, 8)
  return list
    .filter((user) => {
      const name = String(user.name || '').toLowerCase()
      const email = String(user.email || '').toLowerCase()
      return name.includes(q) || email.includes(q)
    })
    .slice(0, 8)
}

export function extractMentions(text, users = [], preferred = []) {
  const content = String(text || '')
  if (!content.includes('@')) return []

  const preferredIds = new Set(
    (preferred || []).map((item) => String(item.userId || item._id || '')).filter(Boolean)
  )

  const sorted = [...users]
    .filter((user) => user && (user.name || user.email))
    .sort((a, b) => {
      const aLen = Math.max(String(a.name || '').length, String(a.email || '').length)
      const bLen = Math.max(String(b.name || '').length, String(b.email || '').length)
      return bLen - aLen
    })

  const found = []
  const seen = new Set()
  for (const user of sorted) {
    const id = String(user._id)
    if (seen.has(id)) continue
    const tokens = [user.name, user.email].filter(Boolean)
    const matched = tokens.some((token) => {
      const re = new RegExp(`(^|[^\\w])@${escapeRegex(token)}(?=$|[^\\w@])`, 'i')
      return re.test(content)
    })
    if (!matched) continue
    seen.add(id)
    found.push(user)
  }

  const nameCounts = new Map()
  for (const user of found) {
    const key = String(user.name || '').toLowerCase()
    nameCounts.set(key, (nameCounts.get(key) || 0) + 1)
  }

  return found
    .filter((user) => {
      const key = String(user.name || '').toLowerCase()
      if ((nameCounts.get(key) || 0) <= 1) return true
      if (!preferredIds.size) return true
      return preferredIds.has(String(user._id))
    })
    .map((user) => ({
      userId: user._id,
      name: user.name || '',
      email: user.email || '',
    }))
}

export function insertMention(text, caret, start, user) {
  const value = String(text || '')
  const pos = Math.max(0, Math.min(caret ?? value.length, value.length))
  const mention = `@${user.name} `
  const next = `${value.slice(0, start)}${mention}${value.slice(pos)}`
  return { value: next, caret: start + mention.length }
}
