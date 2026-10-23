import TxToast from '../components/TxToast'
import { useEffect, useMemo, useState } from 'react'
import { useWallet } from '../lib/walletContext'
import { v3Api } from '../lib/v3Api'
import { decimalToPlanck, planckToPot, submitStaking, estimateStakeFee, getBondingDuration, type StakingUpdate } from '../lib/staking'

type Validator = { address: string; name: string; commission: number | null; total_stake_pot: number | null; status?: string }
type Overview = { total_staked_pot: number; est_base_apy_pct: number; apy_is_model_estimate?: boolean }
type Stats = { era: number | null; validators: number; active_validator_count: number | null; staking_ratio_pct: number }

const EXPLORER = 'https://node-console.portaldot.dev'
const PAGE_SIZE = 5
const VALIDATOR_CACHE_KEY = 'stakehub.validators.v1'
const cachedValidators = (): Validator[] => {
  try {
    const raw = window.localStorage.getItem(VALIDATOR_CACHE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed as Validator[] : []
  } catch { return [] }
}
const fmt = (value: string | number | null, digits = 4) => value === null ? 'Unavailable' : Number(value).toLocaleString('en-US', { maximumFractionDigits: digits })
const short = (address: string) => `${address.slice(0, 8)}…${address.slice(-6)}`

function Metric({ icon, label, value, note, tone = 'normal' }: { icon: string; label: string; value: string; note: string; tone?: 'normal' | 'green' | 'violet' | 'blue' }) {
  return <div className="unstake-metric"><div className="unstake-metric-top"><span>{label}</span><span className={`material-symbols-outlined tone-${tone}`} translate="no">{icon}</span></div><div className={`unstake-metric-value tone-${tone}`} translate="no">{value}</div><div className="unstake-metric-note">{note}</div></div>
}

function Row({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return <div className="unstake-review-row"><span>{label}</span><b className={muted ? 'muted' : ''} translate="no">{value}</b></div>
}

export default function Stake() {
  const { account, chainData, refreshChainData } = useWallet()
  const [validators, setValidators] = useState<Validator[]>(cachedValidators)
  const [selected, setSelected] = useState<string[]>([])
  const MAX_NOMINATIONS = 2
  const toggleValidator = (address: string) => setSelected(prev => prev.includes(address) ? prev.filter(a => a !== address) : prev.length >= MAX_NOMINATIONS ? prev : [...prev, address])
  const [page, setPage] = useState(0)
  const [copied, setCopied] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [feeEstimate, setFeeEstimate] = useState<string | null>(null)
  const [bondingEras, setBondingEras] = useState<number | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(() => cachedValidators().length === 0)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [update, setUpdate] = useState<StakingUpdate | null>(null)

  useEffect(() => {
    let cancelled = false
    void getBondingDuration().then(v => { if (!cancelled) setBondingEras(v) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let alive = true
    let running = false
    const load = async () => {
      if (running) return
      running = true
      try {
        // No AbortController here: StrictMode runs effects twice and an abort would cancel the first load and block the second.
        // Each source updates the page as soon as it arrives. Nothing waits on the slowest request.
        const pVal = v3Api.validatorList().then(v => {
          if (!alive) return
          if (v?.validators && v.validators.length > 0) {
            setValidators(v.validators)
            try { window.localStorage.setItem(VALIDATOR_CACHE_KEY, JSON.stringify(v.validators)) } catch { /* storage blocked */ }
            setError(false)
          } else if (v?.validators) {
            setError(cachedValidators().length === 0)
          } else {
            setError(cachedValidators().length === 0)
          }
          setLoading(false)
        }).catch(() => { if (alive) { setError(true); setLoading(false) } })
        const pOv = v3Api.stakingOverview().then(o => { if (alive && o) setOverview(o) }).catch(() => { /* keep last good value */ })
        const pSt = v3Api.stats().then(s => { if (alive && s) setStats(s) }).catch(() => { /* keep last good value */ })
        await Promise.allSettled([pVal, pOv, pSt])
      } finally {
        running = false
      }
    }
    void load()
    const timer = window.setInterval(() => { void load() }, 60000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  const pageCount = Math.max(1, Math.ceil(validators.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = validators.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)
  const selectedValidators = useMemo(() => selected.map(a => validators.find(v => v.address === a)).filter((v): v is Validator => !!v), [validators, selected])
  const selectedValidator = selectedValidators[0]

  const freePlanck = chainData.freePlanck
  const balance = freePlanck === null ? null : planckToPot(freePlanck)
  const amountPlanck = useMemo(() => {
    try { return BigInt(decimalToPlanck(amount)) } catch { return null }
  }, [amount])
  const validAmount = amountPlanck !== null && amountPlanck > 0n && freePlanck !== null && amountPlanck <= BigInt(freePlanck)
  const remaining = validAmount && freePlanck !== null && amountPlanck !== null ? planckToPot((BigInt(freePlanck) - amountPlanck).toString()) : null
  const amountInvalid = amount.length > 0 && !validAmount

  const setPercentage = (percentage: number) => {
    if (freePlanck === null) return
    // Keep a reserve for network fee + existential deposit so Max never produces an unsignable tx.
    const RESERVE_PLANCK = 2n * 10n ** 13n // 0.2 POT: covers ED (0.1) + fee (~0.012) + margin; submitAndWatch requires amount+fee+ED <= free
    const free = BigInt(freePlanck)
    const usable = free > RESERVE_PLANCK ? free - RESERVE_PLANCK : 0n
    const planck = usable * BigInt(Math.round(percentage * 100)) / 100n
    setAmount(planckToPot(planck.toString()))
  }

  useEffect(() => {
    let cancelled = false
    setFeeEstimate(null)
    const ids = selectedValidators.map(v => v.address)
    if (!account || ids.length === 0 || !validAmount) return
    const t = setTimeout(() => {
      void estimateStakeFee(account.address, amount, ids, chainData.hasLedger).then(f => { if (!cancelled) setFeeEstimate(f) })
    }, 400)
    return () => { cancelled = true; clearTimeout(t) }
  }, [account, amount, validAmount, selectedValidators, chainData.hasLedger])

  const submit = async () => {
    if (!account || selectedValidators.length === 0 || !validAmount || busy) return
    setBusy(true)
    setUpdate({ status: 'Preparing staking transaction…' })
    try {
      await submitStaking(account, amount, selectedValidators.map(v => v.address), chainData.hasLedger, setUpdate)
      await refreshChainData()
    } catch (error) {
      setUpdate({ status: 'Staking failed', error: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(false)
    }
  }

  const avgCommission = (() => {
    const values = validators.map(v => v.commission).filter((c): c is number => c !== null)
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
  })()

  return <main className="unstake-terminal">
    <div className="unstake-container">
      <div className="unstake-grid">
        <div className="unstake-main-column">
          <section className="unstake-metrics">
            <Metric icon="account_balance_wallet" label="Available Balance" value={balance === null ? 'Unavailable' : `${fmt(balance)} tPOT`} note="Wallet balance" />
            <Metric icon="lock" label="Bonded Balance" value={chainData.bondedPlanck === null ? 'Unavailable' : `${fmt(planckToPot(chainData.bondedPlanck))} tPOT`} note={`Active in ${chainData.nominations.length} validators`} />
            <Metric icon="trending_up" label="Est. APY" value={overview ? `${overview.est_base_apy_pct.toFixed(1)}%` : 'Unavailable'} note={overview?.apy_is_model_estimate ? 'Model estimate' : 'Network estimate'} tone="violet" />
            <Metric icon="hub" label="Network Status" value={stats?.era ? `Era ${stats.era}` : 'Unavailable'} note={`${stats?.active_validator_count ?? '—'} / ${stats?.validators ?? validators.length} active validators`} tone="green" />
          </section>

          <section className="unstake-card">
            <div className="unstake-card-head">
              <div>
                <h2><span className="material-symbols-outlined tone-violet" translate="no">dns</span>Choose a validator</h2>
                <p>Select up to {MAX_NOMINATIONS} validators for your nominations.</p>
              </div>
              
            </div>
            <div className="unstake-table-wrap">
              <table className="unstake-table">
                <thead><tr><th>Validator</th><th>Commission</th><th>Total pool</th><th>Status</th><th>Select</th></tr></thead>
                <tbody>
                  {loading && <tr><td colSpan={5} className="unstake-empty">Loading validator pool…</td></tr>}
                  {!loading && error && <tr><td colSpan={5} className="unstake-empty">Validator data unavailable.</td></tr>}
                  {!loading && !error && pageRows.map((validator, i) => {
                    const index = safePage * PAGE_SIZE + i
                    const isSelected = selected.includes(validator.address)
                    return <tr key={validator.address} onClick={() => toggleValidator(validator.address)} style={{ cursor: 'pointer', background: isSelected ? '#171a45' : undefined }}>
                      <td><div className="unstake-validator"><span className={`unstake-validator-icon icon-${index % 2}`}><span className="material-symbols-outlined" translate="no">{index % 2 ? 'dns' : 'security'}</span></span><div className="validator-addr-row"><small translate="no">{short(validator.address)}</small><button type="button" className="copy-address-btn" aria-label="Copy validator address" title="Copy address" onClick={e => { e.stopPropagation(); void navigator.clipboard?.writeText(validator.address).then(() => { setCopied(validator.address); window.setTimeout(() => setCopied(c => c === validator.address ? null : c), 1400) }).catch(() => {}) }}><span className="material-symbols-outlined" translate="no">{copied === validator.address ? 'check' : 'content_copy'}</span></button></div></div></td>
                      <td className="mono" translate="no">{validator.commission === null ? 'Unavailable' : `${validator.commission.toFixed(1)}%`}</td>
                      <td className="mono" translate="no">{validator.total_stake_pot === null ? 'Unavailable' : `${fmt(validator.total_stake_pot, 2)} tPOT`}</td>
                      <td><span className="unstake-active"><i />{validator.status || 'Active'}</span></td>
                      <td><input type="checkbox" name="validator" checked={isSelected} onChange={() => toggleValidator(validator.address)} onClick={e => e.stopPropagation()} aria-label={`Select ${validator.name}`} /></td>
                    </tr>
                  })}
                </tbody>
              </table>
            </div>
            {pageCount > 1 && <div className="unstake-table-footer" style={{ justifyContent: 'flex-end' }}><span style={{ display: 'flex', gap: 6 }}><button type="button" className="unstake-row-action" aria-label="Previous page" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>‹</button><button type="button" className="unstake-row-action" aria-label="Next page" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>›</button></span></div>}
          </section>

          <section className="unstake-card unstake-schedule">
            <div className="unstake-card-head">
              <div>
                <h2><span className="material-symbols-outlined tone-green" translate="no">verified_user</span>Network Summary</h2>
                <p>Live network figures from the Portaldot V3 API.</p>
              </div>
            </div>
            <div className="unstake-review-box" style={{ margin: 20 }}>
              <Row label="Average commission" value={avgCommission === null ? 'Unavailable' : `${avgCommission.toFixed(1)}%`} />
              <Row label="Total staked (network)" value={overview ? `${fmt(overview.total_staked_pot, 2)} tPOT` : 'Unavailable'} />
              <Row label="Staking ratio" value={stats ? `${stats.staking_ratio_pct.toFixed(1)}%` : 'Unavailable'} />
              <Row label="Reward estimate" value="Unavailable" muted />
            </div>
            <div className="unstake-advisory"><span className="material-symbols-outlined tone-blue" translate="no">info</span><p><strong>Estimates only:</strong> reward and APY figures are model estimates, not verified payouts. Unbonding period is set by the runtime.</p></div>
          </section>
        </div>

        <aside className="unstake-card unstake-form-card">
          <div className="unstake-form-head"><div><h2>Stake amount</h2><p>Review your delegation before signing.</p></div><span className="material-symbols-outlined tone-violet" translate="no">account_balance_wallet</span></div>
          <div className="unstake-available"><span>Available balance</span><b>{balance === null ? 'Unavailable' : `${fmt(balance)} tPOT`}</b></div>
          <div className="unstake-field-label"><label htmlFor="stake-input">Amount to stake</label><button type="button" onClick={() => setPercentage(1)} disabled={freePlanck === null}>Use maximum</button></div>
          <div className="unstake-input-wrap"><input id="stake-input" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.0000" aria-invalid={amountInvalid} /><strong>tPOT</strong></div>
          <div className="unstake-quick">{[.25, .5, .75, 1].map((p, i) => <button key={p} type="button" disabled={freePlanck === null} onClick={() => setPercentage(p)}>{i === 3 ? 'Max' : `${p * 100}%`}</button>)}</div>
          <div className="unstake-review-box">
            <div className="unstake-review-title">Transaction review</div>
            <Row label={`Selected validators (${selectedValidators.length})`} value={selectedValidators.length ? selectedValidators.map(v => v.name || short(v.address)).join(', ') : '—'} />
            <Row label="Avg. commission" value={selectedValidators.length ? `${(selectedValidators.reduce((a, v) => a + (v.commission ?? 0), 0) / selectedValidators.length).toFixed(1)}%` : '—'} />
            <Row label="Stake amount" value={validAmount ? `${fmt(amount)} tPOT` : '—'} />
            <Row label="Equal share per validator (estimate)" value={validAmount && selectedValidators.length > 1 ? `${fmt(Number(amount) / selectedValidators.length, 6)} tPOT each` : validAmount ? `${fmt(amount)} tPOT (single validator)` : '—'} muted />
            <Row label="Balance after tx" value={remaining === null ? '—' : `${fmt(remaining)} tPOT`} />
            <Row label="Network fee" value={feeEstimate ? `~${fmt(feeEstimate, 6)} tPOT` : account && validAmount ? 'Estimating…' : 'Enter amount to estimate'} muted />
            <Row label="Unbonding period" value={bondingEras ? `${bondingEras} eras (~${Math.round(bondingEras * 6 * 600 * 6 / 86400)} days)` : 'Unavailable'} muted />
            <p className="unstake-note" style={{ fontSize: 11 }}>Stake tidak dipecah otomatis. Nominasi ke beberapa validator memberi exposure per era, ditentukan runtime (bisa tidak merata). Angka di atas hanya estimasi rata-rata.</p>
          </div>
          {!account && <div className="unstake-warning">Connect your wallet to view your balance and stake.</div>}
          {account && chainData.status === 'loading' && <div className="unstake-note">Reading the live staking ledger…</div>}
          {account && chainData.status === 'error' && <div className="unstake-warning">{chainData.error || 'Unable to read the staking ledger.'}</div>}
          {account && selectedValidators.length === 0 && <div className="unstake-warning">Select at least one validator to continue.</div>}
          {amountInvalid && <div className="unstake-warning">Enter a valid amount no greater than available balance.</div>}
          <button type="button" className="unstake-primary" disabled={!account || selectedValidators.length === 0 || !validAmount || busy} onClick={() => { void submit() }}>{busy ? 'Waiting for wallet…' : 'Review stake'} <span>→</span></button>
          {update && <div className="unstake-tx-result"><strong>{update.status}</strong>{update.error && <span>{update.error}</span>}{update.txHash && <a href={`${EXPLORER}/#/extrinsic/${update.txHash}`} target="_blank" rel="noreferrer">{update.txHash.slice(0, 12)}…{update.txHash.slice(-8)} · View transaction ↗</a>}</div>}
          <div className="unstake-noncustodial"><span className="material-symbols-outlined" translate="no">verified_user</span><p><strong>Non-custodial staking</strong>Your wallet approves and controls this transaction. Transaction values are verified against live chain data.</p></div>
        </aside>
      </div>
    <TxToast update={update} />
    </div>
  </main>
}
