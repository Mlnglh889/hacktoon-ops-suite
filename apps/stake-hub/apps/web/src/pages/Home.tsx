import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { v3Api, v3ValidatorName, toNumber } from '../lib/v3Api'

interface Stats {
  block_height: number | null
  era: number | null
  validators: number
  active_validator_count: number | null
  validators_status_verified: boolean
  total_staked_pot: number
  staking_ratio_pct: number
}

interface StakingOverview {
  era: number
  total_issuance_pot: number
  total_staked_pot: number
  staking_ratio: number
  ideal_ratio: number
  est_network_inflation_pct: number
  est_base_apy_pct: number
  active_validators: number
  model_note: string
  apy_is_model_estimate: boolean
  apy_method: string
  apy_calculation: string
}

interface Validator {
  address: string
  name: string
  commission: number
  total_stake_pot: number | null
  status?: 'Active' | 'Inactive' | 'Unknown'
  status_source?: string | null
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Request failed: ${response.status}`)
  return response.json() as Promise<T>
}

function formatUpdated(lastUpdate: Date | null) {
  if (!lastUpdate) return 'Waiting…'
  return `Updated ${lastUpdate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}

/* Portaldot network visualization — connected validator nodes with glow.
   Node count tracks the live validator count (geometry only, no fake data). */
function NetworkGlobe({ validatorCount }: { validatorCount: number }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const count = Math.min(Math.max(validatorCount || 11, 8), 16)
    const pts: { x: number; y: number; r: number; delay: number; emerald: boolean }[] = []
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2
      const ring = i % 3
      const rr = 30 + ring * 12
      pts.push({
        x: 50 + Math.cos(a) * rr,
        y: 50 + Math.sin(a) * (rr * 0.82),
        r: ring === 0 ? 4 : 3,
        delay: (i * 0.4) % 3,
        emerald: ring === 0,
      })
    }
    const svgNS = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(svgNS, 'svg')
    svg.setAttribute('viewBox', '0 0 100 100')
    svg.setAttribute('class', 'w-full h-full')
    const lines: string[] = []
    const center = { x: 50, y: 50 }
    pts.forEach((p, i) => {
      const next = pts[(i + 1) % pts.length]
      lines.push(`M${p.x},${p.y} L${next.x},${next.y}`)
      if (i % 2 === 0) lines.push(`M${p.x},${p.y} L${center.x},${center.y}`)
    })
    const path = document.createElementNS(svgNS, 'path')
    path.setAttribute('d', lines.join(' '))
    path.setAttribute('stroke', 'rgba(139,92,246,0.22)')
    path.setAttribute('stroke-width', '0.4')
    path.setAttribute('fill', 'none')
    svg.appendChild(path)
    const c = document.createElementNS(svgNS, 'circle')
    c.setAttribute('cx', '50'); c.setAttribute('cy', '50'); c.setAttribute('r', '5.5')
    c.setAttribute('fill', 'none'); c.setAttribute('stroke', 'rgba(192,193,255,0.7)')
    c.setAttribute('stroke-width', '0.7')
    svg.appendChild(c)
    const cCore = document.createElementNS(svgNS, 'circle')
    cCore.setAttribute('cx', '50'); cCore.setAttribute('cy', '50'); cCore.setAttribute('r', '2')
    cCore.setAttribute('fill', '#c0c1ff')
    svg.appendChild(cCore)
    pts.forEach(p => {
      const halo = document.createElementNS(svgNS, 'circle')
      halo.setAttribute('cx', String(p.x)); halo.setAttribute('cy', String(p.y))
      halo.setAttribute('r', String(p.r + 1.4))
      halo.setAttribute('fill', 'rgba(139,92,246,0.18)')
      svg.appendChild(halo)
      const dot = document.createElementNS(svgNS, 'circle')
      dot.setAttribute('cx', String(p.x)); dot.setAttribute('cy', String(p.y))
      dot.setAttribute('r', String(p.r))
      dot.setAttribute('fill', p.emerald ? '#34d399' : '#a78bfa')
      svg.appendChild(dot)
      const pulse = document.createElementNS(svgNS, 'circle')
      pulse.setAttribute('cx', String(p.x)); pulse.setAttribute('cy', String(p.y))
      pulse.setAttribute('r', String(p.r))
      pulse.setAttribute('fill', 'none')
      pulse.setAttribute('stroke', p.emerald ? 'rgba(52,211,153,0.6)' : 'rgba(167,139,250,0.5)')
      pulse.setAttribute('stroke-width', '0.5')
      const anim = document.createElementNS(svgNS, 'animate')
      anim.setAttribute('attributeName', 'r')
      anim.setAttribute('values', `${p.r};${p.r + 3};${p.r}`)
      anim.setAttribute('dur', '3s')
      anim.setAttribute('begin', `${p.delay}s`)
      anim.setAttribute('repeatCount', 'indefinite')
      pulse.appendChild(anim)
      const animO = document.createElementNS(svgNS, 'animate')
      animO.setAttribute('attributeName', 'opacity')
      animO.setAttribute('values', '0.8;0;0.8')
      animO.setAttribute('dur', '3s')
      animO.setAttribute('begin', `${p.delay}s`)
      animO.setAttribute('repeatCount', 'indefinite')
      pulse.appendChild(animO)
      svg.appendChild(pulse)
    })
    el.innerHTML = ''
    el.appendChild(svg)
  }, [validatorCount])

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
    >
      <div
        className="absolute"
        style={{
          width: '80%', height: '80%',
          background: 'radial-gradient(circle, rgba(139,92,246,0.14) 0%, rgba(139,92,246,0.05) 45%, transparent 70%)',
          borderRadius: '9999px',
        }}
      />
    </div>
  )
}

