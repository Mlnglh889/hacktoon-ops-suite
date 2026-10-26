import { test } from 'node:test'
import assert from 'node:assert/strict'
import { historyState, latencyPath } from './rpcHistory'

const sample = (latency: number | null, ok = true) => ({ checked_at: 1, latency_ms: latency, ok, block_number: 10 })

test('empty history is reported as empty', () => {
  assert.equal(historyState([]), 'empty')
})

test('history with only failed samples is empty, not a fake chart', () => {
  assert.equal(historyState([sample(null, false), sample(null, false)]), 'empty')
})

test('single sample is partial', () => {
  assert.equal(historyState([sample(120)]), 'partial')
})

test('mixed null latency is partial', () => {
  assert.equal(historyState([sample(120), sample(null, false)]), 'partial')
})

test('populated history is populated', () => {
  assert.equal(historyState([sample(120), sample(140), sample(160)]), 'populated')
})

test('path needs at least two measured points', () => {
  assert.equal(latencyPath([sample(120)]), '')
  assert.equal(latencyPath([sample(120), sample(null, false)]), '')
})

test('path puts the peak near the top and scales lower values proportionally', () => {
  const [first, second] = latencyPath([sample(100), sample(200)]).split(' ')
  const yFirst = Number(first.split(',')[1])
  const ySecond = Number(second.split(',')[1])
  assert.equal(ySecond, 2)
  assert.ok(yFirst > ySecond, 'slower sample must be higher on the chart')
  assert.ok(Math.abs(yFirst - 16) < 0.5, 'half the peak sits mid-box')
})
