import { useState } from 'react'
import { useWallet } from '../lib/walletContext'
import { broadcastSubstrateHeartbeat, type BroadcastUpdate } from '../lib/heartbeat'

export default function HeartbeatButton() {
  const { account, connect } = useWallet()
  const [update, setUpdate] = useState<BroadcastUpdate | null>(null)
  const [busy, setBusy] = useState(false)

  async function run() {
    if (!account) { await connect(); return }
    setBusy(true); setUpdate({ status: 'Preparing wallet request…' })
    try { await broadcastSubstrateHeartbeat(account, setUpdate) }
    catch (error) { setUpdate({ status: 'Broadcast failed', error: error instanceof Error ? error.message : String(error) }) }
    finally { setBusy(false) }
  }

  return <section className="pd-card rounded-2xl border border-white/[0.07] p-6">
    <div className="flex items-start justify-between gap-5 flex-wrap">
      <div><div className="text-[11px] uppercase tracking-[0.18em] text-primary mb-2">On-chain evidence</div><h2 className="text-white font-semibold text-lg">Validator snapshot heartbeat</h2><p className="text-slate-400 text-sm mt-2 max-w-xl">Sign a V3 testnet transaction through Portaldot Extension. No private key enters this website.</p></div>
      <button disabled={busy} onClick={() => { void run() }} className="px-5 py-3 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-[#8083ff] to-[#6d3bd7] disabled:opacity-50">{busy ? 'Waiting…' : account ? 'Broadcast heartbeat' : 'Connect wallet'}</button>
    </div>
    {update && <div className="mt-4 rounded-xl bg-black/20 border border-white/10 p-4 text-sm"><div className="text-white">{update.status}</div>{update.txHash && <div className="text-slate-400 mt-1 break-all">Tx: {update.txHash}</div>}{update.blockHash && <div className="text-slate-400 mt-1 break-all">Block: {update.blockHash}</div>}{update.error && <div className="text-rose-300 mt-1">{update.error}</div>}</div>}
  </section>
}
