import { useEffect, useMemo, useState } from 'react'
import { evidenceMetadata, fmtIncidentTime, incidentAddress, incidentSeverityClass, incidentSource, incidentTitle, incidentWindowLabel, rawEvidence } from '../lib/incidentView'

type Incident = {
  kind?: string
  severity?: 'critical' | 'warning' | 'info'
  address?: string | null
  title?: string
  detail?: string
  evidence?: Record<string, unknown>
}
type IncidentResponse = {
  incidents: Incident[]
  count: number
  generated_at: number
  by_severity: Record<string, number>
  window: string
  sources?: { validator_changes?: { rows: number; latest_snapshot_id: number | null; source: string }; rpc_samples?: { count: number; source: string } }
}
type Window = '1h' | '24h' | '7d'
type Family = 'all' | 'validator' | 'rpc'
type Severity = 'all' | 'critical' | 'warning' | 'info'

// Delivery status comes from the Telegram worker's own state DB (/api/v3/telegram/status).
// Every field below is server-reported; the page must never hardcode "configured".
type TelegramStatus = {
  configured: boolean
  bot_username: string | null
  owner_chat_configured: boolean
  worker_running: boolean
  worker_started_at: number | null
  poll_seconds: number
  subscriptions: { total: number; active: number; awaiting_address: number; awaiting_confirm: number; cancelled: number }
  delivered: { total: number; last_sent_at: number | null }
  source: string
  detail?: string
  bot_error?: string
  db_error?: string
}

function fmtEpoch(seconds: number | null | undefined): string {
  if (!seconds) return 'never'
  return new Date(seconds * 1000).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' UTC'
}

const windows: Window[] = ['1h', '24h', '7d']

function familyOf(item: Incident): Exclude<Family, 'all'> {
  return item.kind?.startsWith('rpc_') || item.kind === 'block_head_stalled' ? 'rpc' : 'validator'
}

function incidentDescription(item: Incident): string {
  if (item.kind === 'block_head_stalled') {
    const family = String(item.evidence?.family || 'Chain')
    const stale = item.evidence?.stale_for_seconds
    return `${family} consensus block stalled${stale !== undefined ? ` ${stale}s (own-chain baseline window)` : ''}`
  }
  if (item.kind === 'rpc_degraded') return item.detail || 'RPC endpoint latency degraded'
  if (item.kind === 'rpc_slow') return item.detail || 'RPC endpoint latency slow'
  if (item.kind === 'rpc_stale') return item.detail || 'RPC probe data stale'
  return item.detail || 'Persisted evidence recorded.'
}

