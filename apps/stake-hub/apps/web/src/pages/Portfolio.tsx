import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useWallet } from '../lib/walletContext'
import { v3Api, type V3Payouts } from '../lib/v3Api'

const fmt = (value: number | null | undefined, digits = 4) => value === null || value === undefined ? '—' : value.toLocaleString('en-US', { maximumFractionDigits: digits })
/* Fixed precision per column so decimal points line up down the table. */
const fmtFixed = (value: number | null | undefined, digits: number) => value === null || value === undefined
  ? '—'
  : value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
const short = (address: string) => `${address.slice(0, 8)}…${address.slice(-6)}`
/* Payee can be a keyword like "Staked" instead of an SS58 address. Only
   abbreviate values that actually look like an address. */
const shortMaybeAddress = (value: string | null | undefined) => {
  if (!value) return '—'
  return /^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(value) ? short(value) : value
}

type Tab = 'position' | 'nominations'

function Metric({ label, value, note, tone }: { label: string; value: string; note?: string; tone: 'cyan' | 'purple' | 'muted' | 'green' }) {
  const colors = { cyan: 'text-[#22D3EE]', purple: 'text-[#8B5CF6]', muted: 'text-[#94A3B8]', green: 'text-[#4ADE80]' }
  return (
    <div className="pf-metric">
      <div className="flex items-center justify-between gap-2">
        <span className="pf-label">{label}</span>
        <span className={`${colors[tone]} text-[8px] leading-none`}>●</span>
      </div>
      <div className="pf-value">{value}</div>
      {note && <div className="pf-note">{note}</div>}
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="pf-field">
      <span className="pf-label">{label}</span>
      <span className={`pf-field-value ${mono ? 'font-mono break-all' : ''}`}>{value}</span>
    </div>
  )
}

function StatusPill({ state, payable }: { state: string; payable: boolean }) {
  const claimed = state === 'claimed'
  const cls = !payable ? 'pf-pill pf-pill-idle' : claimed ? 'pf-pill pf-pill-ok' : 'pf-pill pf-pill-warn'
  const text = !payable ? 'Not payable' : claimed ? 'Claimed' : 'Claimable'
  return <span className={cls}>{text}</span>
}

