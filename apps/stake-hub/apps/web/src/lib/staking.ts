import { ApiPromise, WsProvider } from '@polkadot/api'
import { web3FromSource } from '@polkadot/extension-dapp'
import type { PortaldotAccount } from './portaldotWallet'

const PORTALDOT_WS = 'wss://test-node-v3.portaldot.dev'
export const STAKING_POT_DECIMALS = 14
const UNIT = BigInt(10) ** BigInt(STAKING_POT_DECIMALS)

export type StakingUpdate = {
  status: string
  txHash?: string
  blockHash?: string
  error?: string
}

export function decimalToPlanck(value: string): string {
  const text = value.trim()
  if (!/^\d+(?:\.\d{1,14})?$/.test(text)) throw new Error('Enter a valid tPOT amount with up to 14 decimals')
  const [whole, fraction = ''] = text.split('.')
  const planck = BigInt(whole) * UNIT + BigInt((fraction + '0'.repeat(STAKING_POT_DECIMALS)).slice(0, STAKING_POT_DECIMALS))
  if (planck <= BigInt(0)) throw new Error('Amount must be greater than 0 tPOT')
  return planck.toString()
}

export function planckToPot(planck: string): string {
  const value = BigInt(planck)
  const whole = value / UNIT
  const fraction = (value % UNIT).toString().padStart(STAKING_POT_DECIMALS, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole.toString()
}

function asPlanck(value: unknown): bigint {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value))
  const text = String(value ?? '0')
  if (/^0x[0-9a-f]+$/i.test(text)) return BigInt(text)
  return /^\d+$/.test(text) ? BigInt(text) : BigInt(0)
}

function dispatchErrorText(api: ApiPromise, dispatchError: any): string {
  if (!dispatchError?.isModule) return dispatchError?.toString?.() || 'Transaction dispatch failed'
  try {
    const decoded = api.registry.findMetaError(dispatchError.asModule)
    return `${decoded.section}.${decoded.name}: ${decoded.docs.join(' ')}`
  } catch {
    return dispatchError.toString()
  }
}

function unwrapJson(value: unknown): any {
  const candidate = value as { toJSON?: () => unknown }
  return candidate?.toJSON ? candidate.toJSON() : value
}

async function accountFreePlanck(api: ApiPromise, address: string): Promise<bigint> {
  const json: any = unwrapJson(await api.query.system.account(address))
  const free = json?.data?.free ?? json?.free
  if (free === undefined || free === null) throw new Error('Runtime returned no free balance')
  return asPlanck(free)
}

async function existentialDeposit(api: ApiPromise): Promise<bigint> {
  try {
    const value = (api.consts as any).balances?.existentialDeposit
    if (value !== undefined) return asPlanck(value)
  } catch { /* runtime may not expose this constant */ }
  return BigInt(0)
}

const runtimeLedger = async (api: ApiPromise, address: string): Promise<any | null> => {
  const query = (api.query as any).staking?.ledger
  if (typeof query !== 'function') throw new Error('Runtime does not expose Staking.Ledger')
  const raw = await query(address)
  const json = unwrapJson(raw)
  if (raw?.isNone || json === null || json === undefined) return null
  return json
}

const runtimeActiveStake = async (api: ApiPromise, address: string): Promise<bigint> => {
  const ledger = await runtimeLedger(api, address)
  if (!ledger) return BigInt(0)
  return asPlanck(ledger.active)
}

async function runtimeMinBond(api: ApiPromise): Promise<bigint> {
  try {
    const constant = (api.consts as any).staking?.minNominatorBond
    if (constant !== undefined) return asPlanck(constant)
  } catch { /* runtime may not expose this constant */ }
  try {
    const query = (api.query as any).staking?.minNominatorBond
    if (typeof query === 'function') return asPlanck(await query())
  } catch { /* runtime may not expose this storage */ }
  return BigInt(0)
}

async function submitAndWatch(
  account: PortaldotAccount,
  call: any,
  api: ApiPromise,
  onUpdate: (update: StakingUpdate) => void,
  freePlanck: bigint,
  minBondPlanck: bigint,
  existentialDepositPlanck: bigint,
  requiredAmountPlanck: bigint,
): Promise<string> {
  const payment = await call.paymentInfo(account.address)
  const feePlanck = asPlanck(payment.partialFee)
  const requiredReserve = requiredAmountPlanck + feePlanck + existentialDepositPlanck
  if (requiredReserve > freePlanck) throw new Error(`Insufficient free balance for fee/reserve: need ${planckToPot(requiredReserve.toString())} tPOT`)
  if (minBondPlanck > BigInt(0)) onUpdate({ status: `Runtime minimum bond ${planckToPot(minBondPlanck.toString())} tPOT · fee ${payment.partialFee.toHuman()}` })
  else onUpdate({ status: `Ready for approval · estimated fee ${payment.partialFee.toHuman()}` })
  const injector = await web3FromSource(account.meta.source)
  onUpdate({ status: 'Approve the staking transaction in Portaldot Extension' })
  return await new Promise<string>((resolve, reject) => {
    let unsub: (() => void) | undefined
    let settled = false
    const finishError = (error: Error) => { if (settled) return; settled = true; unsub?.(); reject(error) }
    call.signAndSend(account.address, { signer: injector.signer }, (result: any) => {
      if (result.dispatchError) { finishError(new Error(dispatchErrorText(api, result.dispatchError))); return }
      if (result.status.isInBlock) onUpdate({ status: 'Transaction included in block', txHash: result.txHash.toHex(), blockHash: result.status.asInBlock.toHex() })
      if (result.status.isFinalized && !settled) {
        settled = true
        const txHash = result.txHash.toHex()
        onUpdate({ status: 'Transaction finalized successfully', txHash, blockHash: result.status.asFinalized.toHex() })
        unsub?.()
        resolve(txHash)
      }
      if (result.status.isDropped || result.status.isInvalid || result.status.isUsurped) finishError(new Error(`Transaction ${result.status.type.toLowerCase()}`))
    }).then((unsubscribe: () => void) => { unsub = unsubscribe; onUpdate({ status: 'Transaction broadcast to network' }) }).catch((error: unknown) => finishError(error instanceof Error ? error : new Error(String(error))))
  })
}

