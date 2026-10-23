import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '../lib/walletContext'
import { submitNominationChange, type StakingUpdate } from '../lib/staking'
import { EmptyBox, ErrorBox, PanelTitle, ReviewNote, SectionLoading, SolidPanel, StakingPageHeader, StatusPill, TableCell, TableHead, WalletUnavailable, useLiveValidators } from '../components/StakingTabs'

export default function ManageValidators() {
  const nav = useNavigate()
  const { account } = useWallet()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [review, setReview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [update, setUpdate] = useState<StakingUpdate | null>(null)
  const walletConnected = Boolean(account)
  const submit = async () => {
    if (!account || !selected.length || busy) return
    setBusy(true); setUpdate({ status: 'Preparing validator change…' })
    try { await submitNominationChange(account, selected, setUpdate) } catch (error) { setUpdate({ status: 'Validator change failed', error: error instanceof Error ? error.message : String(error) }) } finally { setBusy(false) }
  }
  const { data: validators, loading, error } = useLiveValidators()
  const filtered = useMemo(() => validators.filter(v => v.name.toLowerCase().includes(search.toLowerCase()) || v.address.toLowerCase().includes(search.toLowerCase())), [validators, search])
  const perPage = 6
  const pages = Math.max(1, Math.ceil(filtered.length / perPage))
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [search])
  const safePage = Math.min(page, pages)
  const rows = filtered.slice((safePage - 1) * perPage, safePage * perPage)
  return <main className="stake-page relative z-10 w-full pt-20 lg:pt-4"><div className="stake-shell">
    <StakingPageHeader title="Manage Validators" description="Inspect nominations and prepare a validator set change." />
    {!walletConnected && <WalletUnavailable>Connect a wallet to load your current nominations. The available validator list below is public network data.</WalletUnavailable>}
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <SolidPanel><PanelTitle title="Current Nominations" description="Manage your nominated validators." />{!walletConnected ? <EmptyBox message="No wallet-scoped nominations are shown. This prevents example validators being presented as your real nominations." /> : <SectionLoading text="Loading current nominations…" />}<div className="mt-5 overflow-x-auto"><table className="w-full min-w-[560px] border-collapse"><thead><tr><TableHead>Validator</TableHead><TableHead>Commission</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></tr></thead><tbody /></table></div><p className="mt-4 text-[11px] text-[#8995bb]">Nomination changes may replace the complete set depending on the runtime. No remove action is enabled without verified wallet state.</p></SolidPanel>
      <SolidPanel><PanelTitle title="Add or Change Validators" description="Select validators to replace or add to your nominations." /><div className="flex gap-2"><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search validator or address…" className="min-w-0 flex-1 rounded-lg border border-[#26345c] bg-[#060d27] px-3 py-2.5 text-[12px] text-white outline-none focus:border-[#8b55ff]" /><button onClick={() => nav('/validators')} className="rounded-lg border border-[#6252cf] px-3 text-[11px] font-semibold text-[#d8d9f2]">Browse</button></div>{error && <div className="mt-4"><ErrorBox message={error} /></div>}{loading ? <SectionLoading /> : <><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[580px] border-collapse"><thead><tr><TableHead>Validator</TableHead><TableHead>Commission</TableHead><TableHead>Status</TableHead><TableHead>Action</TableHead></tr></thead><tbody>{rows.map(v => <tr key={v.address}><TableCell><div className="font-semibold text-white">{v.name}</div><div className="mt-1 text-[10px] text-[#7682aa]">{v.address.slice(0, 6)}…{v.address.slice(-4)}</div></TableCell><TableCell className="text-emerald-300">{v.commission.toFixed(1)}%</TableCell><TableCell><StatusPill status={v.status || 'Unknown'} /></TableCell><TableCell><button disabled={v.status === 'Inactive' || (!selected.includes(v.address) && selected.length >= 16)} onClick={() => setSelected(current => current.includes(v.address) ? current.filter(a => a !== v.address) : current.length >= 16 ? current : [...current, v.address])} className={`rounded-md border px-2.5 py-1 text-[10px] font-semibold disabled:opacity-35 ${selected.includes(v.address) ? 'border-[#8b55ff] bg-[#7046f5] text-white' : 'border-[#354474] text-[#b7a4ff]'}`}>{selected.includes(v.address) ? 'Selected' : 'Select'}</button></TableCell></tr>)}</tbody></table></div><div className="mt-3 flex items-center justify-between text-[11px] text-[#8995bb]"><span>Showing {filtered.length ? (safePage - 1) * perPage + 1 : 0}–{Math.min(safePage * perPage, filtered.length)} of {filtered.length} validators · {selected.length} selected</span><div className="flex gap-1"><button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1} className="rounded border border-[#354474] px-2 py-1 disabled:opacity-35">‹</button>{Array.from({ length: pages }, (_, i) => <button key={i} onClick={() => setPage(i + 1)} className={`rounded border border-[#354474] px-2 py-1 ${safePage === i + 1 ? 'bg-[#7046f5] text-white' : ''}`}>{i + 1}</button>)}<button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={safePage === pages} className="rounded border border-[#354474] px-2 py-1 disabled:opacity-35">›</button></div></div></>}
      <div className="mt-5 space-y-3"><ReviewNote>Selected validators: <strong className="text-white">{selected.length}</strong>. The nomination transaction will replace the active validator set after wallet approval.</ReviewNote><button onClick={() => { setReview(true); void submit() }} disabled={selected.length === 0 || !walletConnected || busy} className="w-full rounded-lg bg-gradient-to-r from-[#8953ff] to-[#5c35df] py-3 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-35">{busy ? 'Waiting for wallet…' : 'Review Changes'}</button>{update && <ErrorBox message={`${update.status}${update.error ? ` · ${update.error}` : ''}`} />}</div></SolidPanel>
    </div>
  </div></main>
}
void TableCell