const formatEraTime = (ms: number | null) => ms === null ? '—' : new Date(ms).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function Portfolio() {
  const { account, chainData } = useWallet()
  const [params] = useSearchParams()
  // Read-only viewing: /portfolio?address=<SS58> computes payouts for any wallet
  // without an extension. It never signs and never shows it as a connected wallet.
  const readOnlyAddress = useMemo(() => {
    const candidate = (params.get('address') || '').trim()
    return /^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(candidate) ? candidate : null
  }, [params])
  const payoutAddress = account?.address ?? readOnlyAddress
  const [tab, setTab] = useState<Tab>('position')
  const [network, setNetwork] = useState<Awaited<ReturnType<typeof v3Api.overview>> | null>(null)
  const [payouts, setPayouts] = useState<V3Payouts | null>(null)
  const [payoutError, setPayoutError] = useState<string | null>(null)
  const [payoutLoading, setPayoutLoading] = useState(false)

  useEffect(() => { v3Api.overview().then(setNetwork).catch(() => {}) }, [])

  useEffect(() => {
    if (!payoutAddress) { setPayouts(null); setPayoutError(null); return }
    let alive = true
    setPayoutLoading(true)
    setPayoutError(null)
    v3Api.payouts(payoutAddress, 8)
      .then((data) => { if (alive) setPayouts(data) })
      .catch((error) => { if (alive) setPayoutError(error instanceof Error ? error.message : 'Payout read failed') })
      .finally(() => { if (alive) setPayoutLoading(false) })
    return () => { alive = false }
  }, [payoutAddress])

  const rows = payouts?.rows ?? []
  const totals = payouts?.totals
  const eraLabel = network?.latest_era == null ? 'Era —' : `Era #${network.latest_era}`
  const emptyHint = payoutAddress ? `No staking exposure for ${short(payoutAddress)} in the last ${payouts?.eras.length ?? 8} eras.` : 'Connect a wallet to read payouts.'

  return (
    <main className="portfolio-page relative z-10 flex-1 w-full max-w-[1520px] mx-auto px-4 sm:px-6 pt-24 lg:pt-[76px] pb-10 space-y-5">

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        <Metric label="Available" value={chainData.freePot === null ? '—' : `${fmt(chainData.freePot)} tPOT`} note={chainData.freePot === null ? 'Connect wallet' : 'Ready to stake'} tone="cyan" />
        <Metric label="Staked" value={chainData.bondedPot === null ? '—' : `${fmt(chainData.bondedPot)} tPOT`} note={chainData.hasLedger ? 'On-chain ledger' : 'No active stake'} tone="purple" />
        <Metric label="Unlocking" value={`${fmt(chainData.unlockingPot)} tPOT`} note={`${chainData.unlockingCount} chunk(s) pending`} tone="muted" />
        <Metric label="Nominations" value={`${chainData.nominations.length}`} note="Validator targets" tone="green" />
      </section>

      <section className="pf-card">
        <div className="pf-card-head">
          <div className="pf-tabs">
            <button onClick={() => setTab('position')} className={`pf-tab ${tab === 'position' ? 'is-active' : ''}`}>Position</button>
            <button onClick={() => setTab('nominations')} className={`pf-tab ${tab === 'nominations' ? 'is-active' : ''}`}>
              Validators
              <span className="pf-tab-count">{chainData.nominations.length}</span>
            </button>
          </div>
          <div className="pf-meta">
            <span>{eraLabel}</span>
            <span className="pf-live"><i />Live read</span>
          </div>
        </div>

        {tab === 'position' ? (
          <div className="pf-body">
            <div className="pf-fields">
              <Field label="Wallet" value={account ? short(account.address) : readOnlyAddress ? `${short(readOnlyAddress)} (read-only)` : '—'} mono />
              <Field label="Network era" value={network?.latest_era == null ? '—' : `#${network.latest_era}`} />
              <Field label="Last read" value={chainData.refreshedAt ? new Date(chainData.refreshedAt).toLocaleTimeString() : '—'} />
              <Field label="Available" value={chainData.freePot === null ? '—' : `${fmt(chainData.freePot)} tPOT`} />
              <Field label="Staked" value={chainData.bondedPot === null ? '—' : `${fmt(chainData.bondedPot)} tPOT`} />
              <Field label="Unlocking" value={`${fmt(chainData.unlockingPot)} tPOT`} />
            </div>
            <div className="pf-source">Connected wallet · live Substrate RPC</div>
          </div>
        ) : (
          <div className="pf-table-wrap">
            <table className="pf-table">
              <thead>
                <tr>
                  <th>Validator</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th className="pf-num">Details</th>
                </tr>
              </thead>
              <tbody>
                {chainData.nominations.length ? chainData.nominations.map((address) => (
                  <tr key={address}>
                    <td className="font-mono text-[#22D3EE] break-all">{address}</td>
                    <td><span className="pf-pill pf-pill-ok">Active</span></td>
                    <td className="text-[#94A3B8]">Validator target</td>
                    <td className="pf-num text-[#a78bfa]">View →</td>
                  </tr>
                )) : (
                  <tr><td colSpan={4} className="pf-empty">No nominated validators yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="pf-card">
        <div className="pf-card-head">
          <div className="flex items-center gap-2.5">
            <h2 className="pf-title">Payout history</h2>
            <span className="pf-chip">{payouts?.eras.length ?? 8} eras</span>
          </div>
          <div className="flex items-center gap-1.5">
            {payouts && <span className="pf-chip">{payouts.served_from === 'cache' ? 'Cached' : 'Chain'}</span>}
            <span className="pf-chip pf-chip-warn">Chain-verified</span>
          </div>
        </div>

        <div className="pf-summary">
          <div className="pf-summary-item">
            <span className="pf-label">Reward in window</span>
            <span className="pf-summary-value">{totals ? `${fmtFixed(totals.reward_pot, 6)} tPOT` : '—'}</span>
          </div>
          <div className="pf-summary-item">
            <span className="pf-label">Claimed</span>
            <span className="pf-summary-value text-[#4ADE80]">{totals ? `${fmtFixed(totals.claimed_pot, 6)} tPOT` : '—'}</span>
          </div>
          <div className="pf-summary-item">
            <span className="pf-label">Payee</span>
            <span className="pf-summary-value pf-summary-mono">{shortMaybeAddress(payouts?.payee)}</span>
          </div>
        </div>

        <div className="pf-table-wrap hidden md:block">
          <table className="pf-table">
            <thead>
              <tr>
                <th>Era</th>
                <th>Era start</th>
                <th>Validator</th>
                <th className="pf-num">Your stake</th>
                <th className="pf-num">Era reward</th>
                <th className="pf-num">Commission</th>
                <th className="pf-num">Your reward</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {payoutLoading && !rows.length ? (
                <tr><td colSpan={8} className="pf-empty">Reading staking storage…</td></tr>
              ) : payoutError ? (
                <tr><td colSpan={8} className="pf-empty pf-empty-error">{payoutError}</td></tr>
              ) : rows.length ? rows.map((row) => (
                <tr key={`${row.era}-${row.validator}`}>
                  <td>
                    <span className="pf-era">#{row.era}</span>
                    {row.is_current_era && <span className="pf-live-tag">Live</span>}
                  </td>
                  <td className="font-mono text-[#8a94b8] whitespace-nowrap">{formatEraTime(row.era_start_ms)}</td>
                  <td className="font-mono text-[#22D3EE]" title={row.validator}>{short(row.validator)}</td>
                  <td className="pf-num">{fmtFixed(row.stake_pot, 4)}</td>
                  <td className="pf-num text-[#8a94b8]">{row.era_reward_pot === null ? 'pending' : fmtFixed(row.era_reward_pot, 4)}</td>
                  <td className="pf-num text-[#8a94b8]">{row.commission_pct}%</td>
                  <td className={`pf-num ${row.reward_pot === null ? 'text-[#8a94b8]' : 'pf-reward'}`}>{row.reward_pot === null ? 'pending' : fmtFixed(row.reward_pot, 8)}</td>
                  <td><StatusPill state={row.claim_state} payable={row.reward_pot !== null} /></td>
                </tr>
              )) : (
                <tr><td colSpan={8} className="pf-empty">{emptyHint}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="md:hidden">
          {payoutLoading && !rows.length ? (
            <div className="pf-empty">Reading staking storage…</div>
          ) : payoutError ? (
            <div className="pf-empty pf-empty-error">{payoutError}</div>
          ) : rows.length ? rows.map((row) => (
            <div key={`${row.era}-${row.validator}`} className="pf-mobile-row">
              <div className="flex items-center justify-between gap-3">
                <span className="pf-era">#{row.era}{row.is_current_era && <span className="pf-live-tag">Live</span>}</span>
                <StatusPill state={row.claim_state} payable={row.reward_pot !== null} />
              </div>
              <div className="pf-mobile-value">
                {row.reward_pot === null ? 'pending' : `${fmt(row.reward_pot, 8)} tPOT`}
              </div>
              <div className="pf-mobile-meta">
                <span className="font-mono text-[#22D3EE]">{short(row.validator)}</span>
                <span>{formatEraTime(row.era_start_ms)}</span>
                <span>stake {fmtFixed(row.stake_pot, 4)}</span>
                <span>comm {row.commission_pct}%</span>
              </div>
            </div>
          )) : <div className="pf-empty">{emptyHint}</div>}
        </div>

        <div className="pf-foot">
          <span>{rows.length ? `${rows.length} record(s)` : 'No records'}</span>
          <span className="font-mono">{payouts?.source ? 'Portaldot V3 staking storage' : 'Awaiting wallet'}</span>
        </div>
      </section>
    </main>
  )
}

export type PortfolioMode = 'v3-testnet-wallet-read'
