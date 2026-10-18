# OpsRegistry

Minimal Solidity contract for Portaldot V3 EVM heartbeat evidence.

## Deploy

Compile with Solidity `^0.8.20`, deploy from the explicitly controlled wallet, then call:

```solidity
heartbeat(bytes32 payloadHash)
```

Record contract address, tx hash, receipt status, block number, and explorer URL in the project evidence file.

No private key belongs in this repository or chat. Deployment remains a user-controlled signing action.
