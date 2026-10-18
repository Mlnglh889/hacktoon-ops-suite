#!/usr/bin/env python3
"""Prepare deterministic heartbeat payload and deployment metadata.

Does not sign or broadcast. Private keys never enter this script.
"""
from __future__ import annotations
import argparse, hashlib, json, time
from pathlib import Path

p=argparse.ArgumentParser()
p.add_argument('--block', required=True, type=int)
p.add_argument('--era', required=True, type=int)
p.add_argument('--validator-count', required=True, type=int)
p.add_argument('--latest-block-hash', required=True)
p.add_argument('--output', default='data/heartbeat-payload.json')
a=p.parse_args()
record={
 'schema':'portaldot-ops-heartbeat/v1',
 'network':'PortaldotV3 Test',
 'chain_id':420420777,
 'block':a.block,
 'era':a.era,
 'validator_count':a.validator_count,
 'latest_block_hash':a.latest_block_hash,
}
canonical=json.dumps(record,sort_keys=True,separators=(',',':')).encode()
record['payload_sha256']='0x'+hashlib.sha256(canonical).hexdigest()
record['prepared_at_unix']=int(time.time())
Path(a.output).parent.mkdir(parents=True,exist_ok=True)
Path(a.output).write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record,indent=2))
print('\nUse bytes32 payload hash for heartbeat():',record['payload_sha256'])
print('No transaction was signed or broadcast.')
