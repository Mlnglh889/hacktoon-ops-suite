import { NavLink } from 'react-router-dom'
import { useEffect, useState } from 'react'

const links = [
  { to: '/', label: 'Home' },
  { to: '/stake', label: 'Stake' },
  { to: '/validators', label: 'Validators' },
  { to: '/portfolio', label: 'Portfolio' },
  { to: '/alerts', label: 'Alerts' },
]

export default function NavBar() {
  const [era, setEra] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/v1/stats').then(r => r.json()).then(d => setEra(d.era)).catch(() => {})
  }, [])

  return (
    <header className="fixed top-0 inset-x-0 z-50 bg-[#020617]/90 backdrop-blur-xl border-b border-white/10">
      <div className="h-24 max-w-[1600px] mx-auto px-6 flex items-center justify-between gap-6">
        {/* Brand & Primary Nav */}
        <div className="flex items-center gap-6">
          <NavLink to="/" className="flex items-center gap-space-sm group focus:outline-none">
            <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 via-primary-container to-secondary-container flex items-center justify-center shadow-[0_0_20px_rgba(139,92,246,0.5)] group-hover:scale-110 group-hover:rotate-6 transition-transform">
              <span className="material-symbols-outlined text-white text-2xl" translate="no">hub</span>
            </span>
            <span className="text-[22px] font-extrabold tracking-tight text-on-surface leading-none whitespace-nowrap">PORTALDOT</span>
          </NavLink>
          <nav className="hidden lg:flex items-center gap-8 pl-8">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === '/'}
                className={({ isActive }) =>
                  isActive
                    ? 'text-[17px] text-primary font-semibold relative after:content-[""] after:absolute after:-bottom-2 after:left-0 after:right-0 after:h-[2px] after:bg-primary after:shadow-[0_0_8px_rgba(208,188,255,0.8)]'
                    : 'text-[17px] text-on-surface-variant hover:text-on-surface transition-colors whitespace-nowrap'
                }
              >
                {l.label}
              </NavLink>
            ))}
            <NavLink
              to="/ai"
              className={({ isActive }) =>
                isActive
                  ? 'text-[17px] font-semibold text-primary flex items-center gap-1.5'
                  : 'text-[17px] text-on-surface-variant hover:text-on-surface transition-colors flex items-center gap-1.5'
              }
            >
              <span className="text-secondary">✦</span>
              <span>Ask AI</span>
            </NavLink>
          </nav>
        </div>
        {/* Trailing: Connect Wallet */}
        <div className="flex items-center gap-space-md">
          <button className="px-6 py-3 rounded-xl font-semibold text-[16px] text-white bg-gradient-to-r from-[#8083ff] to-[#6d3bd7] shadow-xl hover:brightness-110 transition flex items-center gap-2 active:scale-[0.98]">
            <span className="material-symbols-outlined text-[20px]" translate="no">account_balance_wallet</span>
            <span>Connect Wallet</span>
          </button>
        </div>
      </div>
    </header>
  )
}
