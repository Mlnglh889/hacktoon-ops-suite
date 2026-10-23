import { useEffect, useMemo, useState } from 'react'
import { commissionToPercent, v3Api, v3ValidatorName, toNumber } from '../lib/v3Api'
import { useWallet } from '../lib/walletContext'
import { submitNominationChange, type StakingUpdate } from '../lib/staking'
import { ErrorBox, ReviewNote, WalletUnavailable } from '../components/StakingTabs'

type Row = { address: string; name: string; commission: number; total_stake_pot: number | null; tier: string; risk_score: number; points: number | null; nominators: number | null }

function classify(commissionPct: number): [string, number] {
  if (commissionPct >= 50) return ['RISK', 100]
  if (commissionPct >= 25) return ['WATCH', 65]
  return ['SAFE', 20]
}

export default function Validators() {
  const { account, chainData, refreshChainData } = useWallet()
  const [validators, setValidators] = useState<Row[]>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [error, setError] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [update, setUpdate] = useState<StakingUpdate | null>(null)
  const PER_PAGE = 10

  useEffect(() => {
    let alive = true
    const load = () => v3Api.validators().then(data => {
      if (!alive) return
      setValidators(data.validators.map(v => {
        const commission = commissionToPercent(v.commission_pct)
        const [tier, risk_score] = classify(commission)
        return { address: v.address, name: v3ValidatorName(v), commission, total_stake_pot: v.total_pot === null ? null : toNumber(v.total_pot), tier, risk_score, points: v.points, nominators: v.nominator_count }
      }))
      setError(false)
    }).catch(() => alive && setError(true))
    load(); const timer = setInterval(load, 15000)
    return () => { alive = false; clearInterval(timer) }
  }, [])

  useEffect(() => {
    setPage(1)
    setSelected([])
  }, [search])

  const filtered = useMemo(() => validators.filter(v => `${v.name} ${v.address}`.toLowerCase().includes(search.toLowerCase())), [validators, search])
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE)); const safePage = Math.min(page, totalPages)
  const rows = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE)
  const tierDot = (t: string) => t === 'SAFE' ? 'bg-emerald-400' : t === 'WATCH' ? 'bg-amber-400' : 'bg-red-400'
  const tierBorder = (t: string) => t === 'SAFE' ? 'border-emerald-500' : t === 'WATCH' ? 'border-amber-500' : 'border-red-500'

  const toggle = (address: string) => setSelected(current => current.includes(address)
    ? current.filter(item => item !== address)
    : current.length >= 16 ? current : [...current, address])

  const loadCurrent = () => setSelected(chainData.nominations)
  const submit = async () => {
    if (!account || !selected.length || busy) return
    setBusy(true); setUpdate({ status: 'Preparing validator nomination change…' })
    try {
      await submitNominationChange(account, selected, setUpdate)
      await refreshChainData()
    } catch (error) {
      setUpdate({ status: 'Validator change failed', error: error instanceof Error ? error.message : String(error) })
    } finally { setBusy(false) }
  }

  return <main className="relative z-10 w-full pt-24 lg:pt-10">
    <section className="bg-gradient-to-b from-[#1c1650] to-[#0f0b38] rounded-2xl overflow-hidden shadow-2xl relative mb-24 max-w-[1600px] mx-auto px-gutter">
      <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-[#8083ff] to-transparent" />
      <div className="p-6 bg-black/20 flex flex-wrap items-center justify-between gap-4">
        <div><div className="flex items-center gap-2"><h2 className="text-white font-bold text-[28px]">V3 Testnet Validators</h2><span className="font-label-mono text-slate-400 text-[20px]">({validators.length})</span></div><p className="text-sm text-slate-400 mt-1">Live Session.Validators data · select validators here to manage nominations.</p></div>
        <input value={search} onChange={e => setSearch(e.target.value)} className="pl-4 pr-4 py-2.5 rounded-xl bg-black/40 text-[15px] text-white placeholder-slate-400 w-72 focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Search validator or address…" />
      </div>
      {!account && <div className="p-6"><WalletUnavailable>Connect a wallet to manage nominations. Public validator data remains available below.</WalletUnavailable></div>}
      {error ? <div className="px-6 py-16 text-center text-amber-300">V3 validator data unavailable. Retry shortly.</div> : <div className="w-full overflow-x-auto"><table className="w-full text-left border-collapse min-w-[980px]"><thead><tr className="bg-black/30 text-[12px] uppercase tracking-[0.15em] text-white/50 font-semibold"><th className="py-4 px-6">SELECT</th><th className="py-4 px-6">VALIDATOR</th><th className="py-4 px-6">ADDRESS</th><th className="py-4 px-6">COMMISSION</th><th className="py-4 px-6">STAKE</th><th className="py-4 px-6">POINTS</th><th className="py-4 px-6">NOMINATORS</th><th className="py-4 px-6 text-right">RISK</th></tr></thead><tbody className="divide-y divide-white/5">{rows.map(v => <tr key={v.address} className={`border-l-4 ${tierBorder(v.tier)} hover:bg-white/[0.04]`}><td className="py-5 px-6"><button disabled={!account || selected.length >= 16 && !selected.includes(v.address)} onClick={() => toggle(v.address)} className={`rounded-md border px-2.5 py-1 text-[10px] font-semibold disabled:opacity-35 ${selected.includes(v.address) ? 'border-[#8b55ff] bg-[#7046f5] text-white' : 'border-[#354474] text-[#b7a4ff]'}`}>{selected.includes(v.address) ? 'Selected' : 'Select'}</button></td><td className="py-5 px-6 text-[18px] text-white"><span className={`inline-block w-2.5 h-2.5 rounded-full mr-3 ${tierDot(v.tier)}`} />{v.name}</td><td className="py-5 px-6 font-mono text-sm text-slate-400">{v.address.slice(0, 10)}…{v.address.slice(-8)}</td><td className="py-5 px-6 text-[16px] text-emerald-300">{v.commission.toFixed(1)}%</td><td className="py-5 px-6 text-[16px] text-white">{v.total_stake_pot === null ? 'Unavailable' : `${v.total_stake_pot.toLocaleString()} tPOT`}</td><td className="py-5 px-6 text-slate-300">{v.points ?? 'Unavailable'}</td><td className="py-5 px-6 text-slate-300">{v.nominators ?? 'Unavailable'}</td><td className="py-5 px-6 text-right"><span className={`rounded-full border px-3 py-1 text-[11px] ${v.tier === 'SAFE' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' : v.tier === 'WATCH' ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' : 'text-red-400 bg-red-500/10 border-red-500/30'}`}>{v.tier}</span></td></tr>)}</tbody></table></div>}
      <div className="flex items-center justify-between border-t border-white/[.08] px-6 py-4 text-[12px] text-slate-400"><span>Page {safePage} / {totalPages} · {filtered.length} validators</span><div className="flex gap-2"><button disabled={safePage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="rounded border border-white/10 px-3 py-1 disabled:opacity-30">Prev</button><button disabled={safePage >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} className="rounded border border-white/10 px-3 py-1 disabled:opacity-30">Next</button></div></div>
    </section>
    <section className="mx-auto mb-24 max-w-[1600px] px-gutter"><div className="rounded-2xl border border-white/[.08] bg-[#100d36] p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-[22px] font-bold text-white">Manage nominations</h2><p className="mt-1 text-[13px] text-slate-400">Select up to 16 validators above, then replace the wallet's nomination set after approval.</p></div><div className="flex gap-2"><button onClick={loadCurrent} disabled={!account || chainData.status !== 'ready'} className="rounded-lg border border-[#4c4ca9] px-3 py-2 text-[12px] font-semibold text-[#d8dced] disabled:opacity-40">Load current</button><button onClick={() => { void submit() }} disabled={!account || !selected.length || busy} className="rounded-lg bg-gradient-to-r from-[#8953ff] to-[#5c35df] px-4 py-2 text-[12px] font-bold text-white disabled:opacity-35">{busy ? 'Waiting for wallet…' : 'Review changes'}</button></div></div><div className="mt-4 grid gap-3 md:grid-cols-2"><ReviewNote>Selected: <strong className="text-white">{selected.length} / 16</strong>. Current nominations: <strong className="text-white">{chainData.nominations.length}</strong>.</ReviewNote><ReviewNote>Nomination changes are signed by the connected wallet and submitted on-chain. No local-only changes are shown as complete.</ReviewNote></div>{update && <div className="mt-4"><ErrorBox message={`${update.status}${update.error ? ` · ${update.error}` : ''}`} /></div>}</div></section>
  </main>
}
