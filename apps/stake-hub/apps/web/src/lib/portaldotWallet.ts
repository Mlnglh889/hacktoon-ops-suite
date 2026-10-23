import { web3Accounts, web3Enable } from '@polkadot/extension-dapp'
import type { InjectedAccountWithMeta } from '@polkadot/extension-inject/types'
import type { InjectedExtension } from '@polkadot/extension-inject/types'

const APP_NAME = 'Portaldot Stake Hub'
export const PORTALDOT_EXTENSION_NETWORK = 'PortaldotV3 Testnet'
export const PORTALDOT_EXTENSION_CHAIN = 'wss://test-node-v3.portaldot.dev'

export async function connectPortaldotExtension(): Promise<InjectedAccountWithMeta[]> {
  const extensions = await web3Enable(APP_NAME)
  if (!extensions.length) throw new Error('Install and unlock Portaldot Extension, then retry')
  const accounts = await web3Accounts()
  if (!accounts.length) throw new Error(
    `No account shared with this site yet. 1) Open Portaldot Extension. 2) Approve ${window.location.origin}. 3) Click Connect Wallet again. ` +
    'If no approval popup appears, the site may be blocked: remove it from the Blocked/Denied list in the extension, then retry.'
  )
  return accounts
}

export async function enablePortaldotExtension(): Promise<InjectedExtension> {
  const extensions = await web3Enable(APP_NAME)
  const extension = extensions.find((item) => item.name?.toLowerCase().includes('portal')) || extensions[0]
  if (!extension) throw new Error('No Portaldot-compatible wallet extension was found')
  return extension
}

export async function inspectPortaldotExtension() {
  const extensions = await web3Enable(APP_NAME)
  const extension = extensions.find((item) => item.name?.toLowerCase().includes('portal')) || extensions[0]
  if (!extension) throw new Error('No Portaldot-compatible wallet extension was found')
  const [metadata, providers] = await Promise.all([
    extension.metadata?.get?.().catch(() => null),
    extension.provider?.listProviders?.().catch(() => null),
  ])
  return { extension, metadata, providers }
}

export function shortSs58(address: string) { return `${address.slice(0, 8)}…${address.slice(-6)}` }
export function isPortaldotAddress(address: string) { return /^5[1-9A-HJ-NP-Za-km-z]{47,}$/.test(address) }
export type PortaldotAccount = InjectedAccountWithMeta
void isPortaldotAddress
void shortSs58
void PORTALDOT_EXTENSION_NETWORK
void PORTALDOT_EXTENSION_CHAIN
void enablePortaldotExtension
void connectPortaldotExtension
void web3Accounts
void web3Enable
void (null as unknown as InjectedExtension)
export type { InjectedExtension }

export const EVM_CHAIN_ID = '0x190f1ca9'
export const EVM_CHAIN_PARAMS = {
  chainId: EVM_CHAIN_ID,
  chainName: PORTALDOT_EXTENSION_NETWORK,
  nativeCurrency: { name: 'POT', symbol: 'POT', decimals: 14 },
  rpcUrls: ['https://test-evm-rpc-v3.portaldot.dev'],
  blockExplorerUrls: ['https://node-console.portaldot.dev'],
}
