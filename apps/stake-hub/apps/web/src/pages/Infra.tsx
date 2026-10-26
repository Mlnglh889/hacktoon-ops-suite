import { useEffect, useMemo, useState } from 'react'
import { historyState, latencyPath } from '../lib/rpcHistory'

type RpcRow = {
  endpoint: string
  chain_family: 'substrate' | 'evm'
  state: 'closed' | 'open' | 'half_open'
  ok: boolean
  latency_ms: number | null
  block_number: number | null
  error: string | null
  checked_at: number
  source: string
  latency_status: 'healthy' | 'slow' | 'degraded' | 'failing' | 'unknown'
  slow_threshold_ms: number
  degraded_threshold_ms: number
  history: { sample_count: number; history_limit: number; history_scope: string; error_rate: number | null; failures?: { total: number; by_kind: Record<string, number>; endpoint_failures: number; backend_failures: number }; block_progress?: { first_block: number | null; last_block: number | null; delta: number | null; last_change_at: number | null; seconds_since_change: number | null; stale_for_seconds?: number | null; reference: string }; p50_ms: number | null; p90_ms: number | null; p99_ms: number | null; samples: { checked_at: number; latency_ms: number | null; ok: boolean; block_number: number | null; failure_kind?: string | null }[] }
}
type RpcReport = { endpoints: RpcRow[]; count: number; healthy: number; generated_at: number; history_scope: string; thresholds: { slow_ms: number; degraded_ms: number }; window?: string }
type Filter = 'all' | 'substrate' | 'evm' | 'failing' | 'open'
type HistoryWindow = '1h' | '24h' | '7d'

const REFRESH_MS = 30000