function StatCard({ label, value, sub, icon, extra, loading, error, onRetry, lastUpdate, hideUpdated }: { label: string; value: string; sub: string; icon: string; extra?: React.ReactNode; loading?: boolean; error?: boolean; onRetry?: () => void; lastUpdate: Date | null; hideUpdated?: boolean }) {
  const updatedText = formatUpdated(lastUpdate)
  return (
    <div className="bg-gradient-to-b from-[#1c1650] to-[#0f0b38] rounded-xl p-6 relative overflow-hidden flex flex-col justify-between shadow-lg min-h-[176px]">
      <div className="flex items-center justify-between mb-3">
        <span className="font-label-mono-xs text-[13px] uppercase tracking-wider text-slate-300 font-medium whitespace-nowrap">{label}</span>
        <span className="material-symbols-outlined text-outline-variant text-[20px]" translate="no">{icon}</span>
      </div>
      {error ? (
        <div className="flex flex-col items-start gap-2 py-2">
          <span className="text-amber-400 text-[14px] flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[18px]" translate="no">cloud_off</span>
            Metric unavailable
          </span>
          {onRetry && (
            <button onClick={onRetry} className="text-[13px] text-primary hover:underline flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px]" translate="no">refresh</span> Retry
            </button>
          )}
        </div>
      ) : loading ? (
        <div className="py-2 space-y-2 w-full">
          <div className="h-8 w-28 rounded bg-white/10 animate-pulse"></div>
          <div className="h-3 w-40 rounded bg-white/[0.06] animate-pulse"></div>
        </div>
      ) : (
        <>
          <div className={`font-metric-xl text-white font-bold tracking-tight h-[44px] flex items-center ${value.length > 12 ? "text-[22px]" : "text-[36px]"}`}>{value}</div>
          {extra}
        </>
      )}
      {!error && !loading && (
        <div className="mt-4 font-label-mono text-[12px] text-slate-300">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-tertiary animate-pulse"></span>
            <span>{sub}</span>
          </div>
          <div className="mt-1 pl-3.5 font-label-mono-xs text-[11px] text-slate-400 h-[16px]">{hideUpdated ? " " : updatedText}</div>
        </div>
      )}
    </div>
  )
}

