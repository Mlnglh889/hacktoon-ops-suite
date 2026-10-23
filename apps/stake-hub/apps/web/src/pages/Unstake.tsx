import TxToast from '../components/TxToast'
import { useEffect, useMemo, useState } from 'react'
import { useWallet } from '../lib/walletContext'
import { v3Api } from '../lib/v3Api'
import { decimalToPlanck, planckToPot, submitUnstaking, submitNominationChange, estimateNominationFee, getBondingDuration, type StakingUpdate } from '../lib/staking'

const EXPLORER = 'https://node-console.portaldot.dev'
const fmt = (value: string | number | null, digits = 4) => value === null ? 'Unavailable' : Number(value).toLocaleString('en-US', { maximumFractionDigits: digits })
const short = (address: string) => `${address.slice(0, 8)}…${address.slice(-6)}`

function Metric({ icon, label, value, note, tone = 'normal' }: { icon: string; label: string; value: string; note: string; tone?: 'normal' | 'green' | 'violet' | 'blue' }) {
  return <div className="unstake-metric"><div className="unstake-metric-top"><span>{label}</span><span className={`material-symbols-outlined tone-${tone}`} translate="no">{icon}</span></div><div className={`unstake-metric-value tone-${tone}`} translate="no">{value}</div><div className="unstake-metric-note">{note}</div></div>
}

