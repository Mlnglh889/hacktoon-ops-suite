import { test } from 'node:test'
import assert from 'node:assert/strict'
import { incidentSeverityClass, incidentTitle, incidentAddress, evidenceMetadata, rawEvidence } from './incidentView'

test('incident severity maps to stable visual classes', () => {
  assert.match(incidentSeverityClass('critical'), /rose/)
  assert.match(incidentSeverityClass('warning'), /amber/)
  assert.match(incidentSeverityClass('info'), /sky/)
})

test('incident title falls back safely', () => {
  assert.equal(incidentTitle({ title: 'RPC slow' }), 'RPC slow')
  assert.equal(incidentTitle({ kind: 'rpc_slow' }), 'rpc_slow')
  assert.equal(incidentTitle({}), 'Incident')
})

test('address display keeps full value in title and shortens text', () => {
  const address = '5CcDACzSFct1D7Mc5qWKfe8zV3svDNa4xPih4Gn5FKahDJwD'
  const result = incidentAddress(address)
  assert.equal(result.full, address)
  assert.match(result.short, /^5CcD…wD$/)
  assert.equal(incidentAddress(null).short, '—')
})


test('evidence metadata keeps only real preferred fields', () => {
  assert.deepEqual(evidenceMetadata({ endpoint: 'https://rpc', latest_ms: 2480, ignored: 'x' }), [['endpoint', 'https://rpc'], ['latest_ms', '2480']])
})

test('raw evidence is readable JSON', () => {
  assert.match(rawEvidence({ last_block: 10 }), /last_block/)
})