export async function submitUnstaking(account: PortaldotAccount, amountText: string, onUpdate: (update: StakingUpdate) => void): Promise<string> {
  const api = await ApiPromise.create({ provider: new WsProvider(PORTALDOT_WS) })
  try {
    const amountPlanck = BigInt(decimalToPlanck(amountText))
    const freePlanck = await accountFreePlanck(api, account.address)
    // Unbonding moves already-bonded stake into an unlocking chunk; it does
    // not consume free balance. Only the transaction fee/ED must be covered
    // by the wallet's free balance.
    return await submitAndWatch(account, api.tx.staking.unbond(amountPlanck.toString()), api, onUpdate, freePlanck, BigInt(0), await existentialDeposit(api), BigInt(0))
  } finally { await api.disconnect() }
}

export async function submitNominationChange(account: PortaldotAccount, validators: string[], onUpdate: (update: StakingUpdate) => void): Promise<string> {
  if (!validators.length || validators.length > 16) throw new Error('Select between 1 and 16 validators')
  const api = await ApiPromise.create({ provider: new WsProvider(PORTALDOT_WS) })
  try {
    const freePlanck = await accountFreePlanck(api, account.address)
    return await submitAndWatch(account, api.tx.staking.nominate(validators), api, onUpdate, freePlanck, BigInt(0), await existentialDeposit(api), BigInt(0))
  } finally { await api.disconnect() }
}

export async function submitStaking(account: PortaldotAccount, amountText: string, validators: string[], hasLedger: boolean, onUpdate: (update: StakingUpdate) => void): Promise<string> {
  if (!validators.length) throw new Error('Select at least one validator')
  if (validators.length > 16) throw new Error('Select no more than 16 validators')
  const amountPlanck = BigInt(decimalToPlanck(amountText))
  const api = await ApiPromise.create({ provider: new WsProvider(PORTALDOT_WS) })
  try {
    const freePlanck = await accountFreePlanck(api, account.address)
    const minBondPlanck = await runtimeMinBond(api)
    if (!hasLedger && minBondPlanck > BigInt(0) && amountPlanck < minBondPlanck) throw new Error(`Amount is below runtime minimum bond of ${planckToPot(minBondPlanck.toString())} tPOT`)
    const nominate = api.tx.staking.nominate(validators)
    // Always use the entered amount. A fresh account bonds; an existing ledger
    // adds the requested amount before changing nominations.
    const funding = hasLedger
      ? api.tx.staking.bondExtra(amountPlanck.toString())
      : api.tx.staking.bond(amountPlanck.toString(), { Staked: null })
    const call = api.tx.utility.batchAll([funding, nominate])
    const ed = await existentialDeposit(api)
    return await submitAndWatch(account, call, api, onUpdate, freePlanck, minBondPlanck, ed, amountPlanck)
  } finally { await api.disconnect() }
}

// Read-only fee estimate for the stake batch (bondExtra/bond + nominate). No signing, no submission.
export async function estimateStakeFee(address: string, amountText: string, validators: string[], hasLedger: boolean): Promise<string | null> {
  if (!address || !validators.length) return null
  let amountPlanck: bigint
  try { amountPlanck = BigInt(decimalToPlanck(amountText)) } catch { return null }
  if (amountPlanck <= BigInt(0)) return null
  const api = await ApiPromise.create({ provider: new WsProvider(PORTALDOT_WS) })
  try {
    const funding = hasLedger
      ? api.tx.staking.bondExtra(amountPlanck.toString())
      : api.tx.staking.bond(amountPlanck.toString(), { Staked: null })
    const call = api.tx.utility.batchAll([funding, api.tx.staking.nominate(validators)])
    const payment = await call.paymentInfo(address)
    return planckToPot(payment.partialFee.toString())
  } catch { return null } finally { await api.disconnect() }
}

// Read-only fee estimate for nominate-only change (no bond/bondExtra, amount unchanged).
export async function estimateNominationFee(address: string, validators: string[]): Promise<string | null> {
  if (!address || !validators.length) return null
  const api = await ApiPromise.create({ provider: new WsProvider(PORTALDOT_WS) })
  try {
    const payment = await api.tx.staking.nominate(validators).paymentInfo(address)
    return planckToPot(payment.partialFee.toString())
  } catch { return null } finally { await api.disconnect() }
}

// Unbonding duration in eras, read from the chain constant (not hardcoded).
export async function getBondingDuration(): Promise<number | null> {
  const api = await ApiPromise.create({ provider: new WsProvider(PORTALDOT_WS) })
  try { return (api.consts.staking.bondingDuration as unknown as { toNumber: () => number }).toNumber() } catch { return null } finally { await api.disconnect() }
}
