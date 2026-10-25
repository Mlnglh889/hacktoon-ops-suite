import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { commissionToPercent, toNumber, v3Api, type V3Overview } from '../lib/v3Api'
import { useWallet } from '../lib/walletContext'
import { estimateNominationFee, submitNominationChange, type StakingUpdate } from '../lib/staking'
import { ErrorBox, ReviewNote, WalletUnavailable } from '../components/StakingTabs'
import TxToast from '../components/TxToast'
import {
  filterAndSortValidators,
  toggleSelection,
  type ValidatorCategory,
  type ValidatorRow,
  type ValidatorSort,
} from '../lib/validatorOps'

const MAX_VALIDATORS = 2
const STALE_AFTER_MS = 2 * 60 * 1000

function classify(commissionPct: number): [string, number] {
  if (commissionPct >= 50) return ['RISK', 100]
  if (commissionPct >= 25) return ['WATCH', 65]
  return ['SAFE', 20]
}

function shortAddress(address: string) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`
}

function formatPot(value: number | null, digits = 2) {
  if (value === null) return 'Unavailable'
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

// Label is derived from commission only (no chain risk model exists), so it says so.
function riskLabel(tier: string) {
  if (tier === 'SAFE') return 'Commission <25%'
  if (tier === 'WATCH') return 'Commission 25–50%'
  return 'Commission ≥50%'
}

export default function Validators() {
  const { account, chainData, refreshChainData } = useWallet()
  const [validators, setValidators] = useState<ValidatorRow[]>([])
  const [overview, setOverview] = useState<V3Overview | null>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<ValidatorCategory>('all')
  const [sort, setSort] = useState<ValidatorSort>('stake')
  const [view, setView] = useState<'table' | 'grid'>('table')
  const [selected, setSelected] = useState<string[]>([])
  const [details, setDetails] = useState<ValidatorRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [update, setUpdate] = useState<StakingUpdate | null>(null)

  const load = async (manual = false) => {
    manual ? setRefreshing(true) : setLoading(true)
    try {
      const [overviewData, validatorData] = await Promise.all([
        v3Api.overview(),
        v3Api.validators(),
      ])
      setOverview(overviewData)
      setValidators(validatorData.validators.map(v => {
        const commission = commissionToPercent(v.commission_pct)
        const [tier, risk_score] = classify(commission)
        return {
          address: v.address,
          name: v.nickname || shortAddress(v.address),
          commission,
          total_stake_pot: v.total_pot === null ? null : toNumber(v.total_pot),
          own_pot: v.own_pot === null ? null : toNumber(v.own_pot),
          nominators: v.nominator_count,
          points: v.points,
          tier,
          risk_score,
        }
      }))
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => { void load() }, 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const filtered = useMemo(
    () => filterAndSortValidators(validators, { category, search, sort }),
    [validators, category, search, sort],
  )

  const totalStake = validators.reduce((sum, row) => sum + (row.total_stake_pot ?? 0), 0)
  const updatedAt = overview?.latest_block?.captured_at ? new Date(overview.latest_block.captured_at * 1000) : null
  const stale = updatedAt ? Date.now() - updatedAt.getTime() > STALE_AFTER_MS : false
  const lowCount = validators.filter(row => row.tier === 'SAFE').length
  const watchCount = validators.filter(row => row.tier === 'WATCH').length
  const activeCount = validators.filter(row => row.tier !== 'RISK').length

  const toggle = (address: string) => setSelected(current => toggleSelection(current, address, MAX_VALIDATORS))
  const loadCurrent = () => setSelected(chainData.nominations.slice(0, MAX_VALIDATORS))

  // Read-only preflight: current nominations -> proposed set + fee estimate. Never signs or sends.
  const [preflight, setPreflight] = useState<{ proposed: string[]; current: string[]; fee: string | null; checkedAt: number } | null>(null)
  const runPreflight = async () => {
    if (!account || !selected.length) return
    setPreflight(null)
    setUpdate({ status: 'Reading chain for preflight (no signing)…' })
    try {
      const fee = await estimateNominationFee(account.address, selected)
      setPreflight({ proposed: [...selected], current: [...chainData.nominations], fee, checkedAt: Date.now() })
      setUpdate(null)
    } catch (error) {
      setUpdate({ status: 'Preflight failed', error: error instanceof Error ? error.message : String(error) })
    }
  }
  const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x))
  const submit = async () => {
    if (!account || !selected.length || busy) return
    setBusy(true)
    setUpdate({ status: 'Preparing validator nomination change…' })
    try {
      await submitNominationChange(account, selected, setUpdate)
      await refreshChainData()
    } catch (error) {
      setUpdate({ status: 'Validator change failed', error: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(false)
    }
  }

  const copyAddress = async (address: string) => {
    await navigator.clipboard?.writeText(address)
  }

  const tableRows = (mobile = false) => filtered.map(row => {
    const share = totalStake > 0 && row.total_stake_pot !== null ? (row.total_stake_pot / totalStake) * 100 : 0
    const checked = selected.includes(row.address)
    const onChain = chainData.nominations.includes(row.address)
    const nominatedBadge = onChain ? <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono border border-[#10b981]/40 bg-[#10b981]/10 text-[#6ee7b7] whitespace-nowrap">Nominated by you</span> : null
    const tierColor = row.tier === 'SAFE'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
      : row.tier === 'WATCH'
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
        : 'border-red-500/40 bg-red-500/10 text-red-300'
    const validator = <div className="flex items-center gap-2.5 min-w-0">
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10b981] opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-[#10b981]" />
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setDetails(row)} className="font-mono text-xs font-semibold text-white hover:text-[#a78bfa] transition-colors truncate">
            {shortAddress(row.address)}
          </button>{nominatedBadge}
          <button type="button" aria-label={`Copy ${row.address}`} onClick={() => { void copyAddress(row.address) }} className="text-[#8a94b8] hover:text-[#00f2fe] transition-colors shrink-0">
            <span className="material-symbols-outlined text-[13px]" translate="no">content_copy</span>
          </button>
        </div>
        <span className="text-[10px] font-mono text-[#8a94b8]">Active</span>
      </div>
    </div>

    if (mobile) return <div key={row.address} className={`rounded-lg border p-4 ${checked ? 'border-[#7c4dff]/55 bg-[#7c4dff]/[.06]' : 'border-[#24305c] bg-[#070d24]'}`}>
      <div className="flex items-start justify-between gap-3">
        {validator}
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono border whitespace-nowrap ${tierColor}`}>● {riskLabel(row.tier)}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-[11px]">
        <div><span className="block text-[#8a94b8]">Total stake</span><strong className="mt-1 block font-mono text-white">{formatPot(row.total_stake_pot)} tPOT</strong></div>
        <div><span className="block text-[#8a94b8]">Own stake</span><strong className="mt-1 block font-mono text-white">{formatPot(row.own_pot)} tPOT</strong></div>
        <div><span className="block text-[#8a94b8]">Stake share</span><strong className="mt-1 block font-mono text-white">{share.toFixed(1)}%</strong></div>
        <div><span className="block text-[#8a94b8]">Commission</span><strong className={`mt-1 block font-mono ${row.commission === 0 ? 'text-emerald-300' : 'text-amber-300'}`}>{row.commission.toFixed(1)}%</strong></div>
        <div><span className="block text-[#8a94b8]">Nominators</span><strong className="mt-1 block font-mono text-white">{row.nominators ?? 'Unavailable'}</strong></div>
        <div><span className="block text-[#8a94b8]">Reward points</span><strong className="mt-1 block font-mono text-white">{row.points?.toLocaleString() ?? 'Unavailable'}</strong><span className="block text-[10px] text-[#8a94b8]/80">Era {overview?.latest_era ?? '—'} · live, rises each block</span></div>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-[#24305c]/70 pt-3">
        <button type="button" onClick={() => toggle(row.address)} className={`text-[11px] font-mono ${checked ? 'text-[#a78bfa]' : 'text-[#8a94b8]'}`}>{checked ? 'Selected for nomination' : 'Select for nomination'}</button>
        <button type="button" onClick={() => setDetails(row)} className="rounded border border-[#24305c] bg-[#0b1231] px-2.5 py-1 text-[11px] font-mono text-white hover:border-[#a78bfa]/60">Details</button>
      </div>
    </div>

    return <tr key={row.address} className={`h-[48px] transition-colors ${checked ? 'bg-[#7c4dff]/[.07] shadow-[inset_3px_0_#7c4dff]' : 'hover:bg-[#111a44]'}`}>
      <td className="px-4 text-center"><input aria-label={`Select ${row.address} for nomination`} type="checkbox" checked={checked} onChange={() => toggle(row.address)} disabled={!account || (!checked && selected.length >= MAX_VALIDATORS)} className="w-3.5 h-3.5 rounded bg-[#020617] border-[#24305c] text-[#7c4dff] focus:ring-0 cursor-pointer disabled:opacity-30" /></td>
      <td className="px-4 py-2">{validator}</td>
      <td className="px-4 py-2 font-mono text-xs"><span className="text-white font-semibold">{formatPot(row.total_stake_pot)}</span><span className="text-[#8a94b8]"> tPOT</span></td>
      <td className="px-4 py-2"><div className="flex flex-col gap-1 w-28"><span className="text-xs font-mono text-white">{share.toFixed(1)}%</span><div className="w-full bg-[#070d24] h-1.5 rounded-full overflow-hidden border border-[#24305c]/60"><div className="bg-gradient-to-r from-[#00f2fe] to-[#10b981] h-full rounded-full" style={{ width: `${share}%` }} /></div></div></td>
      <td className="px-4 py-2 font-mono text-xs text-[#cbd5e1]">{formatPot(row.own_pot)} tPOT</td>
      <td className="px-4 py-2"><span className="bg-[#162044] text-[#94a3b8] px-2 py-0.5 rounded text-xs font-mono">{row.nominators ?? '—'}</span></td>
      <td className={`px-4 py-2 font-mono text-xs font-semibold ${row.commission === 0 ? 'text-emerald-300' : 'text-amber-300'}`}>{row.commission.toFixed(1)}%</td>
      <td className="px-4 py-2 font-mono text-xs text-white">{row.points?.toLocaleString() ?? 'Unavailable'}</td>
      <td className="px-4 py-2 text-right"><button type="button" onClick={() => setDetails(row)} className="px-2.5 py-1 rounded bg-[#070d24] border border-[#24305c] hover:border-[#a78bfa] text-xs font-mono text-white hover:text-[#a78bfa] transition-all">Details</button></td>
    </tr>
  })

  return <main className="relative z-10 w-full pt-24 lg:pt-10 pb-20">
    <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-8">
      <section className="mt-5 space-y-3 bg-[#070d24] border border-[#24305c] p-3 rounded-[10px]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-8 items-center gap-2 px-2.5 rounded bg-[#0b1231] border border-[#24305c] text-xs font-mono text-[#8a94b8]"><span className={`w-2 h-2 rounded-full ${stale ? 'bg-amber-400' : 'bg-[#10b981] animate-ping'}`} /><span className="text-white font-medium">Updated {updatedAt ? updatedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'}</span></div>
          <span className="flex h-8 items-center px-2.5 rounded bg-[#0b1231] border border-[#24305c] text-xs font-mono text-[#8a94b8]">Portaldot V3 · Era {overview?.latest_era ?? '—'}</span>
          <button type="button" onClick={() => { void load(true) }} className="h-8 w-8 rounded bg-[#0b1231] border border-[#24305c] hover:border-[#8a94b8] text-[#8a94b8] hover:text-white flex items-center justify-center transition-all" title="Refresh snapshot"><span className={`material-symbols-outlined text-[16px] ${refreshing ? 'animate-spin' : ''}`} translate="no">refresh</span></button>
          <div className="flex flex-wrap items-center gap-1.5">
            {([
              ['all', 'All', validators.length],
              ['active', 'Active', activeCount],
              ['low', 'Commission <25%', lowCount],
              ['watch', 'Watch', watchCount],
            ] as const).map(([key, label, count]) => <button key={key} type="button" onClick={() => setCategory(key)} className={`h-8 px-2.5 rounded font-mono text-xs font-medium flex items-center gap-1.5 transition-all ${category === key ? 'bg-[#162044] border border-[#a78bfa]/50 text-white' : 'bg-[#0b1231] border border-[#24305c] text-[#8a94b8] hover:text-white'}`}><span>{label}</span><span className="px-1.5 rounded-full bg-[#7c4dff]/30 text-[#a78bfa] text-[10px]">{count}</span></button>)}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="relative w-44 sm:w-56"><span className="material-symbols-outlined absolute left-2.5 top-2 text-[14px] text-[#8a94b8]" translate="no">search</span><input value={search} onChange={event => setSearch(event.target.value)} className="w-full h-8 pl-8 pr-3 bg-[#0b1231] border border-[#24305c] hover:border-[#8a94b8] rounded text-xs font-mono text-white placeholder:text-[#8a94b8] focus:outline-none focus:border-[#7c4dff] focus:ring-1 focus:ring-[#7c4dff]" placeholder="Search address…" /></div>
            <div className="relative"><select value={sort} onChange={event => setSort(event.target.value as ValidatorSort)} className="h-8 pl-3 pr-8 bg-[#0b1231] border border-[#24305c] hover:border-[#8a94b8] rounded text-xs font-mono text-[#f1f5f9] appearance-none focus:outline-none focus:border-[#7c4dff] cursor-pointer"><option value="stake">Sort: Total Stake ▼</option><option value="commission">Sort: Commission ▲</option><option value="nominators">Sort: Nominators ▼</option><option value="risk">Sort: Risk</option></select><span className="material-symbols-outlined text-[14px] text-[#8a94b8] absolute right-2.5 top-2 pointer-events-none" translate="no">expand_more</span></div>
            <div className="flex h-8 items-center p-0.5 bg-[#020617] border border-[#24305c] rounded-lg"><button type="button" onClick={() => setView('table')} className={`h-full px-2.5 rounded text-xs font-mono flex items-center gap-1.5 ${view === 'table' ? 'bg-[#7c4dff] text-white' : 'text-[#8a94b8] hover:text-white'}`}><span className="material-symbols-outlined text-[15px]" translate="no">table_rows</span><span className="hidden sm:inline">Table View</span></button><button type="button" onClick={() => setView('grid')} className={`h-full px-2.5 rounded text-xs font-mono flex items-center gap-1.5 ${view === 'grid' ? 'bg-[#7c4dff] text-white' : 'text-[#8a94b8] hover:text-white'}`}><span className="material-symbols-outlined text-[15px]" translate="no">grid_view</span><span className="hidden sm:inline">Card Grid</span></button></div>
          </div>
        </div>
                <div className="flex items-center justify-between border-t border-[#24305c]/60 pt-2.5 text-xs font-mono"><span className="text-[#8a94b8]">NPoS Active Validator Set ({activeCount} active)</span><span className="hidden lg:inline text-[11px] text-[#8a94b8]">Selection limit: {MAX_VALIDATORS} validators</span></div>
      </section>

      {stale && <section className="mt-3 bg-amber-950/30 border border-amber-500/40 rounded-[10px] p-3 flex items-center justify-between gap-3 text-xs font-mono"><div className="flex items-center gap-2.5 text-amber-400"><span className="material-symbols-outlined text-[18px]" translate="no">warning</span><span>Data may be outdated · last updated {updatedAt?.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span></div><button type="button" onClick={() => { void load(true) }} className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-300">Force sync</button></section>}

      {!account && <div className="mt-4"><WalletUnavailable>Connect a wallet to select validators and manage nominations. Public validator data remains available.</WalletUnavailable></div>}

      <section className="mt-4 bg-[#0b1231] border border-[#24305c] rounded-[10px] shadow-xl overflow-hidden relative">
        {loading ? <div className="p-4 space-y-3">{[0, 1, 2].map(row => <div key={row} className="h-12 rounded bg-[#070d24] animate-pulse border border-[#1c2456]" />)}</div> : error && validators.length === 0 ? <div className="px-6 py-16 text-center"><span className="material-symbols-outlined text-4xl text-amber-300" translate="no">cloud_off</span><h2 className="mt-3 text-lg font-semibold text-white">Validator data is unavailable</h2><p className="mt-2 text-[#8a94b8]">The dashboard will retry automatically.</p><button type="button" onClick={() => { void load(true) }} className="mt-4 rounded border border-[#24305c] px-3 py-2 text-xs font-mono text-white">Retry</button></div> : filtered.length === 0 ? <div className="px-6 py-16 text-center"><h2 className="text-lg font-semibold text-white">No validator snapshot yet</h2><p className="mt-2 text-[#8a94b8]">Run the collector to populate live Portaldot V3 data.</p></div> : view === 'table' ? <><div className="hidden md:block overflow-x-auto custom-scrollbar"><table className="w-full text-left border-collapse min-w-[1280px]"><thead><tr className="h-[42px] bg-[#070d24] text-[#8a94b8] text-xs font-mono uppercase tracking-wider border-b border-[#24305c]"><th className="px-4 w-10 text-center">Nominate</th><th className="px-4 min-w-[190px]">Validator</th><th className="px-4 min-w-[145px]">Total stake</th><th className="px-4 min-w-[135px]">Stake share</th><th className="px-4 min-w-[145px]">Own stake</th><th className="px-4 min-w-[105px]">Nominators</th><th className="px-4 min-w-[105px]">Commission</th><th className="px-4 min-w-[135px] whitespace-nowrap">Reward points<span className="block text-[9px] normal-case tracking-normal text-[#8a94b8]/80">Era {overview?.latest_era ?? '—'} · live, rises each block</span></th><th className="px-4 text-right min-w-[95px]">Actions</th></tr></thead><tbody className="divide-y divide-[#1c2456]">{tableRows()}</tbody></table></div><div className="md:hidden grid gap-3 p-3">{tableRows(true)}</div></> : <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{tableRows(true)}</div>}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-t border-[#24305c] bg-[#070d24] px-4 py-3 text-[11px] font-mono text-[#8a94b8]"><span>{validators.length} validators · {formatPot(totalStake)} tPOT total · {totalStake > 0 ? validators.map(row => ((row.total_stake_pot ?? 0) / totalStake) * 100).sort((a, b) => b - a).map(value => value.toFixed(0)).join('/') : '0/0'} stake concentration</span><span>Portaldot V3 testnet · Block {overview?.latest_block?.block_number ?? '—'}</span></div>
      </section>

      <section className="mt-5 bg-[#0b1231] border border-[#24305c] rounded-[10px] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-[19px] font-bold text-white">Manage nominations</h2><p className="mt-1 text-[13px] text-[#8a94b8]">Select up to {MAX_VALIDATORS} validators, then replace the wallet's nomination set after approval.</p></div><div className="flex gap-2"><button type="button" onClick={loadCurrent} disabled={!account || chainData.status !== 'ready'} className="rounded-lg border border-[#4c4ca9] px-3 py-2 text-[12px] font-semibold text-[#d8dced] disabled:opacity-40">Load current</button><button type="button" onClick={() => { void runPreflight() }} disabled={!account || !selected.length || busy} className="rounded-lg bg-gradient-to-r from-[#8953ff] to-[#5c35df] px-4 py-2 text-[12px] font-bold text-white disabled:opacity-35">Preflight (no signing)</button></div></div>
        {preflight && <div className="mt-4 rounded-lg border border-[#24305c] bg-[#070d24] p-4 text-xs font-mono text-[#cbd5e1] space-y-1.5"><div><span className="text-[#8a94b8]">Current:</span> {preflight.current.length ? preflight.current.map(a => shortAddress(a)).join(', ') : 'none'}</div><div><span className="text-[#8a94b8]">Proposed (replaces whole set):</span> {preflight.proposed.map(a => shortAddress(a)).join(', ')}</div><div><span className="text-[#8a94b8]">Change:</span> {sameSet(preflight.current, preflight.proposed) ? 'No change — same set as current' : 'Set changes'}</div><div><span className="text-[#8a94b8]">Estimated fee:</span> {preflight.fee ? `${preflight.fee} tPOT` : 'Unavailable'}</div><div className="text-[#8a94b8]">Checked {new Date(preflight.checkedAt).toLocaleTimeString('en-GB')} · bonded amount unchanged · signing is done in your wallet only after you press Submit</div>{!sameSet(preflight.current, preflight.proposed) && sameSet(selected, preflight.proposed) && <button type="button" onClick={() => { void submit() }} disabled={!account || busy} className="mt-2 rounded-lg bg-gradient-to-r from-[#8953ff] to-[#5c35df] px-4 py-2 text-[12px] font-bold text-white disabled:opacity-35">{busy ? 'Waiting for wallet…' : 'Submit (wallet signs)'}</button>}{!sameSet(selected, preflight.proposed) && <div className="text-amber-300">Selection changed after preflight — run Preflight again before submitting.</div>}</div>}
        <div className="mt-4 grid gap-3 md:grid-cols-2"><ReviewNote>Selected: <strong className="text-white">{selected.length} / {MAX_VALIDATORS}</strong>. Current nominations: <strong className="text-white">{chainData.nominations.length}</strong>.</ReviewNote><ReviewNote>Nomination changes are signed by the connected wallet and submitted on-chain. No local-only change is shown as complete.</ReviewNote></div>
        {update && <div className="mt-4"><ErrorBox message={`${update.status}${update.error ? ` · ${update.error}` : ''}`} /></div>}
      </section>
    </div>

    {details && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Validator details" onMouseDown={event => { if (event.target === event.currentTarget) setDetails(null) }}><div className="w-full max-w-lg bg-[#0b1231] border border-[#3b4b88] rounded-xl shadow-2xl p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-mono uppercase tracking-[.14em] text-[#8a94b8]">Validator details</p><h2 className="mt-1 text-lg font-bold text-white font-mono">{shortAddress(details.address)}</h2></div><button type="button" onClick={() => setDetails(null)} className="text-[#8a94b8] hover:text-white" aria-label="Close"><span className="material-symbols-outlined" translate="no">close</span></button></div><div className="mt-5 grid grid-cols-2 gap-3 text-xs">{[['Total stake', `${formatPot(details.total_stake_pot)} tPOT`], ['Own stake', `${formatPot(details.own_pot)} tPOT`], ['Stake share', `${totalStake ? ((details.total_stake_pot ?? 0) / totalStake * 100).toFixed(1) : '0'}%`], ['Nominators', details.nominators ?? 'Unavailable'], ['Commission', `${details.commission.toFixed(1)}%`], ['Reward points', details.points?.toLocaleString() ?? 'Unavailable']].map(([label, value]) => <div key={label} className="rounded-lg border border-[#24305c] bg-[#070d24] p-3"><span className="text-[#8a94b8]">{label}</span><strong className="mt-1 block font-mono text-white">{value}</strong></div>)}</div><div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => { void copyAddress(details.address) }} className="rounded border border-[#24305c] px-3 py-2 text-xs font-mono text-[#8a94b8] hover:text-white">Copy address</button><Link to="/stake" onClick={() => setDetails(null)} className="rounded bg-gradient-to-r from-[#8953ff] to-[#5c35df] px-4 py-2 text-xs font-bold text-white">Continue to Stake</Link></div></div></div>}
    <TxToast update={update} />
  </main>
}
