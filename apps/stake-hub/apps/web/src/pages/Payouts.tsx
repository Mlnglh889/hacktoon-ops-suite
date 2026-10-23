import { useEffect, useState } from 'react'
import { v3Api } from '../lib/v3Api'

export default function Payouts() {
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof v3Api.overview>> | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { v3Api.overview().then(setOverview).catch(() => {}).finally(() => setLoading(false)) }, [])
  return <main className="relative z-10 flex-1 w-full max-w-[1280px] mx-auto px-margin-mobile md:px-margin pt-24 lg:pt-10 pb-16 flex flex-col gap-6">
    <header><div className="text-[11px] uppercase tracking-[0.18em] text-primary mb-2">PortaldotV3 Testnet</div><h1 className="text-[34px] md:text-[40px] font-bold text-white">Payouts</h1><p className="text-slate-400 text-[15px] mt-1">Wallet-specific rewards are not fabricated from network stake changes.</p></header>
    <section className="pd-card rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] p-6"><h2 className="text-white font-semibold text-lg">Payout data unavailable</h2><p className="text-slate-300 mt-2">The V3 testnet currently exposes no verified personal payout history. Network stake changes are not payouts and are intentionally not shown as rewards.</p>{loading ? <p className="text-white/40 text-sm mt-4">Checking V3 collector…</p> : <p className="text-white/40 text-sm mt-4">Latest era: {overview?.latest_era == null ? '—' : `#${overview.latest_era}`} · network stake: {overview?.total_stake_pot ?? 0} POT</p>}</section>
    <section className="pd-card rounded-2xl border border-white/[0.07] p-6"><h2 className="text-white font-semibold">What will appear here</h2><ul className="text-slate-400 text-sm mt-3 space-y-2"><li>• Connected SS58 account</li><li>• Verified claimed/unclaimed rewards</li><li>• Extrinsic hash and receipt</li><li>• Era and validator source data</li></ul></section>
  </main>
}

export const payoutMode = 'v3-testnet-verified-only'

