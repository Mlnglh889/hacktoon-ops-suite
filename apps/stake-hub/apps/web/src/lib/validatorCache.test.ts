import { test } from 'node:test'
import assert from 'node:assert/strict'

// validatorCache uses window.localStorage; provide a minimal in-memory stand-in for node.
const store = new Map<string, string>()
;(globalThis as any).window = {
  localStorage: {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)) },
    removeItem: (k: string) => { store.delete(k) },
  },
}

const { readValidatorCache, writeValidatorCache } = await import('./validatorCache.ts')
const KEY = 'portaldot.v3.validators.cache'
const good = {
  at: 1700000000000,
  blockNumber: 189300,
  overview: null,
  validators: [{ address: '5A', commission_pct: '0.0', total_pot: '10', own_pot: '1', nominator_count: 2, points: 5 }],
}

test('valid cache round-trips', () => {
  store.clear()
  writeValidatorCache(good as any)
  const back = readValidatorCache()
  assert.ok(back)
  assert.equal(back!.validators.length, 1)
  assert.equal(back!.blockNumber, 189300)
})

test('empty validator list is rejected (never shown as data)', () => {
  store.clear()
  store.set(KEY, JSON.stringify({ ...good, validators: [] }))
  assert.equal(readValidatorCache(), null)
})

test('wrong row shape is rejected', () => {
  store.clear()
  store.set(KEY, JSON.stringify({ ...good, validators: [{ address: '', commission_pct: 1 }] }))
  assert.equal(readValidatorCache(), null)
})

test('corrupt JSON is rejected without throwing', () => {
  store.clear()
  store.set(KEY, '{not json')
  assert.equal(readValidatorCache(), null)
})

test('missing timestamp is rejected', () => {
  store.clear()
  store.set(KEY, JSON.stringify({ validators: good.validators }))
  assert.equal(readValidatorCache(), null)
})
