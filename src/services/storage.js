// Single localStorage gateway — no other module touches localStorage directly.
const NAMESPACE = 'wisconsinRacer.v1'

export function readKey(key, fallback) {
  try {
    const raw = localStorage.getItem(`${NAMESPACE}.${key}`)
    return raw === null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

/** Returns true when the value persisted; false when storage rejected it. */
export function writeKey(key, value) {
  try {
    localStorage.setItem(`${NAMESPACE}.${key}`, JSON.stringify(value))
    return true
  } catch {
    return false // quota exceeded, private mode, or storage disabled
  }
}

/** Read a stored array; corrupt or non-array values fall back. */
export function readArray(key, fallback = []) {
  const value = readKey(key, fallback)
  return Array.isArray(value) ? value : fallback
}

/** Read a plain object map; corrupt or non-object values fall back. */
export function readObject(key, fallback = {}) {
  const value = readKey(key, fallback)
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return fallback
  return value
}
