import { ApiPromise, WsProvider } from '@polkadot/api'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { connectPortaldotExtension, shortSs58, type PortaldotAccount } from './portaldotWallet'

const PORTALDOT_WS = 'wss://test-node-v3.portaldot.dev'
export const POT_DECIMALS = 14

export type WalletChainData = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  freePlanck: string | null
  freePot: number | null
  bondedPlanck: string | null
  bondedPot: number | null
  activeStakePlanck: string | null
  activeStakePot: number | null
  rewardPlanck: string | null
  rewardPot: number | null
  unlockingPlanck: string
  unlockingPot: number
  unlockingCount: number
  unlockingChunks: { planck: string; era: number }[]
  currentEra: number | null
  nominations: string[]
  hasLedger: boolean
  hasNominations: boolean
  error: string | null
  refreshedAt: number | null
}

type WalletContextValue = {
  account: PortaldotAccount | null
  accounts: PortaldotAccount[]
  connect: () => Promise<void>
  selectAccount: (address: string) => void
  disconnect: () => void
  shortAddress: string | null
  message: string
  chainData: WalletChainData
  refreshChainData: () => Promise<void>
}

const EMPTY_CHAIN_DATA: WalletChainData = {
  status: 'idle', freePlanck: null, freePot: null, bondedPlanck: null,
  bondedPot: null, activeStakePlanck: null, activeStakePot: null, rewardPlanck: null, rewardPot: null, unlockingPlanck: '0', unlockingPot: 0, unlockingCount: 0, unlockingChunks: [], currentEra: null,
  nominations: [], hasLedger: false, hasNominations: false, error: null, refreshedAt: null,
}

const toPlanck = (value: unknown): string => {
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value).toString()
  if (typeof value === 'string') {
    if (/^\d+$/.test(value)) return value
    if (/^0x[0-9a-f]+$/i.test(value)) return BigInt(value).toString()
  }
  if (value && typeof value === 'object' && 'toString' in value) {
    const text = String(value)
    if (/^\d+$/.test(text)) return text
    if (/^0x[0-9a-f]+$/i.test(text)) return BigInt(text).toString()
  }
  return '0'
}

const toPot = (planck: string) => {
  const value = BigInt(planck)
  const whole = value / 10n ** BigInt(POT_DECIMALS)
  const fraction = (value % (10n ** BigInt(POT_DECIMALS))).toString().padStart(POT_DECIMALS, '0').replace(/0+$/, '')
  return Number(fraction ? `${whole}.${fraction}` : whole.toString())
}

function optionJson(value: unknown): unknown {
  const candidate = value as { isNone?: boolean; isSome?: boolean; unwrap?: () => unknown }
  if (candidate?.isNone) return null
  if (candidate?.isSome && candidate.unwrap) return candidate.unwrap()
  return value
}

function jsonValue(value: unknown): any {
  const candidate = value as { toJSON?: () => unknown }
  return candidate?.toJSON ? candidate.toJSON() : value
}

const WalletContext = createContext<WalletContextValue | null>(null)