function Row({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return <div className="unstake-review-row"><span>{label}</span><b className={muted ? 'muted' : ''} translate="no">{value}</b></div>
}

export default function Unstake() {
  const { account, chainData, refreshChainData } = useWallet()
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [bondingEras, setBondingEras] = useState<number | null>(null)
  useEffect(() => { let c = false; void getBondingDuration().then(v => { if (!c) setBondingEras(v) }); return () => { c = true } }, [])
  const [update, setUpdate] = useState<StakingUpdate | null>(null)
  const [commissionByAddress, setCommissionByAddress] = useState<Record<string, number>>({})
  const [validatorOptions, setValidatorOptions] = useState<{ address: string; name: string }[]>([])
  const [newNominations, setNewNominations] = useState<string[]>([])
  const [nominationBusy, setNominationBusy] = useState(false)
  const [nominationUpdate, setNominationUpdate] = useState<StakingUpdate | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [nominationFee, setNominationFee] = useState<string | null>(null)
  const nominationKey = newNominations.join(',')
  useEffect(() => {
    let alive = true
    setNominationFee(null)
    if (!account || newNominations.length === 0) return () => { alive = false }
    void estimateNominationFee(account.address, newNominations).then(f => { if (alive) setNominationFee(f) })
    return () => { alive = false }
  }, [account, nominationKey])
  const toggleNomination = (address: string) => {
    setNewNominations(current => current.includes(address) ? current.filter(a => a !== address) : current.length >= 2 ? current : [...current, address])
  }
  const currentNominations = chainData.nominations
  const nominationsChanged = newNominations.length > 0 && (newNominations.length !== currentNominations.length || newNominations.some(a => !currentNominations.includes(a)))
  const submitNominations = async () => {
    if (!account || !nominationsChanged || nominationBusy) return
    setNominationBusy(true)
    setNominationUpdate({ status: 'Preparing nomination change…' })
    try {
      await submitNominationChange(account, newNominations, setNominationUpdate)
      await refreshChainData()
    } catch (error) {
      setNominationUpdate({ status: 'Nomination change failed', error: error instanceof Error ? error.message : String(error) })
    } finally {
      setNominationBusy(false)
    }
  }
  useEffect(() => {
    let alive = true
    void v3Api.validatorList().then(v => {
      if (!alive || !v?.validators) return
      const map: Record<string, number> = {}
      for (const val of v.validators) if (val.commission !== null) map[val.address] = val.commission
      setCommissionByAddress(map)
      setValidatorOptions(v.validators.map((val: any) => ({ address: val.address, name: val.name || short(val.address) })))
    }).catch(() => { /* keep empty map */ })
    return () => { alive = false }
  }, [])

  const activePlanck = chainData.activeStakePlanck
  const active = activePlanck === null ? null : planckToPot(activePlanck)
  const bonded = chainData.bondedPlanck === null ? null : planckToPot(chainData.bondedPlanck)
  const unlocking = planckToPot(chainData.unlockingPlanck)
  const amountPlanck = useMemo(() => {
    try { return BigInt(decimalToPlanck(amount)) } catch { return null }
  }, [amount])
  const valid = Boolean(account) && chainData.status === 'ready' && activePlanck !== null && amountPlanck !== null && amountPlanck > 0n && amountPlanck <= BigInt(activePlanck)
  const amountInvalid = amount.length > 0 && !valid && chainData.status === 'ready'
  const remaining = valid && activePlanck && amountPlanck !== null ? planckToPot((BigInt(activePlanck) - amountPlanck).toString()) : null

  const setPercentage = (percentage: number) => {
    if (activePlanck === null) return
    const planck = BigInt(activePlanck) * BigInt(Math.round(percentage * 100)) / 100n
    setAmount(planckToPot(planck.toString()))
  }

  const submit = async () => {
    if (!account || !valid || busy) return
    setBusy(true)
    setUpdate({ status: 'Preparing unstaking transaction…' })
    try {
      await submitUnstaking(account, amount, setUpdate)
      await refreshChainData()
    } catch (error) {
      setUpdate({ status: 'Unstaking failed', error: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(false)
    }
  }

  return <main className="unstake-terminal">
    <div className="unstake-container">
      <div className="unstake-grid">
        <div className="unstake-main-column">
          <section className="unstake-metrics">
            <Metric icon="account_balance" label="Bonded Balance" value={bonded === null ? 'Unavailable' : `${fmt(bonded)} tPOT`} note="Total locked stake" />
            <Metric icon="bolt" label="Active Stake" value={active === null ? 'Unavailable' : `${fmt(active)} tPOT`} note="Maximum available to unstake" tone="green" />
            <Metric icon="hourglass_top" label="Currently Unlocking" value={`${fmt(unlocking)} tPOT`} note="In cooldown period" tone="violet" />
            <Metric icon="pie_chart" label="Unlocking Chunks" value={String(chainData.unlockingCount)} note="Runtime ledger chunks" tone="blue" />
          </section>
          <section className="unstake-card">
            <div className="unstake-card-head"><div><h2><span className="material-symbols-outlined tone-violet" translate="no">checklist</span>Active Delegations</h2><p>Current nominations from the connected wallet.</p></div><span className="unstake-card-meta">{chainData.nominations.length} nominations</span></div>
            <div className="unstake-table-wrap"><table className="unstake-table"><thead><tr><th>Validator</th><th>Active Stake</th><th>Commission</th><th>Status</th><th>Action</th></tr></thead><tbody>
              {!account && <tr><td colSpan={5} className="unstake-empty">Connect your wallet to load active nominations.</td></tr>}
              {account && chainData.status === 'loading' && <tr><td colSpan={5} className="unstake-empty">Reading the live staking ledger…</td></tr>}
              {account && chainData.status === 'error' && <tr><td colSpan={5} className="unstake-empty">{chainData.error || 'Unable to read the staking ledger.'}</td></tr>}
              {account && chainData.status !== 'loading' && chainData.status !== 'error' && chainData.nominations.length === 0 && <tr><td colSpan={5} className="unstake-empty">No wallet nominations were found.</td></tr>}
              {account && chainData.status === 'ready' && chainData.nominations.map((address, index) => <tr key={address}>
                <td><div className="unstake-validator"><span className={`unstake-validator-icon icon-${index % 2}`}><span className="material-symbols-outlined" translate="no">{index % 2 ? 'dns' : 'security'}</span></span><div><strong>Validator {String(index + 1).padStart(2, '0')}</strong><small>{short(address)}</small></div></div></td>
                <td className="mono" translate="no">Not reported by chain</td><td className="mono" translate="no">{commissionByAddress[address] === undefined ? '—' : `${commissionByAddress[address].toFixed(1)}%`}</td><td><span className="unstake-active"><i />Nominated</span></td><td><button type="button" className="unstake-row-action" onClick={() => setPercentage(1)}>Use max</button></td>
              </tr>)}
            </tbody></table></div>
            <div className="unstake-table-footer"><span>Stake allocation is wallet-scoped.</span><span>Unbonding duration: {bondingEras ? `${bondingEras} eras (~${Math.round(bondingEras * 6 * 600 * 6 / 86400)} days)` : 'Unavailable'}</span></div>
          </section>

          <section className="unstake-card">
            <div className="unstake-card-head"><div><h2><span className="material-symbols-outlined tone-violet" translate="no">swap_horiz</span>Setting Validators</h2><p>Choose the full list of validators you want to support. Amount staked does not change and nothing enters unbonding.</p></div></div>
            <div className="unstake-table-wrap"><table className="unstake-table"><thead><tr><th>Select</th><th>Validator</th><th>Commission</th></tr></thead><tbody>
              {validatorOptions.map(opt => {
                const checked = newNominations.includes(opt.address)
                const comm = commissionByAddress[opt.address]
                return <tr key={opt.address} onClick={() => toggleNomination(opt.address)} style={{ cursor: 'pointer', background: checked ? '#171a45' : undefined }}>
                  <td><input type="checkbox" checked={checked} onChange={() => toggleNomination(opt.address)} onClick={e => e.stopPropagation()} aria-label={`Select ${opt.name}`} /></td>
                  <td><div className="validator-addr-row"><strong translate="no">{short(opt.address)}</strong><button type="button" className="copy-address-btn" aria-label="Copy validator address" title="Copy address" onClick={e => { e.stopPropagation(); void navigator.clipboard?.writeText(opt.address).then(() => { setCopied(opt.address); window.setTimeout(() => setCopied(c => c === opt.address ? null : c), 1400) }).catch(() => {}) }}><span className="material-symbols-outlined" translate="no">{copied === opt.address ? 'check' : 'content_copy'}</span></button></div></td>
                  <td className="mono" translate="no">{comm === undefined ? '—' : `${comm.toFixed(1)}%`}</td>
                </tr>
              })}
            </tbody></table></div>
            <div className="unstake-table-footer"><span>Current: {currentNominations.length ? currentNominations.map(short).join(', ') : 'none'}</span><span>Pick 1 or 2</span></div>
            {nominationsChanged ? null : <div className="unstake-note">Select a different set of validators to enable the change.</div>}
            <div className="unstake-review-box"><div className="unstake-review-title">Transaction review</div>
              <Row label="Current validators" value={currentNominations.length ? currentNominations.map(short).join(', ') : 'none'} />
              <Row label="Validators after tx" value={newNominations.length ? newNominations.map(short).join(', ') : '—'} />
              <Row label="Amount staked" value={`${bonded === null ? '—' : fmt(bonded)} tPOT (unchanged)`} />
              <Row label="Network fee" value={nominationFee ? `${fmt(nominationFee)} tPOT` : (newNominations.length ? 'Calculating…' : '—')} />
              <Row label="When it applies" value="Next era (about 6 hours)" muted />
            </div>
            <button type="button" className="unstake-primary" disabled={!account || !nominationsChanged || nominationBusy || chainData.status !== 'ready'} onClick={() => { void submitNominations() }}>{nominationBusy ? 'Waiting for wallet…' : 'Set validators'} <span>→</span></button>
            {nominationUpdate && <div className="unstake-tx-result"><strong>{nominationUpdate.status}</strong>{nominationUpdate.error && <span>{nominationUpdate.error}</span>}{nominationUpdate.txHash && <a href={`${EXPLORER}/#/extrinsic/${nominationUpdate.txHash}`} target="_blank" rel="noreferrer">{nominationUpdate.txHash.slice(0, 12)}…{nominationUpdate.txHash.slice(-8)} · View transaction ↗</a>}</div>}
          </section>

          <section className="unstake-card unstake-schedule">
            <div className="unstake-card-head"><div><h2><span className="material-symbols-outlined tone-blue" translate="no">lock_clock</span>Unlocking Schedule</h2><p>Funds already moved out of active stake.</p></div><span className="unstake-card-meta">{chainData.unlockingCount} chunk(s)</span></div>
            {chainData.unlockingCount === 0 ? <div className="unstake-empty schedule-empty">No funds are currently unlocking.</div> : <div className="unstake-unlocking-list">{chainData.unlockingChunks.map((chunk, idx) => {
                const chunkTpot = planckToPot(chunk.planck)
                const eraNow = chainData.currentEra
                const eraLeft = eraNow === null ? null : Math.max(0, chunk.era - eraNow)
                const daysLeft = eraLeft === null ? null : Math.round(eraLeft * 6 * 600 * 6 / 86400)
                const released = eraLeft === 0
                return <div key={`${chunk.era}-${idx}`} className="unstake-unlocking-item"><span className="material-symbols-outlined tone-violet" translate="no">hourglass_empty</span><div><strong>{fmt(chunkTpot)} tPOT</strong><small>Release era {chunk.era}{eraNow === null ? '' : ` · current era ${eraNow}`}</small></div><em>{released ? 'Releasable' : (eraLeft === null ? 'Pending' : `${eraLeft} eras (~${daysLeft} days)`)}</em></div>
              })}</div>}
            <div className="unstake-advisory"><span className="material-symbols-outlined tone-blue" translate="no">info</span><p><strong>Substrate security note:</strong> Unbonded tokens stop earning staking rewards after transaction inclusion and remain locked until the runtime release condition is met.</p></div>
          </section>
        </div>

        <aside className="unstake-card unstake-form-card">
          <div className="unstake-form-head"><div><h2>Unbond Capital</h2><p>Move active stake into the unbonding queue.</p></div><span className="material-symbols-outlined tone-violet" translate="no">lock_open</span></div>
          <div className="unstake-available"><span>Active stake available</span><b>{active === null ? 'Unavailable' : `${fmt(active)} tPOT`}</b></div>
          <div className="unstake-field-label"><label htmlFor="unstake-input">Amount to unstake</label><button type="button" onClick={() => setPercentage(1)} disabled={activePlanck === null}>Use maximum</button></div>
          <div className="unstake-input-wrap"><input id="unstake-input" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.0000" aria-invalid={amountInvalid} /><strong>tPOT</strong></div>
          <div className="unstake-quick">{[.25, .5, .75, 1].map((percentage, index) => <button key={percentage} type="button" disabled={activePlanck === null} onClick={() => setPercentage(percentage)}>{index === 3 ? 'Max' : `${percentage * 100}%`}</button>)}</div>
          <div className="unstake-review-box"><div className="unstake-review-title">Transaction review</div><Row label="Unstake amount" value={valid ? `${fmt(amount)} tPOT` : '—'} /><Row label="Active stake remaining" value={remaining === null ? '—' : `${fmt(remaining)} tPOT`} /><Row label="Unlocking after tx" value={valid ? `${fmt(Number(unlocking) + Number(amount))} tPOT` : '—'} /><Row label="Network fee" value="Calculated before signing" muted /><Row label="Unbonding period" value="Unavailable" muted /></div>
          {!account && <div className="unstake-warning">Connect the wallet used on Stake first.</div>}
          {account && chainData.status === 'loading' && <div className="unstake-note">Reading the live staking ledger…</div>}
          {account && chainData.status === 'error' && <div className="unstake-warning">{chainData.error || 'Unable to read the staking ledger.'}</div>}
          {account && chainData.status === 'ready' && active === null && <div className="unstake-warning">Active stake is unavailable. Unstaking is disabled.</div>}
          {amountInvalid && <div className="unstake-warning">Enter a valid amount no greater than active stake.</div>}
          <button type="button" className="unstake-primary" disabled={!valid || busy} onClick={() => { void submit() }}>{busy ? 'Waiting for wallet…' : 'Review unstake'} <span>→</span></button>
          {update && <div className="unstake-tx-result"><strong>{update.status}</strong>{update.error && <span>{update.error}</span>}{update.txHash && <a href={`${EXPLORER}/#/extrinsic/${update.txHash}`} target="_blank" rel="noreferrer">{update.txHash.slice(0, 12)}…{update.txHash.slice(-8)} · View transaction ↗</a>}</div>}
          <div className="unstake-noncustodial"><span className="material-symbols-outlined" translate="no">verified_user</span><p><strong>Non-custodial unstaking</strong>Your wallet approves and controls this transaction. Funds enter the runtime unbonding queue and are not immediately transferable.</p></div>
        </aside>
      </div>
    <TxToast update={update} />
    <TxToast update={nominationUpdate} />
    </div>
  </main>
}
