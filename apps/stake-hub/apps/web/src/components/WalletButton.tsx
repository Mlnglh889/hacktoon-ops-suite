import { useEffect, useState } from 'react'
import { useWallet } from '../lib/walletContext'

type Props = { mobile?: boolean }

export default function WalletButton({ mobile = false }: Props) {
  const { account, accounts, connect, selectAccount, disconnect, shortAddress, message } = useWallet()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [open])

  const sizeCls = mobile ? 'w-10 h-10 rounded-lg px-0' : 'w-full px-4 py-2.5 rounded-xl'
  const baseCls = `pd-wallet ${sizeCls} font-semibold text-[13px] text-white shadow-xl hover:brightness-110 transition flex items-center justify-center gap-2 active:scale-[0.98]`

  return (
    <div className={`relative flex items-center gap-2 ${mobile ? '' : 'w-full'}`}>
      {message && !account && <span role="status" className="hidden sm:inline max-w-[360px] text-[11px] leading-snug text-white/60">{message}</span>}
      {!account ? (
        <button onClick={() => { void connect() }} className={baseCls}>
          <span className="pd-wallet-dot" />
          <span className={mobile ? 'sr-only' : ''}>Connect Wallet</span>
        </button>
      ) : (
        <div className="relative">
          <button
            onClick={(event) => { event.stopPropagation(); setOpen((v) => !v) }}
            aria-haspopup="menu"
            aria-expanded={open}
            className={baseCls}
          >
            <span className="pd-wallet-dot" />
            <span className={mobile ? 'sr-only' : ''}>{shortAddress}</span>
          </button>
          {open && (
            <div role="menu" onClick={(event) => event.stopPropagation()} className="absolute right-0 top-full mt-2 w-full min-w-[140px] rounded-2xl border border-violet-300/40 bg-[#14123d] shadow-[0_16px_40px_-6px_rgba(0,0,0,0.85),0_0_0_1px_rgba(124,77,255,0.25)] p-1.5 z-[110]">
              <button role="menuitem" onClick={() => { disconnect(); setOpen(false) }} className="w-full flex items-center gap-2 px-4 py-2.5 rounded-full text-[13px] font-semibold text-white hover:bg-gradient-to-r hover:from-[#7c4dff] hover:to-[#4f6dff] transition">
                <span className="material-symbols-outlined text-[16px] leading-none">logout</span>
                Logout
              </button>
            </div>
          )}
        </div>
      )}
      {accounts.length > 1 && !mobile && <select aria-label="Select Portaldot account" value={account?.address || ''} onChange={(event) => selectAccount(event.target.value)} className="max-w-[180px] rounded-lg bg-white/[0.06] border border-white/10 text-xs text-white px-2 py-2">
        {accounts.map((candidate) => <option key={candidate.address} value={candidate.address}>{candidate.meta.name || candidate.address.slice(0, 8)} · {candidate.address.slice(-6)}</option>)}
      </select>}
    </div>
  )
}

export { WalletButton }