function fmtTime(sec: number) { return new Date(sec * 1000).toLocaleTimeString('en-GB') }
function shortEndpoint(url: string) { return url.replace(/^wss?:\/\//, '') }

export default function Infra() {
  const [data, setData] = useState<RpcReport | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [historyWindow, setHistoryWindow] = useState<HistoryWindow>('24h')
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/v3/infra/rpc?window=${historyWindow}`, { cache: 'no-store' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const report: RpcReport = await r.json()
      setData(report)
      setExpanded(current => current ?? report.endpoints.find(row => row.chain_family === 'evm')?.endpoint ?? null)
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setLoading(false) }
  }

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), REFRESH_MS)
    return () => clearInterval(t)
  }, [historyWindow])

  const rows = useMemo(() => (data?.endpoints ?? []).filter(r => {
    if (filter === 'substrate' || filter === 'evm') return r.chain_family === filter
    if (filter === 'failing') return !r.ok
    if (filter === 'open') return r.state === 'open'
    return true
  }), [data, filter])
  const substrate = data?.endpoints.filter(r => r.chain_family === 'substrate').length ?? 0
  const evm = data?.endpoints.filter(r => r.chain_family === 'evm').length ?? 0
  const open = data?.endpoints.filter(r => r.state === 'open').length ?? 0

  const allHistory = data?.endpoints.flatMap(row => row.history.samples.map(sample => ({ ...sample, endpoint: row.endpoint, family: row.chain_family }))) ?? []
  const historyErrorRate = allHistory.length ? allHistory.filter(sample => !sample.ok).length / allHistory.length : null
  const endpointFailures = data?.endpoints.reduce((sum, row) => sum + (row.history.failures?.endpoint_failures ?? 0), 0) ?? 0
  const backendFailures = data?.endpoints.reduce((sum, row) => sum + (row.history.failures?.backend_failures ?? 0), 0) ?? 0
  const minSamples = Math.min(...(data?.endpoints.map(row => row.history.sample_count) ?? [0]))
  const hasHistory = allHistory.length > 0
  const chainSeries = (data?.endpoints ?? []).map(row => {
    const points = row.history.samples.filter(sample => sample.latency_ms !== null)
    const peak = Math.max(...points.map(sample => sample.latency_ms as number), 1)
    const path = latencyPath(row.history.samples)
    const state = historyState(row.history.samples)
    return { family: row.chain_family, endpoint: row.endpoint, points, peak, path, state, p50: row.history.p50_ms, p90: row.history.p90_ms, p99: row.history.p99_ms, errorRate: row.history.error_rate, block: row.history.block_progress, samples: row.history.sample_count }
  })
  const maxLatency = Math.max(...(data?.endpoints.map(row => row.latency_ms ?? 0) ?? [0]), 1)
  const filters: [Filter, string, number][] = [
    ['all', 'All', data?.count ?? 0], ['substrate', 'Substrate', substrate], ['evm', 'EVM', evm],
    ['failing', 'Failing', data ? data.count - data.healthy : 0], ['open', 'Circuit open', open],
  ]

  return (
    <main className="w-full max-w-none px-3 sm:px-5 lg:px-8 py-5 text-white">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#26364a] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#4edea3] shadow-[0_0_8px_rgba(78,222,163,.6)]" />
            <h1 className="text-2xl font-semibold tracking-tight">RPC Analyst</h1>
            <span className="rounded bg-[#102034] border border-[#3a494b] px-2 py-0.5 text-[10px] font-mono text-[#6ff6ff]">V3 · DUAL STACK</span>
          </div>
          <p className="mt-1 text-xs text-[#b9cacb]">Live endpoint health and measured RPC performance · refresh every 30 seconds</p>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono text-[#b9cacb]">
          {data && <span className="rounded border border-[#3a494b] bg-[#0b1c30] px-2 py-1"><span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[#4edea3]" />Last report {fmtTime(data.generated_at)}</span>}
          <span className="hidden rounded border border-[#3a494b] bg-[#0b1c30] px-2 py-1 md:inline">Auto-refresh 30s</span>
          <button type="button" onClick={() => void load()} disabled={loading} className="rounded border border-[#00dce6]/50 bg-[#00dce6]/10 px-3 py-1.5 text-[#6ff6ff] hover:bg-[#00dce6]/20 disabled:opacity-50">
            {loading ? 'Checking…' : 'Check now'}
          </button>
        </div>
      </header>

      <section className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {[
          ['Responding', data ? `${data.healthy} / ${data.count}` : '—', data && data.endpoints.some(row => row.latency_status !== 'healthy') ? 'text-amber-300' : 'text-[#4edea3]'],
          ['Substrate', String(substrate), 'text-[#bdc2ff]'], ['EVM', String(evm), 'text-sky-300'],
          ['Circuit open', String(open), open ? 'text-rose-300' : 'text-[#4edea3]'],
          ['Polled', data ? fmtTime(data.generated_at) : '—', 'text-[#d3e4fe]'],
        ].map(([label, value, tone]) => <div key={label} className="rounded border border-[#26364a] bg-[#102034] px-3 py-2.5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[#849495]">{label}</div>
          <div className={`mt-1 text-lg font-semibold font-mono ${tone}`}>{value}</div>
        </div>)}
      </section>

      {err && <div className="mt-3 rounded border border-amber-500/40 bg-amber-950/25 px-3 py-2 text-xs font-mono text-amber-200">Last refresh failed: {err}. Showing previous measurements.</div>}

      <section className="mt-5 flex flex-wrap gap-1.5 border-b border-[#26364a] pb-2">
        {filters.map(([id, label, count]) => <button key={id} type="button" onClick={() => setFilter(id)} className={`rounded px-2.5 py-1 text-[11px] font-mono transition-colors ${filter === id ? 'bg-[#26364a] text-[#6ff6ff] border-b-2 border-[#00dce6]' : 'text-[#b9cacb] hover:bg-[#1b2b3f]'}`}>
          {label} ({count})
        </button>)}
      </section>

      {data && <section className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded border border-[#26364a] bg-[#102034] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#26364a] pb-2">
            <div>
              <h2 className="text-sm font-semibold text-[#d3e4fe]">Latency over time</h2>
              <p className="text-[10px] font-mono text-[#849495]">{hasHistory ? `${allHistory.length} persisted probes · ${historyWindow} window · backend samples` : 'No samples in this window yet'}</p>
            </div>
            <div className="flex gap-1">{(['1h', '24h', '7d'] as HistoryWindow[]).map(window => <button key={window} type="button" onClick={() => setHistoryWindow(window)} className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${historyWindow === window ? 'bg-[#26364a] text-[#6ff6ff]' : 'text-[#849495]'}`}>{window}</button>)}</div>
          </div>
          {!hasHistory && <div className="py-10 text-center text-xs font-mono text-[#849495]">Not enough historical samples for this window. Collected samples appear after the next probes.</div>}
          {hasHistory && <div className="mt-3 space-y-3">{chainSeries.map(series => <div key={series.endpoint}>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono">
              <span className={series.family === 'evm' ? 'text-sky-300' : 'text-violet-300'}>{series.family.toUpperCase()} · {series.samples} samples</span>
              <span className="text-[#849495]">P50 {series.p50 ?? '—'} · P90 {series.p90 ?? '—'} · P99 {series.p99 ?? '—'} ms</span>
            </div>
            {series.state === 'empty' && <div className="py-4 text-center text-[10px] font-mono text-[#849495]">No measured samples for {series.family.toUpperCase()} in this window.</div>}
            {series.state === 'partial' && <div className="py-4 text-center text-[10px] font-mono text-amber-300">Not enough measured samples to plot a trend ({series.points.length}).</div>}
            {series.state === 'populated' && <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={`h-10 w-full ${series.family === 'evm' ? 'text-sky-400' : 'text-violet-400'}`} role="img" aria-label={`${series.family} latency over ${historyWindow}`}>
              <polyline fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" points={series.path} />
            </svg>}
            <div className="flex justify-between text-[10px] font-mono text-[#849495]"><span>peak {series.peak} ms</span><span>latest {series.points.length ? `${series.points[series.points.length - 1].latency_ms} ms` : '—'}</span></div>
          </div>)}</div>}
        </div>

        <div className="rounded border border-[#26364a] bg-[#102034] p-3">
          <div className="flex items-center justify-between border-b border-[#26364a] pb-2">
            <h2 className="text-sm font-semibold text-[#d3e4fe]">Errors and block freshness</h2>
            <span className="text-[10px] font-mono text-[#849495]">backend samples</span>
          </div>
          <div className="mt-3 space-y-2 text-xs font-mono text-[#b9cacb]">
            <div className="flex justify-between"><span>Probes in window</span><span className="text-[#d3e4fe]">{allHistory.length}</span></div>
            <div className="flex justify-between"><span>Error rate</span><span className="text-[#d3e4fe]">{historyErrorRate === null ? '—' : `${(historyErrorRate * 100).toFixed(1)}%`}</span></div>
            <div className="flex justify-between"><span>Endpoint failures</span><span className={endpointFailures ? 'text-amber-300' : 'text-[#4edea3]'}>{endpointFailures}</span></div>
            <div className="flex justify-between"><span>Backend failures</span><span className={backendFailures ? 'text-rose-300' : 'text-[#4edea3]'}>{backendFailures}</span></div>
            {chainSeries.map(series => <div key={series.endpoint} className="border-t border-[#26364a] pt-2">
              <div className="flex justify-between"><span>{series.family.toUpperCase()} head</span><span className="text-[#d3e4fe]">#{series.block?.last_block ?? '—'}</span></div>
              <div className="flex justify-between"><span>{series.family.toUpperCase()} progress</span><span className="text-[#d3e4fe]">{series.block?.delta === null || series.block?.delta === undefined ? "—" : `${series.block.delta >= 0 ? "+" : ""}${series.block.delta}`} blocks</span></div>
              <div className="flex justify-between"><span>{series.family.toUpperCase()} last change</span><span className="text-[#d3e4fe]">{series.block?.stale_for_seconds === null || series.block?.stale_for_seconds === undefined ? '—' : `${series.block.stale_for_seconds}s ago`}</span></div>
            </div>)}
            <div className="text-[10px] text-[#849495]">Each chain is compared with its own sampled head. No cross-chain sync claim.</div>
          </div>
        </div>
      </section>}

      {data && <section className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded border border-[#26364a] bg-[#102034] p-3">
          <div className="flex items-center justify-between border-b border-[#26364a] pb-2"><h2 className="text-sm font-semibold text-[#d3e4fe]">Request volume</h2><span className="text-[10px] font-mono text-[#849495]">traffic telemetry</span></div>
          <div className="py-6 text-center text-xs font-mono text-[#849495]">No RPC traffic metrics collected. This panel needs a request-level collector; probe counts are shown above, not traffic volume.</div>
        </div>
        <div className="rounded border border-[#26364a] bg-[#102034] p-3">
          <div className="flex items-center justify-between border-b border-[#26364a] pb-2"><h2 className="text-sm font-semibold text-[#d3e4fe]">Method distribution</h2><span className="text-[10px] font-mono text-[#849495]">traffic telemetry</span></div>
          <div className="py-6 text-center text-xs font-mono text-[#849495]">No per-method usage recorded. Only probe methods are executed: chain_getHeader, eth_chainId, eth_blockNumber.</div>
        </div>
      </section>}

      {!data && !err && <div className="mt-5 rounded border border-[#26364a] bg-[#102034] p-8 text-center text-sm text-[#b9cacb]">Loading live RPC measurements…</div>}
      {data && rows.length === 0 && <div className="mt-5 rounded border border-[#26364a] bg-[#102034] p-8 text-center"><div className="text-sm text-[#d3e4fe]">No endpoints in this view</div><div className="mt-1 text-xs text-[#849495]">Try another filter.</div></div>}

      {rows.length > 0 && <section className="mt-5 w-full overflow-hidden rounded border border-[#26364a] bg-[#102034]">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#000f21] text-[10px] uppercase tracking-wider text-[#849495]"><tr>
              <th className="w-8 px-3 py-2" /> <th className="px-3 py-2">Endpoint</th><th className="px-3 py-2">Family</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Latency</th><th className="px-3 py-2">Block</th><th className="px-3 py-2">Measured</th>
            </tr></thead>
            <tbody>{rows.map(r => <>
              <tr key={r.endpoint} onClick={() => setExpanded(expanded === r.endpoint ? null : r.endpoint)} className="cursor-pointer border-t border-[#26364a] hover:bg-[#1b2b3f]">
                <td className="px-3 py-3 text-[#849495]">{expanded === r.endpoint ? '⌄' : '›'}</td>
                <td className="max-w-[340px] px-3 py-3 text-[#d3e4fe]" title={r.endpoint}><span className="block truncate">{shortEndpoint(r.endpoint)}</span></td>
                <td className="px-3 py-3"><span className={`rounded px-1.5 py-0.5 text-[10px] ${r.chain_family === 'evm' ? 'bg-sky-500/15 text-sky-300' : 'bg-violet-500/15 text-violet-300'}`}>{r.chain_family === 'evm' ? 'EVM' : 'SUBSTRATE'}</span></td>
                <td className={`px-3 py-3 ${r.state === 'open' ? 'text-rose-300' : r.latency_status === 'degraded' ? 'text-rose-300' : r.latency_status === 'slow' ? 'text-amber-300' : r.ok ? 'text-[#4edea3]' : 'text-amber-300'}`}>{r.state === 'open' ? 'Circuit open' : r.state === 'half_open' ? 'Probing' : r.latency_status === 'degraded' ? 'Degraded' : r.latency_status === 'slow' ? 'Slow' : r.ok ? 'Healthy' : 'Failing'}</td>
                <td className="px-3 py-3 text-[#d3e4fe]">{r.latency_ms === null ? '—' : `${r.latency_ms} ms`}</td><td className="px-3 py-3 text-[#d3e4fe]">{r.block_number ?? '—'}</td><td className="px-3 py-3 text-[#b9cacb]">{fmtTime(r.checked_at)}</td>
              </tr>
              {expanded === r.endpoint && <tr key={`${r.endpoint}-details`} className="border-t border-[#00dce6]/30 bg-[#0b1c30]"><td colSpan={7} className="px-4 py-3"><div className="grid gap-3 md:grid-cols-4 text-xs font-mono"><div><div className="text-[10px] uppercase text-[#849495]">Endpoint</div><div className="mt-1 break-all text-[#d3e4fe]">{r.endpoint}</div></div><div><div className="text-[10px] uppercase text-[#849495]">Probe source</div><div className="mt-1 text-[#b9cacb]">{r.source}</div></div><div><div className="text-[10px] uppercase text-[#849495]">Latency status</div><div className="mt-1 text-amber-300">{r.latency_status} · slow ≥ {r.slow_threshold_ms}ms · degraded &gt; {r.degraded_threshold_ms}ms</div></div><div><div className="text-[10px] uppercase text-[#849495]">Last error</div><div className="mt-1 text-rose-300">{r.error ?? 'None'}</div></div></div></td></tr>}
            </>)}</tbody>
          </table>
        </div>
        <div className="md:hidden divide-y divide-[#26364a]">{rows.map(r => <button type="button" key={r.endpoint} onClick={() => setExpanded(expanded === r.endpoint ? null : r.endpoint)} className="block w-full p-3 text-left">
          <div className="flex items-center justify-between gap-2"><span className="truncate font-mono text-xs text-[#d3e4fe]">{shortEndpoint(r.endpoint)}</span><span className={`text-xs ${r.latency_status === 'degraded' || r.latency_status === 'failing' ? 'text-rose-300' : r.latency_status === 'slow' ? 'text-amber-300' : 'text-[#4edea3]'}`}>{r.latency_status === 'degraded' ? 'Degraded' : r.latency_status === 'slow' ? 'Slow' : r.latency_status === 'failing' ? 'Failing' : 'Healthy'}</span></div>
          <div className="mt-2 flex gap-4 text-[11px] font-mono text-[#b9cacb]"><span>{r.chain_family.toUpperCase()}</span><span>{r.latency_ms ?? '—'} ms</span><span>#{r.block_number ?? '—'}</span></div>
          {expanded === r.endpoint && <div className="mt-3 space-y-1 border-t border-[#26364a] pt-2 text-[11px] text-[#849495]"><div className="break-all">{r.source}</div><div className="text-rose-300">{r.error ?? 'No error'}</div></div>}
        </button>)}</div>
        <div className="border-t border-[#26364a] bg-[#000f21] px-3 py-2 text-[10px] font-mono text-[#849495]">{data?.count ?? 0} endpoints monitored · live measurements only</div>
      </section>}
    </main>
  )
}

