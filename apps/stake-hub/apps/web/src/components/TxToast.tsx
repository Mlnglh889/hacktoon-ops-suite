import { useEffect, useState } from 'react'
import type { StakingUpdate } from '../lib/staking'

const EXPLORER = 'https://node-console.portaldot.dev'

// Floating transaction popup, bottom-right. Shows status, tx hash, explorer link.
export default function TxToast({ update }: { update: StakingUpdate | null }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => { if (update) { setOpen(true); setCopied(false) } }, [update])
  if (!update || !open) return null

  const ok = !update.error && /finalized/i.test(update.status)
  const tone = update.error ? '#f87171' : ok ? '#34d399' : '#a78bfa'
  const short = update.txHash ? `${update.txHash.slice(0, 12)}…${update.txHash.slice(-8)}` : null

  return (
    <div role="status" aria-live="polite" style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 9999, maxWidth: 340, width: 'calc(100vw - 32px)', background: '#0b1020', border: `1px solid ${tone}`, borderRadius: 12, padding: '12px 14px', boxShadow: '0 12px 40px rgba(0,0,0,.5)', color: '#f1f5f9', fontFamily: 'Inter, sans-serif', fontSize: 13 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <strong style={{ color: tone }}>{update.status}</strong>
        <button type="button" aria-label="Close" onClick={() => setOpen(false)} style={{ background: 'none', border: 0, color: '#94a3b8', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
      </div>
      {update.error && <div style={{ marginTop: 6, color: '#fca5a5', wordBreak: 'break-word' }}>{update.error}</div>}
      {update.txHash && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ color: '#94a3b8', fontSize: 11 }}>Tx hash</span>
          <code style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>{update.txHash}</code>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href={`${EXPLORER}/#/extrinsic/${update.txHash}`} target="_blank" rel="noreferrer" style={{ color: '#a78bfa', fontWeight: 600 }}>View on explorer ↗</a>
            <button type="button" onClick={() => { void navigator.clipboard?.writeText(update.txHash!); setCopied(true) }} style={{ background: 'none', border: 0, color: '#94a3b8', cursor: 'pointer', padding: 0 }}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
          {short && <span translate="no" style={{ color: '#64748b', fontSize: 11 }}>{short}</span>}
        </div>
      )}
    </div>
  )
}
