const KEY = 'eldvakt-id'
const ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/

/** A random id that stays on this device. No account, no name. */
export function deviceId(): string {
  const existing = localStorage.getItem(KEY)
  if (existing && ID_PATTERN.test(existing)) return existing
  const created = crypto.randomUUID().replace(/-/g, '')
  localStorage.setItem(KEY, created)
  return created
}
