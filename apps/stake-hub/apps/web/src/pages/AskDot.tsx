import { useEffect, useRef, useState } from 'react'
import { useStats } from '../hooks/useStats'
import { useWallet } from '../lib/walletContext'

interface Msg {
  who: 'dot' | 'user'
  text: string
  time: string
  source?: string
  badge?: string
  badgeCls?: string
}

type AiHealth = {
  provider: string
  model: string
  models: string[]
  base_url: string
  has_key: boolean
  timeout_s: number
  context_bytes: number
}

const now = () =>
  new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + ' UTC'

export default function AskDot() {
  const stats = useStats()
  const { account } = useWallet()
  const [health, setHealth] = useState<AiHealth | null>(null)
  const [messages, setMessages] = useState<Msg[]>([
    {
      who: 'dot',
      time: now(),
      source: 'Source: live V3 data + app status',
      text: "Hi, I'm Dot. I can answer questions about this dashboard and the Portaldot V3 chain: why a table is empty, what Slow/Degraded means, why a stake or unstake failed, whether your payouts are claimed, or whether Telegram alerts are actually being delivered.",
    },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [askPulse, setAskPulse] = useState(false)
  const [mood, setMood] = useState<'idle' | 'thinking' | 'excited'>('idle')
  const kykiRef = useRef<HTMLImageElement>(null)

  const onTilt = (e: React.MouseEvent) => {
    const el = kykiRef.current
    if (!el || busy) return
    const rect = el.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 24
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * -24
    el.style.transform = `rotateY(${x}deg) rotateX(${y}deg)`
  }
  const onTiltEnd = () => { if (kykiRef.current) kykiRef.current.style.transform = '' }
  const chatRef = useRef<HTMLDivElement>(null)

  const scroll = () => setTimeout(() => chatRef.current?.scrollTo(0, chatRef.current.scrollHeight), 60)

  useEffect(() => {
    let alive = true
    fetch('/api/v1/ai/health', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setHealth(d) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const send = async (q: string) => {
    if (!q.trim() || busy) return
    setMessages((m) => [...m, { who: 'user', text: q, time: now() }])
    setInput('')
    setAskPulse(true)
    setMood('excited')
    setTimeout(() => setAskPulse(false), 950)
    setBusy(true)
    setMood('thinking')
    scroll()
    try {
      const r = await fetch('/api/v1/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The connected wallet address lets Dot answer portfolio and payout questions
        // for this specific account instead of guessing.
        body: JSON.stringify({ message: q, address: account?.address ?? null }),
      })
      const d = await r.json()
      // The badge must reflect what actually happened. A model failure is shown as a
      // warning with the real error, never as a green "deterministic analysis" badge.
      const ok = d.ok === true && Boolean(d.reply)
      setMessages((m) => [
        ...m,
        {
          who: 'dot',
          text: d.reply || 'Could not reach the chain. Try again.',
          time: now(),
          badge: ok
            ? `Grounded · ${d.model || 'live V3 context'}`
            : 'Model unavailable — no guess',
          badgeCls: ok
            ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
            : 'bg-amber-950/40 text-amber-300 border-amber-500/30',
          source: ok
            ? `Source: V3 chain + app status${typeof d.elapsed_s === 'number' ? ` · ${d.elapsed_s}s` : ''}`
            : (d.error ? `Error: ${d.error}` : undefined),
        },
      ])
    } catch {
      setMessages((m) => [...m, { who: 'dot', text: 'API not responding — the Dashboard still has live numbers.', time: now() }])
    } finally {
      setBusy(false)
      scroll()
    }
  }

  const chips = [
    'Why is my portfolio empty?',
    'Why does RPC say Degraded?',
    'Are my rewards claimed?',
    'Why did my stake fail?',
  ]

  const telemetry = [
    { label: 'Current Era', value: stats ? stats.era.toLocaleString() : '—', cls: 'text-white' },
    { label: 'Block', value: stats ? stats.block_height.toLocaleString() : '—', cls: 'text-white' },
    { label: 'Active Validators', value: stats ? `${stats.validators}` : '—', cls: 'text-tertiary' },
    // Provider/model actually in use, read from /api/v1/ai/health. Never hardcoded.
    {
      label: 'AI Model',
      value: health ? (health.has_key ? health.model.split('/').pop() || health.model : 'No key') : '—',
      cls: health?.has_key ? 'text-secondary' : 'text-amber-300',
    },
  ]

  return (
    <main className="relative z-10 flex-1 w-full max-w-[1280px] mx-auto px-margin-mobile md:px-margin pt-6 pb-12 flex flex-col gap-6">
      {/* 1. Companion hero banner */}
      <section className="w-full pd-card border border-white/[0.07] rounded-xl p-space-lg flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div className="flex items-start gap-4">
          <div className="relative shrink-0 mt-1 kyki-3d-wrap" onMouseMove={onTilt} onMouseLeave={onTiltEnd}>
            <div className="relative">
              <img src="/kyki-avatar.png" alt="Kyki" ref={kykiRef} className={`w-16 h-16 rounded-xl object-cover shadow-lg shadow-purple-500/20 transition-all ${
        mood === 'thinking' ? "kyki-think" : mood === 'excited' ? "kyki-pop" : askPulse ? "kyki-ask" : "kyki-idle"
      }`} />
              {mood === 'excited' && <span className="absolute -top-2 -right-2 text-lg">✨</span>}
            {mood === 'thinking' && <span className="absolute -top-2 -right-2 text-lg animate-pulse">💭</span>}
              <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-[#0B0F1E] rounded-full"></span>
            </div>
            <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-[#0B0F1E] rounded-full" title="Real-time connected"></span>
          </div>
          <div className="flex flex-col">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded text-[11px] font-label-mono bg-primary/10 text-primary border border-primary/20 tracking-wider">COMPANION ONLINE</span>
              <div className="flex items-center gap-1.5 text-xs text-on-surface-variant font-label-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>RPC Sync · PortaldotV3 Testnet Connected</span>
              </div>
            </div>
            <h1 className="text-headline-md font-headline-md text-white tracking-tight">
              Ask AI — Your Portaldot Staking Assistant
            </h1>
            <p className="text-body-sm font-body-sm text-on-surface-variant mt-0.5 max-w-2xl">
              I answer with live chain data — never guesses. Real-time telemetry, automated validator risk profiling, and slashing predictions.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 gap-2.5 w-full lg:w-auto">
          {telemetry.map((t) => (
            <div key={t.label} className="bg-[#111728] border border-white/10 rounded-lg px-3 py-2 flex flex-col">
              <span className="text-[10px] font-label-mono text-outline uppercase tracking-wider">{t.label}</span>
              <span className={`text-metric-numeral-md font-metric-numeral-md ${t.cls}`}>{t.value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 2. Chat console */}
      <section className="flex-1 bg-[#131A2E]/70 backdrop-blur-md border border-white/10 rounded-xl p-space-md md:p-space-lg flex flex-col relative shadow-2xl overflow-hidden min-h-[520px]">
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-400/40 to-transparent"></div>

        <div ref={chatRef} className="flex flex-col gap-6 overflow-y-auto pr-1 flex-1">
          {messages.map((m, i) =>
            m.who === 'dot' ? (
              <div key={i} className="flex items-start gap-3.5 max-w-4xl">
                <div className="w-9 h-9 rounded-lg overflow-hidden border border-purple-500/30 shrink-0 mt-0.5 shadow-sm">
                  <img src="/kyki-avatar.png" alt="Kyki" className="w-full h-full object-cover kyki-idle" />
                </div>
                <div className="flex flex-col gap-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-headline-sm text-sm text-white font-medium">Ask AI</span>
                    <span className="text-label-mono text-[11px] text-outline">{m.time}</span>
                    {m.source && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-label-mono bg-surface-container-lowest text-tertiary border border-white/10">{m.source}</span>
                    )}
                    {m.badge && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-label-mono border ${m.badgeCls || 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'}`}>{m.badge}</span>
                    )}
                  </div>
                  <div className="bg-[#172038] border border-white/10 rounded-xl p-4 text-on-surface text-body-md leading-relaxed whitespace-pre-wrap">
                    {m.text}
                  </div>
                </div>
              </div>
            ) : (
              <div key={i} className="flex flex-col items-end gap-1.5 ml-auto max-w-xl">
                <div className="flex items-center gap-2">
                  <span className="text-label-mono text-[11px] text-outline">Sent {m.time}</span>
                </div>
                <div className="bg-gradient-to-r from-[#4F46E5] to-[#7C3AED] text-white font-body-md px-5 py-3 rounded-xl rounded-tr-sm shadow-md">
                  {m.text}
                </div>
              </div>
            ),
          )}
          {busy && (
            <div className="flex items-start gap-3.5 max-w-4xl">
              <div className="w-9 h-9 rounded-lg bg-surface-container-high border border-purple-500/30 flex items-center justify-center shrink-0">
                <img src="/kyki-avatar.png" alt="Kyki" className="w-full h-full object-cover opacity-60 kyki-think" />
              </div>
              <div className="bg-[#172038] border border-white/10 rounded-xl p-4 text-on-surface-variant text-body-md">
                Checking live chain data…
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="mt-5 flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <button
                key={c}
                onClick={() => send(c)}
                className="px-3 py-1.5 rounded-full bg-surface-container border border-white/10 text-body-sm text-on-surface-variant font-label-mono hover:border-primary/50 hover:text-on-surface transition-all"
              >
                {c}
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <input
              value={input}
              onChange={(e) => setInput((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const v = (e.target as HTMLInputElement).value
                  setInput(v)
                  send(v)
                }
              }}
              placeholder={account ? `Ask about the dashboard or wallet ${account.address.slice(0, 6)}…${account.address.slice(-4)}` : 'Ask about this dashboard or Portaldot V3…'}
              className="flex-1 bg-surface-container-lowest border border-white/15 rounded-lg px-4 py-3 text-body-sm placeholder:text-outline focus:outline-none focus:border-primary/60"
            />
            <button
              onClick={() => send(input)}
              className="primary-cta-gradient text-white px-5 py-3 rounded-lg font-label-md font-semibold hover:brightness-110 active:scale-95 transition-all flex items-center gap-1.5"
            >
              <span>Send</span>
              <span className="material-symbols-outlined text-[16px]" translate="no">send</span>
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}