const HOME_CACHE_KEY = 'stakehub.home.v1'
type HomeCache = { stats: Stats | null; overview: StakingOverview | null; validators: Validator[]; at: string }
function readHomeCache(): HomeCache | null {
  try {
    const raw = window.localStorage.getItem(HOME_CACHE_KEY)
    return raw ? (JSON.parse(raw) as HomeCache) : null
  } catch { return null }
}
function writeHomeCache(c: HomeCache) {
  try { window.localStorage.setItem(HOME_CACHE_KEY, JSON.stringify(c)) } catch { /* storage blocked */ }
}

export default function Home() {
  const nav = useNavigate()
  const cached = readHomeCache()
  const [stats, setStats] = useState<Stats | null>(cached?.stats ?? null)
  const [statsError, setStatsError] = useState(false)
  const [overview, setOverview] = useState<StakingOverview | null>(cached?.overview ?? null)
  const [overviewError, setOverviewError] = useState(false)
  const [validators, setValidators] = useState<Validator[]>(cached?.validators ?? [])
  const [validatorsLoading, setValidatorsLoading] = useState(() => (cached?.validators?.length ?? 0) === 0)
  const [validatorsError, setValidatorsError] = useState(false)
  const [search, setSearch] = useState('')
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [dotPrice, setDotPrice] = useState<number | null>(null)

  const loadData = async () => {
    setStatsError(false)
    setOverviewError(false)
    setValidatorsError(false)
    const [statsResult, overviewResult, validatorsResult] = await Promise.allSettled([
      v3Api.stats(),
      v3Api.stakingOverview(),
      v3Api.validatorList(),
    ])

    const prev = readHomeCache()
    const nextStats = statsResult.status === 'fulfilled' ? ({ ...statsResult.value, total_staked_pot: statsResult.value.total_staked_pot ?? 0, total_issuance_pot: statsResult.value.total_issuance_pot ?? 0, staking_ratio_pct: statsResult.value.staking_ratio_pct ?? 0 } as Stats) : null
    const nextOverview = overviewResult.status === 'fulfilled' ? overviewResult.value : null
    const nextValidators = validatorsResult.status === 'fulfilled' ? (validatorsResult.value.validators || []) : null
    if (nextStats) setStats(nextStats); else setStatsError(true)
    if (nextOverview) setOverview(nextOverview); else setOverviewError(true)
    writeHomeCache({
      stats: nextStats ?? prev?.stats ?? null,
      overview: nextOverview ?? prev?.overview ?? null,
      validators: nextValidators ?? prev?.validators ?? [],
      at: new Date().toISOString(),
    })
    if (validatorsResult.status === 'fulfilled') { setValidators(validatorsResult.value.validators || []); setValidatorsError(false) }
    else setValidatorsError(true)
    setValidatorsLoading(false)
    if (statsResult.status === 'fulfilled' || overviewResult.status === 'fulfilled' || validatorsResult.status === 'fulfilled') {
      setLastUpdate(new Date())
    }

    try {
      const price = await fetchJson<{ polkadot?: { usd?: number } }>('https://api.coingecko.com/api/v3/simple/price?ids=polkadot&vs_currencies=usd')
      setDotPrice(price?.polkadot?.usd ?? null)
    } catch {
      setDotPrice(null)
    }
  }

  useEffect(() => {
    loadData()
    const t = setInterval(loadData, 15000)
    return () => clearInterval(t)
  }, [])

  const filtered = validators.filter(v =>
    v.name?.toLowerCase().includes(search.toLowerCase()) ||
    v.address?.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 3)

  const statusDot = (status: Validator['status']) => status === 'Active' ? 'bg-emerald-400' : status === 'Inactive' ? 'bg-amber-400' : 'bg-slate-500'
  const statusBorder = (status: Validator['status']) => status === 'Active' ? 'border-emerald-500' : status === 'Inactive' ? 'border-amber-500' : 'border-slate-600'
  const statusPill = (status: Validator['status']) => status === 'Active'
    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
    : status === 'Inactive'
      ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
      : 'text-slate-300 bg-slate-500/10 border-slate-500/30'

  const pillars = [
    { icon: 'fact_check', number: '01', title: 'Explore Validators', desc: 'Compare validators by commission, stake, and network status.', link: 'Browse Validators', to: '/validators' },
    { icon: 'fingerprint', number: '02', title: 'Stake & Manage', desc: 'Choose validators and manage your staking position.', link: 'Start Staking', to: '/stake' },
    { icon: 'monitoring', number: '03', title: 'Track Your Activity', desc: 'Monitor your staking position, rewards, and validator performance.', link: 'View Portfolio', to: '/portfolio' },
  ]

  return (
    <main className="relative z-10 w-full pt-24 lg:pt-10">
      {/* HERO — 55-62vh desktop, compact mobile */}
      <section className="relative min-h-[44vh] md:min-h-[52vh] flex flex-col items-center justify-center text-left px-space-md pb-16 md:pb-20 overflow-hidden">
        {/* Network visualization — right side on desktop, dimmed background on mobile */}
        <div className="hidden md:block absolute inset-y-0 right-[4%] w-[42%] max-w-[560px] opacity-80">
          <NetworkGlobe validatorCount={validators.length} />
        </div>
        <div className="md:hidden absolute inset-0 opacity-30">
          <NetworkGlobe validatorCount={validators.length} />
        </div>

        {/* content */}
        <div className="relative z-10 max-w-2xl mr-auto">
          <h1 className="text-[40px] md:text-[64px] text-white tracking-tight leading-[1.03] mb-6 font-bold max-w-2xl">
            Stake Smarter. <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#c0c1ff] to-[#8b5cf6]">Choose Better.</span>
          </h1>
          <p className="text-[18px] md:text-[20px] text-slate-300 max-w-xl leading-relaxed mb-10">
            Explore validators, stake POT, and track your staking activity in one place.
          </p>

          <div className="flex flex-wrap items-center gap-4">
            <button onClick={() => nav('/stake')} className="px-8 py-4 rounded-xl font-semibold text-[18px] text-white bg-gradient-to-r from-[#8083ff] to-[#6d3bd7] shadow-[0_0_30px_-8px_rgba(109,59,215,0.6)] hover:brightness-110 hover:shadow-[0_0_36px_-6px_rgba(109,59,215,0.7)] transition-all flex items-center gap-2 active:scale-[0.98]">
              <span>Start Staking</span>
              <span className="material-symbols-outlined text-[20px]" translate="no">arrow_forward</span>
            </button>
            <button onClick={() => nav('/validators')} className="px-8 py-4 rounded-xl font-semibold text-[18px] text-slate-200 bg-white/5 border border-white/10 hover:bg-white/10 transition flex items-center gap-2 active:scale-[0.98]">
              <span>Explore Validators</span>
              <span className="material-symbols-outlined text-[20px]" translate="no">arrow_forward</span>
            </button>
          </div>
        </div>

      </section>

      {/* NETWORK OVERVIEW — 2x2 stat grid with heading */}
      <section className="mb-20 md:mb-24 max-w-[1440px] mx-auto px-6 md:px-12 lg:px-20">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
          <div>
            <h2 className="text-[26px] md:text-[30px] text-white font-bold tracking-tight">PortaldotV3 Testnet</h2>
            <p className="text-[15px] text-slate-300 mt-1">Live testnet metrics from the Portaldot V3 collector.</p>
          </div>
          <div className="flex items-center gap-2 text-[13px] text-slate-300 pb-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
            </span>
            <span>Updated {lastUpdate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 xl:gap-8">
          <StatCard
            lastUpdate={lastUpdate}
            label="TOTAL VALUE STAKED"
            loading={!overview && !overviewError}
            error={overviewError}
            onRetry={loadData}
            value={overview ? (overview.total_staked_pot / 1e6).toFixed(2) + 'M POT' : '—'}
            sub="Snapshot · no price"

            icon="token"
          />
          <StatCard
            lastUpdate={lastUpdate}
            label="ACTIVE VALIDATORS"
            loading={!stats && !statsError}
            error={statsError}
            onRetry={loadData}
            value={stats ? String(stats.active_validator_count ?? stats.validators) : '—'}
            sub={stats?.validators_status_verified ? `${stats.validators} verified` : 'Activity unavailable'}
            icon="format_image_left"
          />
          <StatCard
            lastUpdate={lastUpdate}
            label="STAKING PARTICIPATION"
            loading={!stats && !statsError}
            error={statsError}
            onRetry={loadData}
            value={stats ? stats.staking_ratio_pct.toFixed(2) + '%' : '—'}
            sub="Share of total issuance"
            icon="pie_chart"
          />
          <StatCard
            lastUpdate={lastUpdate}
            label="ESTIMATED NETWORK APY"
            loading={!overview && !overviewError}
            error={overviewError}
            onRetry={loadData}
            hideUpdated
            value="Not available yet"
            sub="Needs verified data"
            extra={undefined}
            icon="timelapse"
          />
        </div>
      </section>

      {/* STAKING EXPERIENCE */}
      <section className="max-w-[1600px] mx-auto px-gutter mb-8">
        <div className="max-w-2xl">
          <h2 className="text-[38px] md:text-[52px] text-white font-bold tracking-tight leading-[1.05]">How It Works</h2>
          <p className="text-[18px] text-slate-300 mt-4">Three steps to explore the V3 testnet staking flow.</p>
        </div>
      </section>
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-24 md:mb-28 max-w-[1600px] mx-auto px-gutter">
        {pillars.map(p => (
          <div key={p.title} className="bg-gradient-to-b from-[#1c1650] to-[#0f0b38] rounded-2xl p-8 transition-transform hover:-translate-y-1 shadow-xl flex flex-col border border-white/[0.07]">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
              <span className="font-mono text-[12px] tracking-[0.18em] text-violet-200/60">{p.number}</span>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-inner bg-violet-400/10 border border-violet-300/15 text-violet-200`}>
                <span className="material-symbols-outlined text-[26px]" translate="no">{p.icon}</span>
              </div>
              </div>
            </div>
            <h2 className="text-[24px] text-white font-bold mb-3">{p.title}</h2>
            <p className="text-[15px] text-slate-300 leading-relaxed mb-6">{p.desc}</p>
            <button
              onClick={() => nav(p.to)}
              className="mt-auto self-start text-[15px] font-semibold text-primary hover:text-secondary flex items-center gap-1 transition-colors"
            >
              <span>{p.link}</span>
              <span className="material-symbols-outlined text-[18px]" translate="no">arrow_forward</span>
            </button>
          </div>
        ))}
      </section>

      {/* VALIDATOR SPOTLIGHT */}
      <section className="max-w-[1600px] mx-auto px-gutter mb-24" id="validators-table">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 mb-7">
          <div><h2 className="text-[38px] md:text-[48px] text-white font-bold tracking-tight leading-[1.05]">Find your validators</h2><p className="text-[16px] text-slate-300 mt-3">A quick look at the V3 testnet validators. Compare commission, stake, and live session status.</p></div>
          <button onClick={() => nav('/validators')} className="shrink-0 text-[15px] font-semibold text-primary hover:text-secondary">Explore All Validators →</button>
        </div>
        {validatorsError ? <div className="pd-card rounded-2xl border border-white/[0.07] px-6 py-12 text-center text-slate-300"><p className="text-amber-400">Validator data unavailable.</p><button onClick={loadData} className="mt-3 text-primary hover:underline">Retry</button></div> : validatorsLoading ? <div className="pd-card rounded-2xl border border-white/[0.07] px-6 py-12 text-center text-slate-300">Loading validator spotlight…</div> : <div className="grid grid-cols-1 md:grid-cols-3 gap-5">{filtered.map(v => { const status = v.status; return <article key={v.address} className="pd-card rounded-2xl border border-white/[0.07] p-6"><div className="flex items-center justify-between gap-3"><span className="text-[18px] font-semibold text-white truncate">{v.name && v.name !== `${v.address.slice(0, 8)}…${v.address.slice(-6)}` ? v.name : "Validator"}</span>{status ? <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] border ${statusPill(status)}`}><span className={`w-1.5 h-1.5 rounded-full ${statusDot(status)}`} />{status}</span> : <span className="text-[11px] text-slate-300">Status unavailable</span>}</div><p className="mt-3 text-[12px] text-slate-300 font-mono">{v.address.slice(0, 8)}…{v.address.slice(-6)}</p><div className="mt-6 grid grid-cols-2 gap-4"><div><span className="block text-[11px] uppercase tracking-wider text-slate-300">Commission</span><strong className="block mt-1 text-[18px] text-emerald-300">{typeof v.commission === 'number' ? `${v.commission.toFixed(1)}%` : 'Unavailable'}</strong></div><div><span className="block text-[11px] uppercase tracking-wider text-slate-300">Total Stake</span><strong className="block mt-1 text-[18px] text-white">{v.total_stake_pot ? `${(v.total_stake_pot / 1e6).toFixed(1)}M POT` : 'Unavailable'}</strong></div></div></article>})}</div>}
      </section>

      {/* CLOSING CTA */}
      <section className="max-w-[1600px] mx-auto px-gutter mb-12">
        <div className="relative overflow-hidden rounded-3xl border border-violet-300/15 bg-gradient-to-br from-[#21185c] via-[#120f37] to-[#070b20] px-7 py-12 md:px-14 md:py-14">
          <div className="absolute -right-24 -top-28 h-80 w-80 rounded-full bg-violet-500/20 blur-3xl" aria-hidden="true" />
          <div className="relative z-10 max-w-2xl">
            <h2 className="text-[34px] md:text-[48px] leading-[1.05] font-bold tracking-tight text-white">Ready to explore Portaldot staking?</h2>
            <p className="text-[16px] leading-relaxed text-slate-300">Explore V3 testnet validators and learn how the Portaldot staking flow works.</p>
            <div className="mt-8 flex flex-wrap gap-4">
              <button onClick={() => nav('/stake')} className="rounded-xl bg-gradient-to-r from-[#8083ff] to-[#6d3bd7] px-6 py-3.5 text-[15px] font-semibold text-white shadow-[0_0_28px_-8px_rgba(109,59,215,.7)] hover:brightness-110">Get Started →</button>
            </div>
          </div>
        </div>
      </section>
      {/* Retained legacy table markup below is unreachable only if this section is hidden; full list remains on /validators. */}
      <section className="hidden" aria-hidden="true">
        <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-[#8083ff] to-transparent"></div>
        <div className="p-6 bg-black/20 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-white font-bold text-[24px]">Validator Network</h2>
              <span className="font-label-mono text-slate-300 text-[18px] font-normal">({validatorsLoading ? '…' : validators.length})</span>
            </div>
            <p className="text-[14px] text-slate-300 mt-2">Compare validators by commission, stake, and network status.</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-3.5 text-slate-300 text-[18px] pointer-events-none" translate="no">search</span>
              <input value={search} onChange={e => setSearch(e.target.value)} className="pl-10 pr-4 py-2.5 rounded-xl bg-black/40 text-[15px] text-white placeholder-slate-400 w-72 max-w-full focus:outline-none focus:ring-1 focus:ring-primary shadow-inner" placeholder="Search validator or stash…" />
            </div>
            <button
              onClick={() => nav('/validators')}
              title="Opens the full validator list so you can compare commission, stake, and verified network status."
              className="px-4 py-2.5 rounded-xl font-medium text-[15px] text-white bg-gradient-to-r from-[#8083ff] to-[#6d3bd7] hover:brightness-110 shadow-md flex items-center gap-2 transition"
            >
              <span className="text-secondary">✦</span>
              <span>Find Best Validator</span>
            </button>
          </div>
        </div>
        {validatorsError ? (
          <div className="px-6 py-12 text-center text-slate-300">
            <p className="text-amber-400">Validator data unavailable.</p>
            <button onClick={loadData} className="mt-3 text-primary hover:underline inline-flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px]" translate="no">refresh</span> Retry
            </button>
          </div>
        ) : validatorsLoading ? (
          <div className="px-6 py-12 text-center text-slate-300">Loading validator network…</div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[860px] text-left border-collapse table-fixed">
              <colgroup>
                <col className="w-[26%]" /><col className="w-[24%]" /><col className="w-[14%]" /><col className="w-[20%]" /><col className="w-[16%]" />
              </colgroup>
              <thead>
                <tr className="bg-black/30 text-[12px] uppercase tracking-[0.15em] text-white/50 font-semibold">
                  <th className="py-4 px-6">VALIDATOR</th>
                  <th className="py-4 px-6">ADDRESS</th>
                  <th className="py-4 px-6">COMMISSION</th>
                  <th className="py-4 px-6">TOTAL STAKE</th>
                  <th className="py-4 px-6 text-right">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map(v => {
                  const status = v.status ?? 'Unknown'
                  return (
                    <tr key={v.address} className={`border-l-4 ${statusBorder(status)} hover:bg-white/[0.04] transition-colors group`}>
                      <td className="py-6 px-6 text-[21px] font-medium text-on-surface">
                        <div className="flex items-center gap-3.5">
                          <span className={`w-3 h-3 rounded-full ${statusDot(status)}`}></span>
                          <span className="truncate">{v.name}</span>
                        </div>
                      </td>
                      <td className="py-6 px-6 text-[18px] font-metric-md text-on-surface-variant group-hover:text-primary transition-colors">{v.address.slice(0, 8)}…{v.address.slice(-6)}</td>
                      <td className="py-6 px-6 text-[18px] font-metric-md text-tertiary">{v.commission?.toFixed(1)}%</td>
                      <td className="py-6 px-6 text-[18px] font-metric-md text-on-surface font-medium">{v.total_stake_pot ? (v.total_stake_pot / 1e6).toFixed(1) + 'M POT' : '—'}</td>
                      <td className="py-6 px-6 text-right">
                        <span title={status === 'Active' ? 'Present in the live Session.Validators set.' : status === 'Inactive' ? 'Not present in the live Session.Validators set.' : 'Live activity status could not be verified.'} className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[14px] font-table-header border ${statusPill(status)}`}>
                          <span className={`w-2 h-2 rounded-full ${statusDot(status)}`}></span>
                          {status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-6 py-5 bg-black/30 border-t border-white/5 flex flex-wrap items-center justify-between gap-3 text-[17px] font-metric-md text-slate-300">
          <div className="flex items-center gap-4">
            <span>{validatorsLoading ? 'Loading validators…' : `Showing ${filtered.length} of ${validators.length} validators`}</span>
            <button onClick={() => nav('/validators')} className="text-secondary hover:text-primary font-semibold flex items-center gap-1 transition-colors">
              <span>View All {validatorsLoading ? '…' : validators.length}</span>
              <span className="material-symbols-outlined text-[18px]" translate="no">arrow_forward</span>
            </button>
          </div>
          <div className="flex items-center gap-2 text-tertiary">
            <span className="h-2 w-2 rounded-full bg-tertiary animate-pulse"></span>
            <span>Live · Updated 15s ago</span>
          </div>
        </div>
      </section>
    </main>
  )
}
