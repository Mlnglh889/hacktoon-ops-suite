import { NavLink } from 'react-router-dom'
import { useEffect, useState } from 'react'
import WalletButton from './WalletButton'

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  on?: (event: string, handler: (...args: unknown[]) => void) => void
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void
}

declare global {
  interface Window { ethereum?: EthereumProvider }
}

const TESTNET_CHAIN_ID = '0x190f1ca9'
const TESTNET_PARAMS = {
  chainId: TESTNET_CHAIN_ID,
  chainName: 'PortaldotV3 Testnet',
  nativeCurrency: { name: 'POT', symbol: 'POT', decimals: 14 },
  rpcUrls: ['https://test-evm-rpc-v3.portaldot.dev'],
  blockExplorerUrls: ['https://node-console.portaldot.dev'],
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

interface NavItem {
  to: string
  label: string
  icon: string
  badge?: string
}

const groups: { title: string | null; items: NavItem[] }[] = [
  {
    title: null,
    items: [{ to: '/', label: 'Overview', icon: 'dashboard' }],
  },
  {
    title: 'Stake',
    items: [
      { to: '/stake', label: 'Stake', icon: 'savings' },
      { to: '/unstake', label: 'Unstake', icon: 'undo' },
      { to: '/payouts', label: 'Payouts', icon: 'payments' },
    ],
  },
  {
    title: 'Validators',
    items: [
      { to: '/validators', label: 'Validators', icon: 'verified_user' },
    ],
  },
  {
    title: 'Portfolio',
    items: [
      { to: '/portfolio', label: 'Portfolio', icon: 'account_balance_wallet' },
    ],
  },
  {
    title: 'Support',
    items: [{ to: '/ai', label: 'Ask AI', icon: 'auto_awesome' }],
  },
]

function SideLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-2.5 rounded-xl text-[15px] font-medium transition-all ${
          isActive
            ? 'bg-primary/15 text-primary shadow-[inset_0_0_0_1px_rgba(139,92,246,0.35)]'
            : 'text-on-surface-variant hover:text-on-surface hover:bg-white/[0.04]'
        }`
      }
    >
      <span className="material-symbols-outlined text-[20px] w-5" translate="no">{item.icon}</span>
      <span className="whitespace-nowrap">{item.label}</span>
      {item.badge && (
        <span className="ml-auto text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          {item.badge}
        </span>
      )}
    </NavLink>
  )
}

export default function SideNav() {
  const [era, setEra] = useState<number | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    fetch('/api/v3/overview')
      .then((r) => r.json())
      .then((d) => setEra(d.latest_era))
      .catch(() => {})
  }, [])

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-50 h-16 bg-[#020617]/95 backdrop-blur-xl border-b border-white/10 flex items-center justify-between px-4">
        <button
          onClick={() => setOpen(!open)}
          className="w-10 h-10 rounded-lg bg-white/[0.06] flex items-center justify-center text-on-surface"
          aria-label="menu"
        >
          <span className="material-symbols-outlined" translate="no">menu</span>
        </button>
        <NavLink to="/" className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-secondary-container flex items-center justify-center">
            <span className="material-symbols-outlined text-white text-lg" translate="no">hub</span>
          </span>
          <span className="text-[16px] font-extrabold tracking-tight text-on-surface">PORTALDOT</span>
        </NavLink>
        <WalletButton mobile />
      </div>

      {/* Sidebar */}
      <aside
        className={`pd-sidebar fixed top-0 left-0 z-[60] h-full w-[182px] bg-[#04081a]/95 backdrop-blur-xl border-r border-white/[0.08] flex flex-col transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand */}
        <div className="hidden lg:flex items-center gap-3 px-5 h-[66px] border-b border-white/[0.06]">
          <NavLink to="/" className="flex items-center gap-3 group">
            <span className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 via-primary-container to-secondary-container flex items-center justify-center shadow-[0_0_20px_rgba(139,92,246,0.5)] group-hover:scale-110 group-hover:rotate-6 transition-transform">
              <span className="material-symbols-outlined text-white text-xl" translate="no">hub</span>
            </span>
            <span className="text-[15px] font-extrabold tracking-[0.04em] text-on-surface leading-tight">PORTALDOT</span>
          </NavLink>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {groups.map((g, i) => (
            <div key={i} className="space-y-1">
              {g.title && (
                <div className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/30">
                  {g.title}
                </div>
              )}
              {g.items.map((item) => (
                <SideLink key={item.to} item={item} />
              ))}
            </div>
          ))}
        </nav>

        {/* Network status footer */}
        <div className="px-4 py-4 border-t border-white/[0.06] space-y-2">
          <div className="flex items-center gap-2 text-[13px] text-on-surface-variant">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>
            <span>PortaldotV3 Testnet</span>
            {era !== null && <span className="ml-auto text-white/30">Era {era}</span>}
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-[55] bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}
    </>
  )
}
