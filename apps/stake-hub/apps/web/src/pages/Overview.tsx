import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { v3Api } from '../lib/v3Api'
import HeartbeatButton from '../components/HeartbeatButton'


export default function Overview() {
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof v3Api.overview>> | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    v3Api.overview().then((o) => { setOverview(o); setError(false) }).catch(() => setError(true))
  }, [])

  const stake = overview?.total_stake_pot ?? 0
  const count = overview?.validator_count ?? 0
  return <main className="relative z-10 flex-1 w-full max-w-[1280px] mx-auto px-margin-mobile md:px-margin pt-24 lg:pt-10 pb-16 flex flex-col gap-6">
    <header className="flex flex-col md:flex-row md:items-end justify-between gap-4"><div><div className="text-[11px] uppercase tracking-[0.18em] text-primary mb-2">PortaldotV3 Testnet · Chain ID 420420777</div><h1 className="text-[34px] md:text-[40px] font-bold text-on-surface">Overview</h1><p className="text-slate-400 text-[15px] mt-1">Live network telemetry from the V3 collector.</p></div><Link to="/validators" className="px-5 py-3 rounded-xl font-semibold text-[15px] text-white bg-gradient-to-r from-[#8083ff] to-[#6d3bd7] w-fit">View Validators</Link></header>
    {error && <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200">V3 testnet data unavailable. Retry shortly.</div>}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4"><Metric label="Latest Era" value={overview?.latest_era == null ? '—' : `#${overview.latest_era}`} /><Metric label="Active Validators" value={String(count)} /><Metric label="Total Stake" value={`${stake.toLocaleString()} POT`} /></div>
    <div className="pd-card rounded-2xl border border-white/[0.07] p-6"><div className="flex items-center gap-3"><span className="relative flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" /></span><div><strong className="text-white">PortaldotV3 Testnet live</strong><p className="text-slate-400 text-sm">Block {overview?.latest_block?.block_number ?? '—'} · stake/APY shown only when verified.</p></div></div></div>
    <div className="pd-card rounded-2xl border border-white/[0.07] p-6"><h2 className="text-white font-semibold text-lg">Staking data status</h2><p className="text-slate-400 mt-2">The current testnet snapshot has {count} active validators and {stake.toLocaleString()} POT stake. APY and personal positions remain unavailable until verified staking data and wallet transactions exist.</p></div>
    <HeartbeatButton />
  </main>
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="pd-card rounded-2xl border border-white/[0.07] p-5"><span className="text-[12px] uppercase tracking-wider text-slate-400">{label}</span><div className="text-white font-bold text-[30px] mt-2">{value}</div></div> }

// This page intentionally avoids fabricated APY, USD price, payout history, and personal balances.
const V3_OVERVIEW_PAGE = true
if (!V3_OVERVIEW_PAGE) throw new Error('unreachable')

export type OverviewPageMode = 'v3-testnet'
export const overviewPageMode: OverviewPageMode = 'v3-testnet'

