import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verifyNominationSet, verifyBondDelta } from './nominationVerify'

test('exact match in any order is ok', () => {
  const r = verifyNominationSet(['A', 'B'], ['B', 'A'])
  assert.equal(r.ok, true)
  assert.deepEqual(r.missing, [])
  assert.deepEqual(r.extra, [])
})

test('requested validator missing on chain is reported', () => {
  const r = verifyNominationSet(['A', 'B'], ['A'])
  assert.equal(r.ok, false)
  assert.deepEqual(r.missing, ['B'])
  assert.deepEqual(r.extra, [])
})

test('extra on-chain nomination is reported (nominate replaces the whole list)', () => {
  const r = verifyNominationSet(['A'], ['A', 'C'])
  assert.equal(r.ok, false)
  assert.deepEqual(r.extra, ['C'])
})

test('empty on-chain nominations with a request fails', () => {
  const r = verifyNominationSet(['A'], [])
  assert.equal(r.ok, false)
  assert.deepEqual(r.missing, ['A'])
  assert.equal(r.onChainCount, 0)
})

test('duplicates are collapsed before comparing', () => {
  const r = verifyNominationSet(['A', 'A'], ['A'])
  assert.equal(r.ok, true)
  assert.equal(r.requestedCount, 1)
})

test('bond delta exactly equal to requested is ok', () => {
  const r = verifyBondDelta('25006892609879630', '25206892609879630', '200000000000000')
  assert.equal(r.ok, true)
  assert.equal(r.deltaPlanck, '200000000000000')
})

test('bond delta below requested (tx partially applied) fails', () => {
  const r = verifyBondDelta('100', '150', '200')
  assert.equal(r.ok, false)
  assert.equal(r.deltaPlanck, '50')
})

test('no change after finalization fails', () => {
  const r = verifyBondDelta('100', '100', '200')
  assert.equal(r.ok, false)
})
