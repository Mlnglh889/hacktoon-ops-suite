# Deployment preparation

1. Compile artifact:

```bash
npm install
node -e "console.log(require('./artifacts/OpsRegistry.json').bytecode.length)"
```

2. Prepare a deterministic payload from the latest collector snapshot:

```bash
python scripts/prepare_heartbeat.py \
  --block 71886 \
  --era 20 \
  --validator-count 2 \
  --latest-block-hash 0x... \
  --output data/heartbeat-payload.json
```

3. Deploy `artifacts/OpsRegistry.json` through a wallet-controlled EVM signer or Portaldot wallet flow.
4. Call `heartbeat(bytes32 payloadHash)` with the prepared `payload_sha256`.
5. Record contract address, tx hash, receipt status, block, and explorer URL.

Do not put private keys or seed phrases in this repository, chat, shell history, or `.env`.
No transaction is considered complete until its receipt status and explorer URL are verified.
沿
## Current blocker

The repo contains source, compiled artifact, and deterministic payload preparation. Signing and broadcast require the wallet UI or an explicit signer controlled by the user.

No deployment claim is valid before receipt verification.

## Evidence file format

```json
{
  "network": "PortaldotV3 Test",
  "chain_id": 420420777,
  "contract_address": "0x...",
  "deploy_tx_hash": "0x...",
  "heartbeat_tx_hash": "0x...",
  "receipt_status": 1,
  "block_number": 0,
  "explorer_url": "https://node-console.portaldot.dev/tx/0x..."
}
```

