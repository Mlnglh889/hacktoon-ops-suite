import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import WalletButton from './WalletButton'

export function StakingChrome({ children }: { children: ReactNode }) {
  return <div className="stake-shell"><div className="stake-wallet-corner"><WalletButton /></div><div className="stake-topbar"><StakingTabs /></div>{children}</div>
}

const tabs = [
  { to: '/stake', label: 'Stake' },
  { to: '/unstake', label: 'Unstake' },
]

function StakingTabs() {
  return (
    <nav className="stake-tabs" aria-label="Staking actions">
      {tabs.map(tab => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) => isActive ? 'active' : ''}
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}

export function StakingPageHeader({ title, description }: { title: string; description: string }) {
  return <header className="staking-secondary-header">
    <div className="stake-wallet-corner"><WalletButton /></div><div className="stake-topbar"><StakingTabs /></div>
    <div><h1 className="text-[28px] font-bold tracking-tight text-white">{title}</h1><p className="mt-1 text-[13px] text-[#aeb7d2]">{description}</p></div>
  </header>
}

export function WalletUnavailable({ children = 'Connect a wallet to load your staking positions and continue.' }: { children?: string }) {
  return <div className="rounded-lg border border-amber-500/25 bg-amber-500/[.08] p-4 text-[13px] text-amber-200"><span className="material-symbols-outlined mr-2 align-middle text-[17px]" translate="no">account_balance_wallet</span>{children}</div>
}

export function SolidPanel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-[#24305c] bg-gradient-to-b from-[#1c1650] to-[#0f0b38] p-5 shadow-xl ${className}`}>{children}</section>
}

export function PanelTitle({ title, description }: { title: string; description: string }) {
  return <div className="mb-5"><h2 className="text-[19px] font-bold text-white">{title}</h2><p className="mt-1 text-[12px] text-[#aeb7d2]">{description}</p></div>
}

export function unavailablePositionColumns() {
  return <div className="rounded-lg border border-dashed border-[#354474] bg-[#0b1231] p-10 text-center"><span className="material-symbols-outlined text-[30px] text-[#8b55ff]" translate="no">account_balance_wallet</span><h3 className="mt-3 text-[15px] font-semibold text-white">Wallet connection unavailable</h3><p className="mx-auto mt-2 max-w-md text-[12px] leading-5 text-[#9ea9ca]">The current application has no wallet provider or wallet-scoped staking position endpoint. No positions are shown until those integrations are available.</p></div>
}

export function SectionLoading({ text = 'Loading live network data…' }: { text?: string }) {
  return <div className="py-10 text-center text-[13px] text-[#aeb7d2]"><span className="material-symbols-outlined mr-2 animate-spin align-middle text-[17px]" translate="no">progress_activity</span>{text}</div>
}

export function StatusPill({ status }: { status: string }) {
  const active = status === 'Active'
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] ${active ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-400/30 bg-amber-500/10 text-amber-300'}`}><span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-400' : 'bg-amber-400'}`} />{status}</span>
}

export interface ApiValidator { address: string; name: string; commission: number; total_stake_pot: number; status?: 'Active' | 'Inactive' | 'Unknown' }

export async function loadValidators(): Promise<ApiValidator[]> {
  const response = await fetch('/api/v1/validators')
  if (!response.ok) throw new Error(`Request failed: ${response.status}`)
  const data = await response.json() as { validators?: ApiValidator[] }
  return data.validators || []
}

export const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`
export const fmtPot = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 })

export { StakingTabs }
export default StakingTabs

export function useStakingTabs() { return tabs }

export function ReviewNote({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-[#354474] bg-[#0b1231] p-4 text-[12px] leading-5 text-[#aeb7d2]"><span className="material-symbols-outlined mr-2 align-middle text-[16px] text-[#a78bfa]" translate="no">info</span>{children}</div>
}

export function ConfirmButton({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick?: () => void }) {
  return <button disabled={disabled} onClick={onClick} className="w-full rounded-lg bg-gradient-to-r from-[#8953ff] to-[#5c35df] py-3 text-[13px] font-bold text-white shadow-[0_0_18px_rgba(124,92,255,.3)] disabled:cursor-not-allowed disabled:opacity-35">{children}</button>
}

export function ErrorBox({ message }: { message: string }) {
  return <div className="rounded-lg border border-red-400/25 bg-red-500/[.08] p-4 text-[12px] text-red-200">{message}</div>
}

export function EmptyBox({ message }: { message: string }) {
  return <div className="rounded-lg border border-dashed border-[#354474] bg-[#0b1231] p-8 text-center text-[12px] text-[#9ea9ca]">{message}</div>
}

export function MonoValue({ children }: { children: React.ReactNode }) {
  return <span className="font-metric-md text-white">{children}</span>
}

export function InfoLabel({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><p className="text-[10px] uppercase tracking-[.12em] text-[#8995bb]">{label}</p><div className="mt-1 text-[14px]">{value}</div></div>
}

export function TableHead({ children }: { children: React.ReactNode }) {
  return <th className="border-b border-white/[.08] px-4 py-3 text-left text-[10px] uppercase tracking-[.12em] text-[#8995bb]">{children}</th>
}

export function TableCell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`border-b border-white/[.06] px-4 py-3 text-[12px] text-[#d8dced] ${className}`}>{children}</td>
}

export function useLiveValidators() {
  const [state, setState] = React.useState<{ data: ApiValidator[]; loading: boolean; error: string }>({ data: [], loading: true, error: '' })
  React.useEffect(() => { let live = true; loadValidators().then(data => live && setState({ data, loading: false, error: '' })).catch(error => live && setState({ data: [], loading: false, error: error.message })); return () => { live = false } }, [])
  return state
}
import * as React from 'react'
export { React }
import { useState } from 'react'
export { useState }

export function useAmount(max: number) {
  const [amount, setAmount] = useState('')
  const parsed = Number(amount)
  const valid = Number.isFinite(parsed) && parsed > 0 && parsed <= max
  return { amount, setAmount, parsed, valid, max }
}

export function FieldLabel({ children }: { children: React.ReactNode }) { return <label className="mb-2 block text-[10px] uppercase tracking-[.12em] text-[#8995bb]">{children}</label> }

export function AmountField({ amount, setAmount, max }: { amount: string; setAmount: (v: string) => void; max: number }) {
  return <div className="flex h-12 items-center rounded-lg border border-[#4c4ca9] bg-[#070f2c] px-3 focus-within:ring-2 focus-within:ring-[#8b55ff]"><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" className="w-full bg-transparent text-[20px] font-semibold text-white outline-none" /><span className="text-[13px] font-bold text-[#d0d5e8]">POT</span></div>
}

export function unavailableTransaction(): never { throw new Error('Wallet signing and staking transaction integration are not available in the current application.') }
