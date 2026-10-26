// Pure helpers for RPC Analyst history UI. No chain or network access.

export type HistorySample = {
  checked_at: number
  latency_ms: number | null
  ok: boolean
  block_number: number | null
}

export type HistoryState = 'empty' | 'partial' | 'populated'

// Three explicit states so the UI never renders a chart pretending to have data.
// empty: no samples. partial: samples exist but fewer than minSamples, or any sample lacks latency.
// populated: enough samples and all of them measured.
export function historyState(samples: HistorySample[], minSamples = 2): HistoryState {
  if (!samples.length) return 'empty'
  const withLatency = samples.filter(sample => sample.latency_ms !== null).length
  if (withLatency === 0) return 'empty'
  if (withLatency < minSamples) return 'partial'
  if (withLatency < samples.length) return 'partial'
  return 'populated'
}

// Build an SVG polyline path scaled to a 100x30 viewBox. Returns '' when there is nothing to draw.
export function latencyPath(samples: HistorySample[], width = 100, height = 30): string {
  const points = samples.filter(sample => sample.latency_ms !== null)
  if (points.length < 2) return ''
  const values = points.map(sample => sample.latency_ms as number)
  const peak = Math.max(...values, 1)
  return points
    .map((sample, index) => {
      const x = (index / (points.length - 1)) * width
      const y = height - Math.min(height - 2, ((sample.latency_ms as number) / peak) * (height - 2))
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}
