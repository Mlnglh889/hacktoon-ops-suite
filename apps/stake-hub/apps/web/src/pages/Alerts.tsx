import { useState } from 'react'
import Layout from '../components/Layout'

const BOT_USERNAME = 'PortaldotStakeBot'

interface Trigger {
  key: string
  title: string
  badge: string
  badgeCls: string
  desc: string
  defaultOn: boolean
}

const TRIGGERS: Trigger[] = [
  { key: 'slashing', title: 'Slashing events', badge: 'Critical', badgeCls: 'pd-pill pd-pill-risk', desc: 'Unbonding penalty or double-signing detected on-chain.', defaultOn: true },
  { key: 'commission', title: 'Commission changes', badge: 'Warning', badgeCls: 'pd-pill pd-pill-watch', desc: 'Validator commission hikes > 1.0% in current era.', defaultOn: true },
  { key: 'rewards', title: 'Era rewards', badge: 'Info', badgeCls: 'pd-pill pd-pill-neutral', desc: 'New staking rewards payout for your bonded stake.', defaultOn: true },
  { key: 'risk', title: 'Risk tier changes', badge: 'Watch', badgeCls: 'pd-pill pd-pill-safe', desc: 'A nominated validator moves between SAFE/WATCH/RISK.', defaultOn: false },
]

export default function Alerts() {
  const [wallet, setWallet] = useState('')
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')
  const [alerts, setAlerts] = useState<Record<string, boolean>>(
    Object.fromEntries(TRIGGERS.map((t) => [t.key, t.defaultOn])),
  )

  const toggle = (k: string) => setAlerts((a) => ({ ...a, [k]: !a[k] }))

  const connect = () => {
    if (wallet.trim().length < 20) { setError('Address too short'); return }
    setError('')
    setConnected(true)
  }

  const openTelegram = () => {
    const types = Object.entries(alerts).filter(([, v]) => v).map(([k]) => k).join(',')
    window.open(`https://t.me/${BOT_USERNAME}?start=${encodeURIComponent(`${wallet}_${types}`)}`, '_blank')
  }

  return (
    <Layout title="Telegram Alerts" subtitle="Real-time validator monitoring delivered to Telegram">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT: Steps */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Step 1 */}
          <div className="pd-card rounded-xl border border-white/[0.07] p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-6 h-6 rounded-md bg-indigo-400/15 text-indigo-300 text-xs font-bold flex items-center justify-center">1</span>
              <h2 className="text-sm font-semibold text-white">Target account</h2>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={wallet}
                onChange={(e) => setWallet(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && connect()}
                placeholder="Paste ss58 address (5...)"
                className="flex-1 bg-[#080d1a] border border-white/[0.08] focus:border-violet-500/50 rounded-lg px-3.5 py-2.5 text-sm font-mono text-white placeholder:text-white/20 outline-none transition-all"
              />
              <button onClick={connect} className="px-4 py-2.5 rounded-lg primary-cta-gradient text-white text-sm font-medium transition-all active:scale-[0.98] whitespace-nowrap">
                Lookup
              </button>
            </div>
            {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
            {connected && <p className="text-emerald-400 text-xs mt-2">✓ Address connected</p>}
            <div className="flex gap-2 mt-3">
              {['5DHWWSGrhRgv9Mb4M8rFq2mFwsAneYXhewxDpMNWZsvXAjDC', '5CtnsMus9bYeJLJdbZ8bUXCrSZWqIhJN2Csb3qYTTXYHZXwpT'].map((addr, i) => (
                <button key={addr} onClick={() => setWallet(addr)} className="text-[10px] px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] text-white/40 hover:text-white/70 transition-all font-mono">
                  Sample {i + 1}
                </button>
              ))}
            </div>
          </div>

          {/* Step 2 */}
          <div className="pd-card rounded-xl border border-white/[0.07] p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-6 h-6 rounded-md bg-violet-400/15 text-violet-300 text-xs font-bold flex items-center justify-center">2</span>
              <h2 className="text-sm font-semibold text-white">What to watch</h2>
            </div>
            <div className="space-y-2">
              {TRIGGERS.map((t) => (
                <label key={t.key} className="flex items-center gap-3 p-3 rounded-lg bg-[#080d1a] border border-white/[0.05] hover:border-white/[0.1] cursor-pointer transition-colors">
                  <input type="checkbox" checked={alerts[t.key]} onChange={() => toggle(t.key)} className="w-4 h-4 rounded accent-violet-500" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-white/80 font-medium">{t.title}</span>
                      <span className={t.badgeCls}>{t.badge}</span>
                    </div>
                    <p className="text-xs text-white/35 mt-0.5">{t.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Step 3 */}
          <div className="pd-card rounded-xl border border-white/[0.07] p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-6 h-6 rounded-md bg-sky-400/15 text-sky-300 text-xs font-bold flex items-center justify-center">3</span>
              <h2 className="text-sm font-semibold text-white">Link Telegram</h2>
            </div>
            <button
              onClick={openTelegram}
              disabled={!connected}
              className={`w-full flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-all ${
                connected ? 'primary-cta-gradient text-white hover:brightness-110 active:scale-[0.98]' : 'bg-white/[0.03] border border-white/[0.06] text-white/30 cursor-not-allowed'
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z"/></svg>
              {connected ? 'Enable Telegram Alerts' : 'Connect address first'}
            </button>
          </div>
        </div>

        {/* RIGHT: Preview */}
        <div className="lg:col-span-5 flex flex-col gap-4 lg:sticky lg:top-20">
          <div className="pd-card rounded-xl border border-white/[0.07] p-5">
            <h3 className="text-[10px] uppercase tracking-widest text-white/35 font-semibold mb-4">Alert preview</h3>
            <div className="bg-[#080d1a] rounded-xl p-4 border border-white/[0.05]">
              <div className="flex items-center gap-2 mb-2">
                <img src="/kyki-avatar.png" alt="Kyki" className="w-6 h-6 rounded object-cover" />
                <span className="text-xs font-semibold text-white/80">Portaldot AI Alerts</span>
                <span className="ml-auto text-[10px] text-white/25">now</span>
              </div>
              <div className="text-sm text-white/90 font-medium">⚠️ Commission change</div>
              <div className="text-xs text-white/45 mt-1">
                Validator <span className="font-mono text-white/60">5CPtEf…DiCY</span> raised commission from <b className="text-white/80">26%</b> to <b className="text-red-400">41%</b>.
              </div>
              <div className="text-[10px] text-white/25 mt-2">Era 3,871 · Portaldot mainnet</div>
            </div>
          </div>

          <div className="pd-card rounded-xl border border-white/[0.07] p-5">
            <h3 className="text-[10px] uppercase tracking-widest text-white/35 font-semibold mb-3">Delivery channels</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-white/45">Telegram</span><span className="text-emerald-400 text-xs font-semibold">ACTIVE</span></div>
              <div className="flex justify-between"><span className="text-white/45">Webhooks</span><span className="text-white/20 text-xs font-semibold">SOON</span></div>
              <div className="flex justify-between"><span className="text-white/45">Discord</span><span className="text-white/20 text-xs font-semibold">SOON</span></div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