export function WalletProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<PortaldotAccount | null>(null)
  const [accounts, setAccounts] = useState<PortaldotAccount[]>([])
  const [message, setMessage] = useState('')
  const [chainData, setChainData] = useState<WalletChainData>(EMPTY_CHAIN_DATA)

  const connect = async () => {
    try {
      const connectedAccounts = await connectPortaldotExtension()
      setAccounts(connectedAccounts)
      // Never silently choose between multiple signer accounts. The selected
      // account must be explicit because balance and signing are account-scoped.
      if (connectedAccounts.length === 1) setAccount(connectedAccounts[0])
      else if (!connectedAccounts.some((candidate) => candidate.address === account?.address)) setAccount(null)
      setMessage(connectedAccounts.length > 1 ? 'Extension connected; select the funded account' : 'Portaldot extension connected')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Wallet connection failed')
    }
  }

  const disconnect = () => {
    // Forget the selected account and chain data for this site only.
    // The browser extension keeps its own permissions and is not touched.
    setAccount(null)
    setAccounts([])
    setChainData(EMPTY_CHAIN_DATA)
    setMessage('Logged out')
  }

  const selectAccount = (address: string) => {
    const selected = accounts.find((candidate) => candidate.address === address)
    if (selected) {
      setAccount(selected)
      setMessage(`Selected ${shortSs58(selected.address)}`)
    }
  }

  const refreshChainData = async () => {
    if (!account) { setChainData(EMPTY_CHAIN_DATA); return }
    setChainData((current) => (current.status === 'ready' ? current : { ...current, status: 'loading', error: null }))
    let api: ApiPromise | null = null
    try {
      api = await ApiPromise.create({ provider: new WsProvider(PORTALDOT_WS) })
      // Balance is authoritative and must remain available even when this
      // runtime does not expose all staking storage items.
      const accountInfo = await api.query.system.account(account.address)
      const accountJson = jsonValue(accountInfo) as { data?: { free?: unknown } }
      const freePlanck = toPlanck(accountJson?.data?.free)
      let ledgerValue: any = null
      let nominationsValue: any = null
      let stakingError: string | null = null
      try {
        const ledgerQuery = (api.query as any).staking?.ledger
        if (typeof ledgerQuery !== 'function') throw new Error('Runtime does not expose Staking.Ledger')
        ledgerValue = jsonValue(optionJson(await ledgerQuery(account.address)))
      } catch (error) {
        stakingError = `Unable to read staking ledger: ${error instanceof Error ? error.message : String(error)}`
      }
      let currentEraValue: number | null = null
      try {
        const eraQuery = (api.query as any).staking?.currentEra
        if (typeof eraQuery === 'function') {
          const eraOpt = await eraQuery()
          const eraJson = jsonValue(optionJson(eraOpt))
          const n = Number(eraJson)
          currentEraValue = Number.isFinite(n) ? n : null
        }
      } catch { currentEraValue = null }
      const unlocking = Array.isArray(ledgerValue?.unlocking) ? ledgerValue.unlocking : []
      const unlockingPlanck = unlocking.reduce((sum: bigint, chunk: any) => (sum + BigInt(toPlanck(chunk?.value))), BigInt(0)).toString()
      try {
        const nominatorsQuery = (api.query as any).staking?.nominators
        if (typeof nominatorsQuery === 'function') nominationsValue = jsonValue(optionJson(await nominatorsQuery(account.address)))
      } catch (error) {
        stakingError = stakingError || `Unable to read nominations: ${error instanceof Error ? error.message : String(error)}`
      }
      const nominations = Array.isArray(nominationsValue?.targets) ? nominationsValue.targets.map(String) : []
      const bondedPlanck = ledgerValue ? toPlanck(ledgerValue.total ?? ledgerValue.active) : null
      const activeStakePlanck = ledgerValue ? toPlanck(ledgerValue.active) : null
      const rewardPlanck = ledgerValue && (ledgerValue.reward !== undefined || ledgerValue.claimedRewards !== undefined) ? toPlanck(ledgerValue.reward ?? ledgerValue.claimedRewards) : null
      setChainData({
        status: 'ready', freePlanck, freePot: toPot(freePlanck), bondedPlanck,
        bondedPot: bondedPlanck === null ? null : toPot(bondedPlanck), activeStakePlanck,
        activeStakePot: activeStakePlanck === null ? null : toPot(activeStakePlanck),
        rewardPlanck, rewardPot: rewardPlanck === null ? null : toPot(rewardPlanck), unlockingPlanck,
        unlockingPot: toPot(unlockingPlanck), unlockingCount: unlocking.length,
        unlockingChunks: unlocking.map((chunk: any) => ({ planck: toPlanck(chunk?.value).toString(), era: Number(chunk?.era ?? 0) })), currentEra: currentEraValue,
        nominations, hasLedger: ledgerValue !== null, hasNominations: nominations.length > 0,
        error: stakingError, refreshedAt: Date.now(),
      })
    } catch (error) {
      setChainData((current) => (current.status === 'ready' ? current : { ...current, status: 'error', error: error instanceof Error ? error.message : 'Unable to read V3 wallet state' }))
    } finally { if (api) await api.disconnect() }
  }

  useEffect(() => {
    if (!account) { setChainData(EMPTY_CHAIN_DATA); return undefined }
    void refreshChainData()
    const timer = window.setInterval(() => { void refreshChainData() }, 60000)
    return () => window.clearInterval(timer)
  }, [account])

  const value = useMemo(() => ({ account, accounts, connect, selectAccount, disconnect, shortAddress: account ? shortSs58(account.address) : null, message, chainData, refreshChainData }), [account, accounts, message, chainData])
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet() {
  const value = useContext(WalletContext)
  if (!value) throw new Error('useWallet must be used inside WalletProvider')
  return value
}

void POT_DECIMALS
