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

export function writeKey(key, value) {
  try {
    localStorage.setItem(`${NAMESPACE}.${key}`, JSON.stringify(value))
  } catch {
    // QuotaExceeded / private mode — session continues with in-memory state
  }
}
