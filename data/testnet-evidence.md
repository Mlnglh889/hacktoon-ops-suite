# Testnet Evidence — Portaldot V3

Network: PortaldotV3 Test (spec 3002), Substrate `wss://test-node-v3.portaldot.dev`
Explorer: `https://node-console.portaldot.dev/#/extrinsic/<txHash>`
Token: tPOT (14 decimals)

Each entry was read back from chain (block and events), not taken from a UI message.

| # | Action | Amount | Block | txHash | Check |
|---|---|---|---|---|---|
| 1 | Stake (script) | 1 tPOT | 136839 | 0x36f107f6f4fbc703ed4305c5490b969d99240d26ff905cbd9d0db93cdf96440a | block + events |
| 2 | Unstake (script) | 1 tPOT | 136994 | 0x0d4dc1472bdbabffa0027a0277ef37fe41dd9a581f52961631eea70e5db458ba | block + events |
| 3 | Stake (web UI) | 1 tPOT | 137079 | 0x8a27c31807a1a6d4393f71090cac7a9471dae90124b58270889cfaa5d3b65db5 | block + events |
| 4 | Nominate 2 validators | — | 141087 | 0x8a39ff26896508ed7c7741e14c686923c5b27df0947e0a8e663ced6b33c66e17 | ExtrinsicSuccess, 2 targets read back |

Finalized hash for #4: 0x2f1e3afa1d73eae1b031480f204bc9def58fec60dbe04b72878643d6221b83b4

Known limits: selected validators have zero exposure in the last 40 eras, so no real reward split is measurable yet.
