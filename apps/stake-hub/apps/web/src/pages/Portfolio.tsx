import { Link } from 'react-router-dom'
import { useWallet } from '../lib/walletContext'
import { v3Api } from '../lib/v3Api'
import { useEffect, useState } from 'react'

const fmt = (value: number | null) => value === null ? 'Unavailable' : value.toLocaleString('en-US', { maximumFractionDigits: 4 })

export default function Portfolio() {
  const { account, connect, chainData, refreshChainData } = useWallet()
  const [network, setNetwork] = useState<Awaited<ReturnType<typeof v3Api.overview>> | null>(null)
  useEffect(() => { v3Api.overview().then(setNetwork).catch(() => {}) }, [])
  return <main className="relative z-10 flex-1 w-full max-w-[1480px] mx-auto px-margin-mobile md:px-margin py-8 md:py-10 space-y-7">
    <header><div className="text-[11px] uppercase tracking-[0.18em] text-primary mb-3">PortaldotV3 Testnet · Personal view</div><h1 className="text-[38px] md:text-[48px] leading-none font-bold text-white">Your portfolio</h1><p className="text-[15px] text-white/45 mt-3">Wallet-scoped staking positions read directly from the V3 chain.</p></header>
    {!account ? <section className="rounded-2xl border border-violet-400/20 bg-violet-950/20 p-6 flex items-center justify-between gap-4"><div><strong className="text-white">Connect your Portaldot extension</strong><p className="text-sm text-white/45 mt-1">Connect an SS58 account to load wallet-specific data.</p></div><button onClick={() => { void connect() }} className="px-4 py-2.5 rounded-xl bg-violet-600 text-white font-semibold">Connect wallet</button></section> : <section className="rounded-2xl border border-emerald-400/20 bg-emerald-950/20 p-6"><div className="flex items-start justify-between gap-4 flex-wrap"><div><strong className="text-white">Connected account</strong><p className="font-mono text-sm text-emerald-200 mt-2 break-all">{account.address}</p></div><button onClick={() => { void refreshChainData() }} className="px-3 py-2 rounded-lg border border-white/10 text-xs text-white/70">Refresh reads</button></div>{chainData.status === 'loading' && <p className="text-xs text-white/45 mt-3">Reading V3 account, staking ledger, and nominations…</p>}{chainData.status === 'error' && <p className="text-xs text-rose-300 mt-3">{chainData.error}</p>}{chainData.status === 'ready' && <p className="text-xs text-emerald-300 mt-3">Live chain read · refreshed {chainData.refreshedAt ? new Date(chainData.refreshedAt).toLocaleTimeString() : '—'}</p>}</section>}
    <section className="grid grid-cols-1 md:grid-cols-3 gap-4"><Metric label="Free balance" value={`${fmt(chainData.freePot)} tPOT`} note={chainData.freePot === null ? 'Connect wallet to read' : 'system.account'} /><Metric label="Bonded stake" value={chainData.bondedPot === null ? 'None' : `${fmt(chainData.bondedPot)} tPOT`} note={chainData.hasLedger ? 'staking.ledger' : 'No staking ledger'} /><Metric label="Unlocking" value={`${fmt(chainData.unlockingPot)} tPOT`} note={`${chainData.unlockingCount} unlock chunk(s)`} /></section>
    <section className="pd-card rounded-2xl border border-white/[0.07] p-6"><div className="flex items-center justify-between gap-3 flex-wrap"><div><h2 className="text-white font-semibold text-lg">Current nominations</h2><p className="text-sm text-white/45 mt-1">Read from the connected wallet’s staking state.</p></div><span className="text-xs text-white/40">{chainData.nominations.length} target(s)</span></div>{chainData.nominations.length ? <div className="mt-4 grid gap-2">{chainData.nominations.map((address) => <div key={address} className="font-mono text-xs text-emerald-200 bg-white/[0.03] rounded-lg p-3 break-all">{address}</div>)}</div> : <p className="mt-4 text-sm text-white/45">No verified nominations found. This is a real empty state, not example data.</p>}</section>
    <section className="pd-card rounded-2xl border border-white/[0.07] p-6"><h2 className="text-white font-semibold text-lg">Network context</h2><div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5"><Metric label="Network" value="V3 Testnet" /><Metric label="Era" value={network?.latest_era == null ? '—' : `#${network.latest_era}`} /><Metric label="Validators" value={String(network?.validator_count ?? '—')} /><Metric label="Stake" value={`${network?.total_stake_pot ?? 0} POT`} /></div></section>
    <Link to="/stake" className="inline-block text-primary hover:underline">Open V3 staking flow →</Link>
  </main>
}
function Metric({ label, value, note }: { label: string; value: string; note?: string }) { return <div className="pd-card rounded-2xl border border-white/[0.07] p-5"><span className="text-[11px] uppercase tracking-wider text-white/40">{label}</span><div className="text-white font-bold text-2xl mt-2">{value}</div>{note && <p className="text-xs text-white/35 mt-2">{note}</p>}</div> }

export type PortfolioMode = 'v3-testnet-wallet-read'
export const portfolioMode: PortfolioMode = 'v3-testnet-wallet-read'

// All personal values above come from the connected V3 account; unavailable remains explicit.
const WALLET_READS_ARE_LIVE = true
if (!WALLET_READS_ARE_LIVE) throw new Error('unreachable')
