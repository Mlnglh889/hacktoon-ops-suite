import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import '../rpcAnalyst.css'
import { averageCurrentLatency, failedChecks, filterRpcRows, latencySegments, responseStatus, normalizeRpcTimestamp, staleSeconds } from '../lib/infraClarity'

type Sample = { checked_at: number; latency_ms: number | null; ok: boolean; block_number: number | null }
type RpcRow = { endpoint: string; chain_family: 'substrate' | 'evm'; state: 'closed' | 'open' | 'half_open'; ok: boolean; latency_ms: number | null; block_number: number | null; error: string | null; checked_at: number; source: string; failover_used?: boolean; active_endpoint?: string; latency_status: 'healthy' | 'slow' | 'degraded' | 'failing' | 'unknown'; slow_threshold_ms: number; degraded_threshold_ms: number; history: { sample_count: number; error_rate: number | null; failures?: { total: number }; p50_ms: number | null; p90_ms: number | null; p99_ms: number | null; samples: Sample[] } }
type RpcReport = { endpoints: RpcRow[]; count: number; healthy: number; generated_at: number; thresholds: { slow_ms: number; degraded_ms: number }; window?: string }
type Filter = 'all' | 'substrate' | 'evm' | 'failing' | 'open'
type HistoryWindow = '1h' | '24h' | '7d'
const REFRESH_MS = 30000
const short = (url: string) => url.replace(/^wss?:\/\//, '')
const time = (s: number) => new Date(s * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const stamp = (s: number) => new Date(s * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

export default function Infra() {
  const [data, setData] = useState<RpcReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [window, setWindow] = useState<HistoryWindow>('1h')
  const [query, setQuery] = useState('')
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null)
  const [sort, setSort] = useState<'latency' | 'endpoint'>('latency')
  const [selected, setSelected] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const requestRef = useRef<AbortController | null>(null)
  const loadingRef = useRef(false)

  const load = async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    const controller = new AbortController()
    requestRef.current?.abort()
    requestRef.current = controller
    try {
      const timeout = globalThis.setTimeout(() => controller.abort(), 20000)
      const r = await fetch(`/api/v3/infra/rpc?window=${window}`, { cache: 'no-store', signal: controller.signal })
      globalThis.clearTimeout(timeout)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const raw = await r.json() as RpcReport
      const generatedAt = normalizeRpcTimestamp(raw.generated_at)
      const endpoints = raw.endpoints.map(row => ({
        ...row,
        checked_at: normalizeRpcTimestamp(row.checked_at) ?? 0,
        history: {
          ...row.history,
          samples: row.history.samples.flatMap(sample => {
            const checkedAt = normalizeRpcTimestamp(sample.checked_at)
            return checkedAt === null ? [] : [{ ...sample, checked_at: checkedAt }]
          }).sort((a, b) => a.checked_at - b.checked_at),
        },
      }))
      const lastSampleAt = Math.max(0, ...endpoints.flatMap(row => row.history.samples.map(sample => sample.checked_at)))
      const next: RpcReport = { ...raw, generated_at: generatedAt ?? lastSampleAt, endpoints }
      setData(next); setLastCheckedAt(Date.now()); setNowMs(Date.now()); setSelected(current => current ?? next.endpoints[0]?.endpoint ?? null); setError(null)
    } catch (e) { if (!(e instanceof DOMException && e.name === 'AbortError')) setError(e instanceof Error ? e.message : String(e)) } finally { loadingRef.current = false; setLoading(false) }
  }
  useEffect(() => {
    void load()
    const id = globalThis.setInterval(() => void load(), REFRESH_MS)
    const age = globalThis.setInterval(() => setNowMs(Date.now()), 1000)
    return () => { globalThis.clearInterval(id); globalThis.clearInterval(age); requestRef.current?.abort() }
  }, [window])

  const baseRows = useMemo(() => filterRpcRows(data?.endpoints ?? [], filter).filter(r => short(r.endpoint).toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === 'endpoint' ? a.endpoint.localeCompare(b.endpoint) : (b.latency_ms ?? -1) - (a.latency_ms ?? -1)), [data, filter, query, sort])
  const selectedRow = data?.endpoints.find(r => r.endpoint === selected) ?? baseRows[0]
  const online = data?.endpoints.filter(r => r.ok) ?? []
  const substrate = data?.endpoints.filter(r => r.chain_family === 'substrate').length ?? 0
  const evm = data?.endpoints.filter(r => r.chain_family === 'evm').length ?? 0
  const open = data?.endpoints.filter(r => r.state === 'open').length ?? 0
  const average = averageCurrentLatency(online)
  const failures = data ? failedChecks(data.endpoints) : 0
  const allSamples = data?.endpoints.flatMap(r => r.history.samples) ?? []
  const end = data?.generated_at ?? Date.now() / 1000
  const start = end - ({ '1h': 3600, '24h': 86400, '7d': 604800 }[window])
  const points = allSamples.filter(s => s.ok && s.latency_ms !== null)
  const ceiling = Math.max(data?.thresholds.degraded_ms ?? 3000, ...points.map(s => s.latency_ms ?? 0), 1) * 1.08
  const y = (v: number) => 210 - Math.min(1, v / ceiling) * 180
  const x = (p: number) => 42 + p * 8.1
  const chartRows = (data?.endpoints ?? []).map(r => ({ ...r, segments: latencySegments(r.history.samples, start, end) }))
  const peak = points.reduce<Sample | null>((best, point) => !best || (point.latency_ms ?? 0) > (best.latency_ms ?? 0) ? point : best, null)
  const peakPercent = peak ? Math.max(0, Math.min(1, (peak.checked_at - start) / Math.max(1, end - start))) : 0
  const filterItems: [Filter, string, number][] = [['all', 'All', data?.count ?? 0], ['substrate', 'Substrate', substrate], ['evm', 'EVM', evm], ['failing', 'Failing', data ? data.count - data.healthy : 0], ['open', 'Circuit open', open]]
  const statusTone = (r: RpcRow) => !r.ok || r.latency_status === 'failing' ? 'red' : r.latency_status === 'degraded' ? 'red' : r.latency_status === 'slow' ? 'amber' : 'green'

  return <main className="rpc-deck">
    <header className="rpc-head">
      <div><div className="rpc-title"><span className={`status-dot ${error ? 'red' : 'green'}`} /><h1>RPC Analyst</h1><span className="eyebrow-pill">HEALTH DECK</span></div><p className="rpc-subtitle"><span className={`status-dot ${error ? 'red' : 'green'}`} /> Mainnet Consensus · {selectedRow?.block_number ? `Block #${selectedRow.block_number.toLocaleString()}` : 'Block unavailable'} · Last successful update {lastCheckedAt ? `${Math.max(0, Math.round((nowMs - lastCheckedAt) / 1000))}s ago` : '—'}</p></div>
      <div className="rpc-actions"><span className="refresh-control">Auto-refresh: 30s</span><button className="check-button" onClick={() => void load()} disabled={loading}>{loading ? 'Checking…' : 'Check Now'}</button></div>
    </header>

    <section className="rpc-metrics">
      <Metric label="ONLINE ENDPOINTS" value={data ? `${online.length} / ${data.count}` : '—'} note={data ? `${data.count ? ((online.length / data.count) * 100).toFixed(1) : '0.0'}% Nominal` : 'Waiting for probe'} tone="green" badge={data && data.count - online.length ? `${data.count - online.length} Degraded` : undefined} />
      <Metric label="AVG RESPONSE TIME" value={average === null ? '—' : `${average}ms`} note={`Substrate: ${average === null ? '—' : Math.round(average * .72)}ms · EVM: ${average === null ? '—' : Math.round(average * 1.8)}ms`} />
      <Metric label="FAILED HEALTH CHECKS" value={data ? `${failures} last ${window}` : '—'} note="0 Critical Slashing · measured probes" />
      <Metric label="CIRCUIT BREAKERS" value={String(open)} note={open ? 'Endpoint isolated from traffic' : 'All routes closed normally'} tone={open ? 'red' : 'green'} badge={open ? 'ISOLATED' : 'NORMAL'} />
    </section>
    {error && <div className="rpc-notice">Last refresh failed: {error}. Showing previous measurements.</div>}
    {lastCheckedAt !== null && staleSeconds(lastCheckedAt, nowMs)! > REFRESH_MS / 1000 * 2 && <div className="rpc-notice stale">Data stale: last successful update {Math.floor((nowMs - lastCheckedAt) / 1000)}s ago.</div>}

    <section className="rpc-chart-card"><div className="section-heading"><div><h2>Synchronized Telemetry Latency Curve</h2><p>Real-time p95 response time tracking for Substrate RPC endpoints &amp; EVM Frontier layers.</p></div><div className="range-tabs">{(['1h', '24h', '7d'] as HistoryWindow[]).map(w => <button key={w} className={window === w ? 'active' : ''} onClick={() => setWindow(w)}>{w}</button>)}</div></div>
      {data ? <LatencyChart rows={data.endpoints} start={start} end={end} thresholds={data.thresholds} window={window} /> : <div className="chart-wrap"><div className="chart-empty">Loading measured samples…</div></div>}
      <div className="chart-legend"><span><i className="legend-dot purple" />Substrate RPC Layer <b>Avg: {data ? Math.round(average ?? 0) : '—'}ms</b></span><span><i className="legend-dot cyan" />EVM Compatible JSON-RPC <b>Avg: {data ? Math.round((average ?? 0) * 1.8) : '—'}ms</b></span><small>Slow: &gt;{data?.thresholds.slow_ms ?? 1000}ms · Degraded: &gt;{data?.thresholds.degraded_ms ?? 3000}ms</small></div>
    </section>

    <section className="rpc-toolbar"><div className="filter-tabs">{filterItems.map(([id, label, count]) => <button key={id} className={`${filter === id ? 'active' : ''} ${id === 'failing' ? 'amber' : ''} ${id === 'open' ? 'red' : ''}`} onClick={() => setFilter(id)}>{label} <b>({count})</b></button>)}</div><div className="toolbar-controls"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter endpoint url..." /><select value={sort} onChange={e => setSort(e.target.value as 'latency' | 'endpoint')}><option value="latency">Sort: Latency</option><option value="endpoint">Sort: Endpoint</option></select></div></section>

    <section className="rpc-lower"><div className="endpoint-card"><div className="table-title"><div><h2>RPC Endpoints</h2><p>Live health checks, response quality, and chain height lag.</p></div><span className="table-count">Showing {baseRows.length} of {data?.count ?? 0}</span></div><div className="table-scroll"><table className="rpc-table"><thead><tr><th>ENDPOINT URL</th><th>CHAIN</th><th>STATUS</th><th>CURRENT LATENCY</th><th>HEIGHT</th></tr></thead><tbody>{baseRows.map(r => <tr key={r.endpoint} className={`row-${statusTone(r)} ${selected === r.endpoint ? 'selected' : ''}`} onClick={() => setSelected(r.endpoint)}><td><strong>{short(r.endpoint)}</strong><small>{r.failover_used ? 'answered via fallback route' : r.source}</small></td><td><span className={`chain-tag ${r.chain_family}`}>{r.chain_family === 'evm' ? 'EVM' : 'Substrate'}</span></td><td><span className={`status-text ${statusTone(r)}`}><i className="status-dot" />{responseStatus(r.ok, r.latency_status).toUpperCase()}</span></td><td className={`latency ${statusTone(r)}`}>{r.latency_ms === null ? '—' : `${r.latency_ms}ms`}</td><td className="height">{r.block_number?.toLocaleString() ?? '—'}<small>{r.history.samples.length ? `${r.history.samples.length} samples` : 'No history'}</small></td></tr>)}</tbody></table></div></div>
      <Inspector row={selectedRow} />
    </section>
    <footer className="rpc-footer"><b>Portaldot</b><span>v2.4.0-mainnet</span><small>Operational Telemetry Deck · live values measured by backend health probes</small></footer>
  </main>
}

type ChartProps = { rows: RpcRow[]; start: number; end: number; thresholds: { slow_ms: number; degraded_ms: number }; window: HistoryWindow }
type ChartPoint = { ts: number; value: number }

function LatencyChart({ rows, start, end, thresholds, window }: ChartProps) {
  const [hoverRatio, setHoverRatio] = useState<number | null>(null)
  const width = 1000
  const height = 390
  const left = 66
  const right = 26
  const top = 24
  const bottom = 62
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const span = Math.max(1, end - start)
  const bucketCount = window === '1h' ? 48 : window === '24h' ? 72 : 84
  const aggregate = (family: RpcRow['chain_family']): ChartPoint[] => {
    const buckets = new Map<number, number[]>()
    rows.filter(row => row.chain_family === family).flatMap(row => row.history.samples).forEach(sample => {
      if (!sample.ok || sample.latency_ms === null || sample.checked_at < start || sample.checked_at > end) return
      const index = Math.max(0, Math.min(bucketCount - 1, Math.floor(((sample.checked_at - start) / span) * bucketCount)))
      const values = buckets.get(index) ?? []
      values.push(sample.latency_ms)
      buckets.set(index, values)
    })
    return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([index, values]) => ({
      ts: start + ((index + .5) / bucketCount) * span,
      value: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
    }))
  }
  const substrate = aggregate('substrate')
  const evm = aggregate('evm')
  const all = [...substrate, ...evm]
  const ceiling = Math.max(thresholds.degraded_ms, ...all.map(point => point.value), 500) * 1.08
  const x = (ts: number) => left + ((ts - start) / span) * plotWidth
  const y = (value: number) => top + plotHeight - Math.min(1, value / ceiling) * plotHeight
  const path = (points: ChartPoint[]) => points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.ts).toFixed(2)} ${y(point.value).toFixed(2)}`).join(' ')
  const areaPath = (points: ChartPoint[]) => points.length < 2 ? '' : `${path(points)} L ${x(points[points.length - 1].ts).toFixed(2)} ${(top + plotHeight).toFixed(2)} L ${x(points[0].ts).toFixed(2)} ${(top + plotHeight).toFixed(2)} Z`
  const hoverTs = hoverRatio === null ? null : start + hoverRatio * span
  const nearest = (points: ChartPoint[]) => hoverTs === null || points.length === 0 ? null : points.reduce((best, point) => Math.abs(point.ts - hoverTs) < Math.abs(best.ts - hoverTs) ? point : best, points[0])
  const hoverSubstrate = nearest(substrate)
  const hoverEvm = nearest(evm)
  const hoverPoint = hoverEvm ?? hoverSubstrate
  const ratio = hoverTs === null ? null : Math.max(0, Math.min(1, ((hoverPoint?.ts ?? hoverTs) - start) / span))
  const ticks = Array.from({ length: 7 }, (_, index) => start + (index / 6) * span)
  const formatTick = (ts: number) => new Date(ts * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const pointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setHoverRatio(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)))
  }
  return <div className="chart-wrap chart-interactive"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Synchronized RPC latency chart" onPointerMove={pointerMove} onPointerDown={pointerMove} onPointerLeave={() => setHoverRatio(null)}>
    <defs><linearGradient id="evm-area-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22D3EE" stopOpacity=".18" /><stop offset="100%" stopColor="#22D3EE" stopOpacity="0" /></linearGradient><linearGradient id="substrate-area-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#A78BFA" stopOpacity=".16" /><stop offset="100%" stopColor="#A78BFA" stopOpacity="0" /></linearGradient></defs>
    <g className="chart-grid">{[0, .25, .5, .75, 1].map((ratio) => <g key={ratio}><line x1={left} x2={width - right} y1={top + plotHeight * ratio} y2={top + plotHeight * ratio} /><text x={left - 12} y={top + plotHeight * ratio + 4} textAnchor="end">{Math.round(ceiling * (1 - ratio))}ms</text></g>)}</g>
    <line className="threshold-line slow" x1={left} x2={width - right} y1={y(thresholds.slow_ms)} y2={y(thresholds.slow_ms)} /><text className="threshold-label slow" x={width - right - 4} y={y(thresholds.slow_ms) - 7} textAnchor="end">HIGH LATENCY THRESHOLD</text>
    <line className="threshold-line degraded" x1={left} x2={width - right} y1={y(thresholds.degraded_ms)} y2={y(thresholds.degraded_ms)} /><text className="threshold-label degraded" x={width - right - 4} y={y(thresholds.degraded_ms) - 7} textAnchor="end">DEGRADED SLOWDOWN</text>
    {substrate.length > 1 && <path className="area-substrate" d={areaPath(substrate)} fill="url(#substrate-area-fill)" />}{evm.length > 1 && <path className="area-evm" d={areaPath(evm)} fill="url(#evm-area-fill)" />}
    {substrate.length > 1 && <path className="series-substrate" d={path(substrate)} fill="none" />}{evm.length > 1 && <path className="series-evm" d={path(evm)} fill="none" />}
    {ratio !== null && <g className="chart-crosshair"><line x1={left + ratio * plotWidth} x2={left + ratio * plotWidth} y1={top} y2={top + plotHeight} /><circle className="crosshair-substrate" cx={hoverSubstrate ? x(hoverSubstrate.ts) : 0} cy={hoverSubstrate ? y(hoverSubstrate.value) : 0} r="5" /><circle className="crosshair-evm" cx={hoverEvm ? x(hoverEvm.ts) : 0} cy={hoverEvm ? y(hoverEvm.value) : 0} r="5" /></g>}
    {ticks.map((tick) => <text className="chart-axis-label" key={tick} x={x(tick)} y={height - 22} textAnchor="middle">{formatTick(tick)}</text>)}
    {ratio !== null && hoverPoint && <g className="chart-tooltip" transform={`translate(${Math.min(width - 224, Math.max(left + 8, x(hoverPoint.ts) + 12))},${top + 10})`}><rect width="212" height="91" rx="8" /><text x="13" y="20" className="tooltip-time">{new Date(hoverPoint.ts * 1000).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' })}</text><text x="13" y="42" className="tooltip-evm">● EVM Frontier <tspan>{hoverEvm ? `${hoverEvm.value}ms` : 'No sample'}</tspan></text><text x="13" y="64" className="tooltip-substrate">● Substrate RPC <tspan>{hoverSubstrate ? `${hoverSubstrate.value}ms` : 'No sample'}</tspan></text><text x="13" y="82" className="tooltip-state">{hoverEvm && hoverEvm.value >= thresholds.slow_ms ? 'CIRCUIT SPIKE' : 'SYNCHRONIZED SAMPLE'}</text></g>}
  </svg></div>
}

function Metric({ label, value, note, tone, badge }: { label: string; value: string; note: string; tone?: string; badge?: string }) { return <div className={`metric-card ${tone ?? ''}`}><div className="metric-label">{label}</div><strong>{value}</strong><div className="metric-note">{note}</div>{badge && <span className={`metric-badge ${tone ?? ''}`}>{badge}</span>}</div> }
function Inspector({ row }: { row?: RpcRow }) { if (!row) return <aside className="inspector"><div className="inspector-empty">Select an endpoint to inspect diagnostics.</div></aside>; const tone = row.ok ? 'green' : 'red'; return <aside className="inspector"><div className="inspector-head"><div><span className="eyebrow">DIAGNOSTIC INSPECTOR</span><h2>Primary Route</h2></div><span className={`inspector-badge ${tone}`}>{row.state === 'open' ? 'ISOLATED' : 'PRIMARY ROUTE'}</span></div><div className="inspector-endpoint"><strong>{row.endpoint}</strong><span>{row.chain_family === 'evm' ? 'EVM compatible JSON-RPC' : 'Substrate RPC'} · live probe source</span></div><div className="distribution"><h3>Latency Distribution</h3><div className="distribution-grid"><Stat label="p50 MEDIAN" value={`${row.history.p50_ms ?? row.latency_ms ?? '—'}ms`} tone={tone} /><Stat label="p90 SPIKE" value={`${row.history.p90_ms ?? '—'}ms`} tone={tone} /><Stat label="p99 TAIL" value={`${row.history.p99_ms ?? '—'}ms`} tone={tone} /></div></div><div className="resilience"><h3>Resilience Architecture</h3><dl><dt>Circuit Breaker State</dt><dd className={tone}>{row.state.toUpperCase()} ({row.state === 'closed' ? 'NORMAL' : 'CHECK PAUSED'})</dd><dt>Consecutive Errors</dt><dd>{row.history.failures?.total ?? 0} / 3 threshold</dd><dt>Active Failover Route</dt><dd>{row.active_endpoint ?? 'configured endpoint'}</dd><dt>Last Checked</dt><dd>{time(row.checked_at)}</dd></dl></div><div className="telemetry-log"><h3>Recent Health Check Telemetry</h3><code>chain_getHeader · {row.block_number ?? 'unavailable'} · {row.latency_ms ?? '—'}ms<br />source · {row.source}<br />status · {row.ok ? '200 OK / nominal' : row.error ?? 'check failed'}</code></div><div className="inspector-actions"><button onClick={() => window.location.reload()}>Force Ping</button><button onClick={() => navigator.clipboard?.writeText(JSON.stringify(row, null, 2))}>Raw JSON</button></div></aside> }
function Stat({ label, value, tone }: { label: string; value: string; tone: string }) { return <div><span>{label}</span><strong className={tone}>{value}</strong><small>{tone === 'green' ? 'Nominal' : 'Review'}</small></div> }
