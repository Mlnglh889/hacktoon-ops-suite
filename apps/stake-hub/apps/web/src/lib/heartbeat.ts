import { ApiPromise, WsProvider } from '@polkadot/api'
import { web3FromSource } from '@polkadot/extension-dapp'
import type { PortaldotAccount } from './portaldotWallet'

export const HEARTBEAT_PAYLOAD_HASH = '0x080f865021bd2d6cb9b2885a9a78ae6baf257652e00ffc39128a619d6b30a404'
export const PORTALDOT_WS = 'wss://test-node-v3.portaldot.dev'

export type BroadcastUpdate = { status: string; txHash?: string; blockHash?: string; error?: string }

export async function broadcastSubstrateHeartbeat(account: PortaldotAccount, onUpdate: (update: BroadcastUpdate) => void): Promise<void> {
  const extension = await web3FromSource(account.meta.source)
  const api = await ApiPromise.create({ provider: new WsProvider(PORTALDOT_WS) })
  try {
    const signer = extension.signer
    const payload = HEARTBEAT_PAYLOAD_HASH.replace(/^0x/, '').padStart(64, '0')
    const call = api.tx.system.remarkWithEvent(`0x${payload}`)
    onUpdate({ status: 'Please approve transaction in Portaldot Extension' })
    await new Promise<void>((resolve, reject) => {
      let unsub: (() => void) | undefined
      call.signAndSend(account.address, { signer }, (result) => {
        if (result.dispatchError) {
          reject(new Error(result.dispatchError.toString()))
          return
        }
        if (result.status.isInBlock || result.status.isFinalized) {
          const blockHash = result.status.isFinalized ? result.status.asFinalized.toHex() : result.status.asInBlock.toHex()
          const txHash = call.hash.toHex()
          onUpdate({ status: result.status.isFinalized ? 'Finalized' : 'Included in block', txHash, blockHash })
          if (result.status.isFinalized) {
            unsub?.()
            resolve()
          }
        }
      }).then((unsubscribe) => { unsub = unsubscribe }).catch(reject)
    })
  } finally {
    await api.disconnect()
  }
}