function incidentTarget(item: Incident): string {
  if (item.evidence?.endpoint) return String(item.evidence.endpoint).replace(/^https?:\/\//, '')
  if (item.evidence?.family) return `${String(item.evidence.family)} chain`
  return incidentAddress(item.address).short
}

export default function Alerts() {
  const [data, setData] = useState<IncidentResponse | null>(null)
  const [window, setWindow] = useState<Window>('24h')
  const [family, setFamily] = useState<Family>('all')
  const [severity, setSeverity] = useState<Severity>('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [telegram, setTelegram] = useState<TelegramStatus | null>(null)
  const [telegramError, setTelegramError] = useState<string | null>(null)

  const loadTelegram = async () => {
    try {
      const response = await fetch('/api/v3/telegram/status', { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      setTelegram(await response.json())
      setTelegramError(null)
    } catch (e) {
      setTelegramError(e instanceof Error ? e.message : String(e))
    }
  }

  const load = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/v3/incidents?window=${window}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      setData(await response.json())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setLoading(false) }
  }

  useEffect(() => {
    void load()
    void loadTelegram()
    const timer = setInterval(() => { void load(); void loadTelegram() }, 30000)
    return () => clearInterval(timer)
  }, [window])

  const incidents = useMemo(() => (data?.incidents || []).filter(item => {
    const familyMatch = family === 'all' || familyOf(item) === family
    const severityMatch = severity === 'all' || item.severity === severity
    return familyMatch && severityMatch
  }), [data, family, severity])

  const count = (key: string) => data?.by_severity?.[key] ?? 0
  const total = data?.count ?? 0
  const criticalPct = total ? (count('critical') / total) * 100 : 0
  const warningPct = total ? (count('warning') / total) * 100 : 0
  const infoPct = total ? (count('info') / total) * 100 : 0

  return (
    <main className="alerts-page relative z-10 flex-1 w-full max-w-[1520px] mx-auto px-4 sm:px-6 pt-16 lg:pt-[76px] pb-8 text-white">
      <div className="w-full max-w-none space-y-5 px-0">
        <header className="flex flex-col gap-3 border-b border-white/[0.08] pb-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-[#00dce6] shadow-[0_0_8px_rgba(0,220,230,.5)]" />
            <span className="rounded border border-[#3a494b] bg-[#102034] px-2 py-0.5 text-[10px] font-mono tracking-wide text-[#6ff6ff]">LIVE EVIDENCE</span>
            <span className="hidden text-xs text-[#849495] sm:inline">· Persisted validator &amp; RPC telemetry</span><span className="rounded border border-[#3a494b]/50 bg-[#102034] px-1.5 py-0.5 text-[10px] font-mono text-[#4edea3]">PERSISTED</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-[#849495]">
            <span>Cadence: <b className="font-normal text-[#d3e4fe]">30s auto</b></span>
            <span className="hidden text-white/20 sm:inline">|</span>
            <span>Last sync: <b className="font-normal text-[#6ff6ff]">{fmtIncidentTime(data?.generated_at)}</b></span>
            <button type="button" onClick={() => void load()} disabled={loading} className="rounded border border-[#3a494b] bg-transparent px-2.5 py-1.5 text-[#d3e4fe] hover:border-[#00dce6]/60 hover:text-[#6ff6ff] disabled:opacity-50">{loading ? 'Syncing…' : 'Refresh'}</button>
          </div>
        </header>

        {error && <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-500/40 bg-[#102034] px-3 py-2 text-xs font-mono text-amber-300"><span><span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />Last refresh failed: {error}. Previous incidents remain visible.</span><button type="button" onClick={() => void load()} className="text-amber-200 hover:underline">Retry now</button></div>}

        <section className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {[
            ['Total incidents', total, 'active', 'text-[#a78bfa]'],
            ['Critical', count('critical'), count('critical') ? 'Immediate intervention' : 'None', 'text-rose-300'],
            ['Warning', count('warning'), 'Degraded', 'text-amber-300'],
            ['Info', count('info'), 'Ledger delta', 'text-[#22D3EE]'],
          ].map(([label, value, meta, tone]) => <div key={String(label)} className={`alerts-summary-card ${label === 'Critical' ? 'critical' : label === 'Warning' ? 'warning' : label === 'Info' ? 'info' : 'total'}`}><div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-[#94A3B8]"><span>{label}</span><span className={`h-1.5 w-1.5 rounded-full ${label === 'Critical' ? 'bg-rose-400' : label === 'Warning' ? 'bg-amber-400' : label === 'Info' ? 'bg-[#22D3EE]' : 'bg-[#8B5CF6]'}`} /></div><div className={`mt-2 text-3xl font-bold font-mono ${tone}`}>{value}</div><div className="mt-1 text-[10px] font-mono text-[#94A3B8]">{meta} · {incidentWindowLabel(window)}</div></div>)}
        </section>

        <section className="rounded border border-[#3a494b]/50 bg-[#0b1c30] p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-[#849495]"><span>Severity breakdown: <b className="font-normal text-[#d3e4fe]">{criticalPct.toFixed(1)}% Rose · {warningPct.toFixed(1)}% Amber · {infoPct.toFixed(1)}% Cyan</b></span><div className="flex gap-3"><span><i className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-rose-400" />Critical</span><span><i className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />Warning</span><span><i className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-[#00dce6]" />Info</span></div></div>
          <div className="mt-2 flex h-1 overflow-hidden rounded-full bg-[#26364a]"><div className="bg-rose-400" style={{ width: `${criticalPct}%` }} /><div className="bg-amber-400" style={{ width: `${warningPct}%` }} /><div className="bg-[#00dce6]" style={{ width: `${infoPct}%` }} /></div>
        </section>

        <section className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#3a494b]/50 bg-[#000f21] p-2 text-[11px] font-mono">
          <div className="flex flex-wrap items-center gap-1"><span className="mr-1 text-[#849495]">Family:</span>{(['all', 'validator', 'rpc'] as Family[]).map(item => <button key={item} type="button" onClick={() => setFamily(item)} className={`rounded px-2 py-1 ${family === item ? 'border border-[#3a494b] bg-[#102034] text-[#6ff6ff]' : 'text-[#b9cacb] hover:bg-[#102034]'}`}>{item === 'all' ? 'All' : item === 'validator' ? 'Validator' : 'RPC'}</button>)}</div>
          <div className="flex flex-wrap items-center gap-1"><span className="mr-1 text-[#849495]">Severity:</span>{(['all', 'critical', 'warning', 'info'] as Severity[]).map(item => <button key={item} type="button" onClick={() => setSeverity(item)} className={`rounded px-2 py-1 ${severity === item ? 'border border-[#3a494b] bg-[#102034] text-[#6ff6ff]' : 'text-[#b9cacb] hover:bg-[#102034]'}`}>{item === 'all' ? `All ${total}` : `${item[0].toUpperCase()}${item.slice(1)} ${count(item)}`}</button>)}</div>
          <div className="flex items-center gap-1"><span className="mr-1 text-[#849495]">Window:</span>{windows.map(item => <button key={item} type="button" onClick={() => setWindow(item)} className={`rounded px-2 py-1 ${window === item ? 'border border-[#3a494b] bg-[#102034] text-[#6ff6ff]' : 'text-[#b9cacb] hover:bg-[#102034]'}`}>{item}</button>)}</div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(270px,.75fr)]">
          <section className="overflow-hidden rounded border border-[#3a494b]/50 bg-[#0b1c30]">
            <div className="flex items-center justify-between border-b border-[#3a494b]/50 px-4 py-3"><div><h2 className="text-sm font-semibold text-[#e0fdff]">Incident timeline</h2><span className="text-[10px] font-mono text-[#849495]">{incidents.length} shown · {window}</span></div><span className="text-[10px] font-mono text-[#849495]">{incidents.length} persisted record{incidents.length === 1 ? "" : "s"}</span></div>
            {!data && !error && <div className="p-10 text-center text-sm text-[#849495]">Loading persisted incidents…</div>}
            {data && incidents.length === 0 && <div className="p-10 text-center"><div className="text-sm text-[#d3e4fe]">No incidents in this view</div><div className="mt-1 text-xs text-[#849495]">No matching persisted validator or RPC evidence for {window}.</div></div>}
            <div className="divide-y divide-[#3a494b]/30">{incidents.map((item, index) => { const address = incidentAddress(item.address); const fam = familyOf(item); const key = `${item.kind}-${address.full}-${index}`; const isOpen = expanded === key; const metadata = evidenceMetadata(item.evidence); return <article key={key} className={`border-l-2 ${item.severity === 'critical' ? 'border-rose-400' : item.severity === 'warning' ? 'border-amber-400' : 'border-[#00dce6]'}`}>
  <button type="button" onClick={() => setExpanded(isOpen ? null : key)} className="block w-full p-3.5 text-left hover:bg-[#102034]/50"><div className="flex gap-3"><div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs ${incidentSeverityClass(item.severity)}`}>{item.severity === 'critical' ? '!' : item.severity === 'warning' ? '△' : 'i'}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-medium text-[#e0eaff]">{incidentTitle(item)}</h3><span className="rounded bg-[#26364a] px-1.5 py-0.5 text-[10px] font-mono text-[#b9cacb]">{item.kind || 'incident'}</span><span className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${fam === 'rpc' ? 'bg-sky-500/10 text-sky-300' : 'bg-violet-500/10 text-violet-300'}`}>{fam.toUpperCase()}</span></div><p className="mt-1 text-xs text-[#b9cacb]">{incidentDescription(item)}</p><div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono text-[#849495]"><span className="break-all text-[#b9cacb]">{incidentTarget(item)}</span><span>{item.evidence?.checked_at ? fmtIncidentTime(Number(item.evidence.checked_at)) : 'persisted'}</span></div></div><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#3a494b] bg-[#102034] text-base leading-none text-[#6ff6ff] transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-label={isOpen ? 'Collapse evidence' : 'Expand evidence'}>⌄</span></div>{metadata.length > 0 && <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 pl-9 text-[10px] font-mono text-[#849495]">{metadata.slice(0, 3).map(([key, value]) => <span key={key}><span className="text-[#b9cacb]">{key}</span> {value}</span>)}</div>}</button>
  {isOpen && <div className="border-t border-[#3a494b]/30 bg-[#000f21] px-4 py-3"><div className="grid gap-3 md:grid-cols-3 text-[11px] font-mono"><div><div className="text-[10px] uppercase text-[#849495]">Full address</div><div className="mt-1 break-all text-violet-200">{address.full || '—'}</div></div><div><div className="text-[10px] uppercase text-[#849495]">Source reference</div><div className="mt-1 break-all text-[#b9cacb]">{incidentSource(item)}</div></div><div><div className="text-[10px] uppercase text-[#849495]">Complete evidence</div><pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all text-[#b9cacb]">{rawEvidence(item.evidence)}</pre></div></div></div>}
</article>})}</div>
          </section>

          <aside className="space-y-4">
            <section className="rounded border border-[#3a494b]/50 bg-[#0b1c30] p-4"><div className="flex items-center justify-between border-b border-[#3a494b]/40 pb-2"><h2 className="text-sm font-semibold text-[#e0fdff]">Evidence sources</h2><span className="text-[10px] font-mono text-[#4edea3]">PERSISTED</span></div><div className="mt-3 space-y-3 text-xs font-mono"><div><div className="text-[#849495]">Validator changes</div><div className="mt-1 text-[#d3e4fe]">{data?.sources?.validator_changes?.rows ?? '—'} rows</div><div className="text-[10px] text-[#849495]">{data?.sources?.validator_changes?.source || 'v3_snapshots.db v3_changes'}</div><div className="mt-1 text-[10px] text-[#849495]">Snapshot evidence only · no synthetic events</div></div><div className="border-t border-[#3a494b]/30 pt-3"><div className="text-[#849495]">RPC samples</div><div className="mt-1 text-[#d3e4fe]">{data?.sources?.rpc_samples?.count ?? '—'} samples</div><div className="text-[10px] text-[#849495]">{data?.sources?.rpc_samples?.source || 'rpc_health.db rpc_samples'}</div><div className="mt-1 text-[10px] text-[#849495]">Probe evidence only · traffic not inferred</div></div><div className="border-t border-[#3a494b]/30 pt-3"><div className="text-[#849495]">Selected window</div><div className="mt-1 text-[#6ff6ff]">{window} · 30s refresh</div></div></div></section>
            <section className="rounded border border-[#3a494b]/50 bg-[#0b1c30] p-4">
              <div className="flex items-center justify-between border-b border-[#3a494b]/40 pb-2">
                <h2 className="text-sm font-semibold text-[#e0fdff]">Delivery</h2>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${telegram?.configured ? 'bg-emerald-500/10 text-emerald-300' : 'bg-[#26364a] text-[#849495]'}`}>
                  {telegramError ? 'UNREACHABLE' : telegram ? (telegram.configured ? 'CONFIGURED' : 'NOT CONFIGURED') : 'LOADING'}
                </span>
              </div>

              {telegramError && (
                <p className="mt-2 text-[10px] font-mono text-amber-300">Status endpoint failed: {telegramError}</p>
              )}

              {telegram && (
                <div className="mt-3 space-y-2 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-[#849495]">Telegram alerts</span>
                    <span className={telegram.configured ? 'text-[#4edea3]' : 'text-[#849495]'}>
                      {telegram.configured ? 'CONFIGURED' : 'NOT CONFIGURED'}
                    </span>
                  </div>
                  {telegram.bot_username && (
                    <div className="flex items-center justify-between">
                      <span className="text-[#849495]">Bot</span>
                      <span className="text-[#d3e4fe]">@{telegram.bot_username}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-[#849495]">Worker</span>
                    <span className={telegram.worker_running ? 'text-[#4edea3]' : 'text-amber-300'}>
                      {telegram.worker_running ? `RUNNING · ${telegram.poll_seconds}s` : 'NOT RUNNING'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#849495]">Active subscribers</span>
                    <span className="text-[#d3e4fe]">{telegram.subscriptions.active} / {telegram.subscriptions.total}</span>
                  </div>
                  {telegram.subscriptions.awaiting_address > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-[#849495]">Awaiting wallet</span>
                      <span className="text-amber-300">{telegram.subscriptions.awaiting_address}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-[#849495]">Alerts delivered</span>
                    <span className="text-[#d3e4fe]">{telegram.delivered.total}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#849495]">Last sent</span>
                    <span className="text-[#d3e4fe]">{fmtEpoch(telegram.delivered.last_sent_at)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#849495]">Owner chat</span>
                    <span className={telegram.owner_chat_configured ? 'text-[#4edea3]' : 'text-[#849495]'}>
                      {telegram.owner_chat_configured ? 'SET' : 'UNSET'}
                    </span>
                  </div>
                  {(telegram.bot_error || telegram.db_error || telegram.detail) && (
                    <p className="border-t border-[#3a494b]/30 pt-2 text-[10px] leading-relaxed text-[#849495]">
                      {telegram.bot_error || telegram.db_error || telegram.detail}
                    </p>
                  )}
                  <p className="border-t border-[#3a494b]/30 pt-2 text-[10px] text-[#849495]">
                    Source: {telegram.source}
                  </p>
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>
    </main>
  )
}
