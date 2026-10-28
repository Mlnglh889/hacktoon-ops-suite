import { test } from 'node:test'
import assert from 'node:assert/strict'
import { averageCurrentLatency, failedChecks, latencySegments, responseStatus, filterRpcRows, downsampleSamples, normalizeRpcTimestamp, staleSeconds } from './infraClarity'

const s = (checked_at: number, latency_ms: number | null, ok = true) => ({ checked_at, latency_ms, ok })

test('RPC timestamps accept seconds and milliseconds but reject invalid units', () => {
  assert.equal(normalizeRpcTimestamp(1700000000), 1700000000)
  assert.equal(normalizeRpcTimestamp(1700000000000), 1700000000)
  assert.equal(normalizeRpcTimestamp('not-a-timestamp'), null)
  assert.equal(normalizeRpcTimestamp(123), null)
})

test('stale age is derived only from the last successful update', () => {
  assert.equal(staleSeconds(100000, 131000), 31)
  assert.equal(staleSeconds(null, 131000), null)
})

test('status labels are plain and offline wins over latency quality', () => {
  assert.equal(responseStatus(false, 'degraded'), 'Offline')
  assert.equal(responseStatus(false, 'failing'), 'Offline')
  assert.equal(responseStatus(true, 'healthy'), 'Healthy')
  assert.equal(responseStatus(true, 'slow'), 'Slow')
  assert.equal(responseStatus(true, 'degraded'), 'Degraded')
  assert.equal(responseStatus(true, 'unknown'), 'Healthy')
})

test('average response time is the mean of current online probe latency', () => {
  assert.equal(averageCurrentLatency([{ ok: true, latency_ms: 100 }, { ok: true, latency_ms: 201 }, { ok: false, latency_ms: 900 }, { ok: true, latency_ms: null }]), 151)
  assert.equal(averageCurrentLatency([{ ok: false, latency_ms: 900 }]), null)
  assert.equal(averageCurrentLatency([]), null)
})

test('failed checks count actual persisted failures, not an error rate', () => {
  assert.equal(failedChecks([{ history: { failures: { total: 3 } } }, { history: { failures: { total: 2 } } }]), 5)
  assert.equal(failedChecks([{ history: {} }]), 0)
})

test('x positions use timestamps, not sample order', () => {
  const segs = latencySegments([s(1000, 100), s(1500, 100), s(2000, 200)], 1000, 2000)
  assert.equal(segs.length, 1)
  // x is percent of the selected window, so the midpoint lands at 50, not sample index.
  assert.deepEqual(segs[0].map(p => Math.round(p[0])), [0, 50, 100])
})

test('failed samples break the line instead of bridging it', () => {
  const segs = latencySegments([s(1000, 100), s(1100, null, false), s(1200, 200)], 1000, 1300)
  assert.deepEqual(segs.map(seg => seg.length), [1, 1])
})

test('missing samples break the line when the gap exceeds the expected interval', () => {
  const segs = latencySegments([s(1000, 100), s(1060, 110), s(2000, 120), s(2060, 130)], 1000, 2100)
  assert.deepEqual(segs.map(seg => seg.length), [2, 2])
})

test('y values stay the measured milliseconds, not rescaled guesses', () => {
  const points = latencySegments([s(1000, 12), s(1100, 200)], 1000, 1100)[0]
  assert.deepEqual(points.map(p => p[1]), [12, 200])
})

test('samples outside the window are not plotted', () => {
  const segs = latencySegments([s(500, 100), s(1500, 100), s(2500, 100)], 1000, 2000)
  assert.deepEqual(segs.map(seg => seg.length), [1])
})


test('chart filter selects only expected chain series', () => {
  const rows = [{ chain_family: 'substrate', ok: true, state: 'closed' }, { chain_family: 'evm', ok: true, state: 'closed' }, { chain_family: 'evm', ok: false, state: 'closed' }]
  assert.equal(filterRpcRows(rows, 'all').length, 3)
  assert.deepEqual(filterRpcRows(rows, 'substrate').map(r => r.chain_family), ['substrate'])
  assert.deepEqual(filterRpcRows(rows, 'evm').length, 2)
})


test('downsampling preserves real bucket outliers and timestamps', () => {
  const rows = Array.from({ length: 20 }, (_, i) => s(1000 + i, i === 7 ? 999 : 10 + i))
  const result = downsampleSamples(rows, 6)
  assert.ok(result.length <= 6)
  assert.ok(result.some(x => x.latency_ms === 999))
  assert.ok(result.every(x => rows.some(y => y.checked_at === x.checked_at)))
})
