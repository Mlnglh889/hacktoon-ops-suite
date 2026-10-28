export type Sample = { checked_at: number; latency_ms: number | null; ok: boolean }

// RPC health timestamps are Unix seconds. Reject implausible values and accept
// millisecond payloads defensively without inventing a timestamp.
export function normalizeRpcTimestamp(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  const seconds = numeric > 1e11 ? numeric / 1000 : numeric
  return seconds >= 946684800 && seconds <= 4102444800 ? seconds : null
}

export function staleSeconds(lastSuccessMs: number | null, nowMs = Date.now()): number | null {
  return lastSuccessMs === null ? null : Math.max(0, Math.floor((nowMs - lastSuccessMs) / 1000))
}


// Mean of the current probe latency for endpoints that answered. No online latency means no average.
export function averageCurrentLatency(rows: { ok: boolean; latency_ms: number | null }[]): number | null {
  const values = rows.filter(row => row.ok && row.latency_ms !== null && Number.isFinite(row.latency_ms)).map(row => row.latency_ms as number)
  if (!values.length) return null
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
}

// Sum of persisted failed checks in the selected window. Zero is real; undefined history is also zero.
export function failedChecks(rows: { history?: { failures?: { total?: number } } }[]): number {
  return rows.reduce((sum, row) => sum + (row.history?.failures?.total ?? 0), 0)
}

export function responseStatus(ok: boolean, status: string) {
  if (!ok) return 'Offline'
  return status === 'slow' ? 'Slow' : status === 'degraded' ? 'Degraded' : 'Healthy'
}

// Returns [x percent of window, latency ms] pairs so x follows real timestamps, never sample order.
// Failed samples and collection gaps longer than three typical intervals break the line.
export function latencySegments(samples: Sample[], start: number, end: number): number[][][] {
  const ordered = [...samples].sort((a, b) => a.checked_at - b.checked_at)
  const gaps = ordered.slice(1).map((sample, i) => sample.checked_at - ordered[i].checked_at).filter(gap => gap > 0).sort((a, b) => a - b)
  const typical = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0
  const maxGap = Math.max(90, typical * 3)
  const segments: number[][][] = []
  let current: number[][] = []
  let previous: number | null = null
  const span = Math.max(1, end - start)
  for (const sample of ordered) {
    if (sample.checked_at < start || sample.checked_at > end) continue
    if (!sample.ok || sample.latency_ms === null || !Number.isFinite(sample.latency_ms)) {
      if (current.length) segments.push(current)
      current = []; previous = null; continue
    }
    if (previous !== null && sample.checked_at - previous > maxGap) {
      if (current.length) segments.push(current)
      current = []
    }
    current.push([(sample.checked_at - start) / span * 100, sample.latency_ms])
    previous = sample.checked_at
  }
  if (current.length) segments.push(current)
  return segments
}


export type RpcFilter = 'all' | 'substrate' | 'evm' | 'failing' | 'open'
export function filterRpcRows<T extends { chain_family: string; ok: boolean; state: string }>(rows: T[], filter: RpcFilter): T[] {
  return rows.filter(row => filter === 'all' ? true : filter === 'substrate' || filter === 'evm' ? row.chain_family === filter : filter === 'failing' ? !row.ok : row.state === 'open')
}


// Reduce dense persisted history for rendering while preserving actual min/max outliers per bucket.
export function downsampleSamples<T extends { checked_at: number; latency_ms: number | null; ok: boolean }>(samples: T[], maxPoints = 240): T[] {
  if (samples.length <= maxPoints) return samples
  const bucketSize = Math.ceil(samples.length / Math.ceil(maxPoints / 2))
  const out: T[] = []
  for (let i = 0; i < samples.length; i += bucketSize) {
    const bucket = samples.slice(i, i + bucketSize)
    const valid = bucket.filter(x => x.ok && x.latency_ms !== null && Number.isFinite(x.latency_ms))
    if (!valid.length) { out.push(bucket[0]); continue }
    const min = valid.reduce((a, b) => (a.latency_ms as number) <= (b.latency_ms as number) ? a : b)
    const max = valid.reduce((a, b) => (a.latency_ms as number) >= (b.latency_ms as number) ? a : b)
    for (const point of [min, max]) if (!out.some(x => x.checked_at === point.checked_at)) out.push(point)
  }
  return out.sort((a, b) => a.checked_at - b.checked_at)
}
