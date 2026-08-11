const MAX_SAMPLES_PER_METRIC = 240
const metrics = new Map()
let measurementId = 0

function now() {
  return globalThis.performance?.now?.() ?? Date.now()
}

function percentile(samples, fraction) {
  if (samples.length === 0) return 0
  const sorted = [...samples].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))]
}

/**
 * Records a bounded local performance sample. Keeping only a small rolling
 * window makes profiling safe to leave enabled during normal play.
 */
export function recordPerformance(name, durationMs) {
  if (typeof name !== 'string' || name.length === 0) return
  if (!Number.isFinite(durationMs) || durationMs < 0) return

  const metric = metrics.get(name) ?? { count: 0, totalMs: 0, samples: [] }
  metric.count += 1
  metric.totalMs += durationMs
  metric.samples.push(durationMs)
  if (metric.samples.length > MAX_SAMPLES_PER_METRIC) metric.samples.shift()
  metrics.set(name, metric)
}

export function profileSync(name, operation) {
  const markerId = `${name}:${measurementId++}`
  globalThis.performance?.mark?.(`${markerId}:start`)
  const startedAt = now()
  try {
    return operation()
  } finally {
    const durationMs = now() - startedAt
    globalThis.performance?.mark?.(`${markerId}:end`)
    globalThis.performance?.measure?.(name, `${markerId}:start`, `${markerId}:end`)
    globalThis.performance?.clearMarks?.(`${markerId}:start`)
    globalThis.performance?.clearMarks?.(`${markerId}:end`)
    globalThis.performance?.clearMeasures?.(name)
    recordPerformance(name, durationMs)
  }
}

export async function profileAsync(name, operation) {
  const markerId = `${name}:${measurementId++}`
  globalThis.performance?.mark?.(`${markerId}:start`)
  const startedAt = now()
  try {
    return await operation()
  } finally {
    const durationMs = now() - startedAt
    globalThis.performance?.mark?.(`${markerId}:end`)
    globalThis.performance?.measure?.(name, `${markerId}:start`, `${markerId}:end`)
    globalThis.performance?.clearMarks?.(`${markerId}:start`)
    globalThis.performance?.clearMarks?.(`${markerId}:end`)
    globalThis.performance?.clearMeasures?.(name)
    recordPerformance(name, durationMs)
  }
}

export function getPerformanceStats() {
  return [...metrics.entries()]
    .map(([name, metric]) => ({
      name,
      count: metric.count,
      averageMs: metric.totalMs / metric.count,
      minMs: Math.min(...metric.samples),
      p95Ms: percentile(metric.samples, 0.95),
      maxMs: Math.max(...metric.samples),
    }))
    .sort((left, right) => left.name.localeCompare(right.name))
}

export function resetPerformanceStats() {
  metrics.clear()
}
