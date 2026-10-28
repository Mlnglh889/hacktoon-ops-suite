export type V3Overview = {
  network: string
  chain_id: number
  latest_block: { block_number: number; block_hash: string; captured_at: number } | null
  latest_era: number | null
  validator_count: number
  total_stake_pot: number
  source: string
  served_from?: 'live' | 'cache'
  stale?: boolean
  cachedAt?: number | null
  blockNumber?: number | null
  error?: string | null
}

export type V3Network = {
  network: string
  era: number | null
  block_number: number
  total_issuance_pot: number
  total_staked_pot: number
  staking_ratio_pct: number
  source: string
}

export type V3Validator = {
  address: string
  nickname: string | null
  last_seen: number
  era: number
  total_pot: string | null
  own_pot: string | null
  nominator_count: number | null
  commission_pct: string | null
  points: number | null
  data_errors?: string[]
}

export type V3ValidatorsResponse = {
  network: string
  validators: V3Validator[]
  served_from?: 'live' | 'cache'
  stale?: boolean
  cachedAt?: number | null
  blockNumber?: number | null
  error?: string | null
}

export type V3Era = {
  era: number | null
  validator_count: number
  total_stake_pot: number
  captured_at?: number
}

export type V3PayoutRow = {
  era: number
  validator: string
  stake_pot: number | null
  validator_total_stake_pot: number | null
  stake_share_pct: number | null
  era_reward_pot: number | null
  validator_points: number
  era_total_points: number
  validator_payout_pot: number | null
  commission_pct: number
  nominator_pool_pot: number | null
  reward_pot: number | null
  claim_state: 'claimed' | 'unclaimed'
  is_current_era: boolean
  era_start_ms: number | null
  payee: string | null
}

export type V3Payouts = {
  address: string
  current_era: number
  eras: number[]
  payee: string | null
  rows: V3PayoutRow[]
  era_starts: Record<string, number>
  totals: { reward_pot: number; claimed_pot: number; pending_pot: number; era_count: number }
  source: string
  served_from?: 'live' | 'cache'
}

const V3_API_BASE = '/api/v3'

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  // Hard timeout per request so one slow endpoint cannot block the others.
  const timeout = AbortSignal.timeout(20000)
  const merged = signal ? AbortSignal.any([signal, timeout]) : timeout
  const response = await fetch(`${V3_API_BASE}${path}`, { signal: merged, cache: 'no-store' })
  if (!response.ok) throw new Error(`V3 API ${response.status}: ${path}`)
  return response.json() as Promise<T>
}

export const v3Api = {
  overview: (signal?: AbortSignal) => get<V3Overview>('/overview', signal),
  validators: (signal?: AbortSignal) => get<V3ValidatorsResponse>('/validators', signal),
  era: (signal?: AbortSignal) => get<V3Era>('/eras/latest', signal),
  network: (signal?: AbortSignal) => get<V3Network>('/network', signal),
  stats: async (signal?: AbortSignal) => {
    const [o, v, n] = await Promise.all([v3Api.overview(signal), v3Api.validators(signal), v3Api.network(signal).catch(() => null)])
    return {
      block_height: o.latest_block?.block_number ?? null,
      era: n?.era ?? o.latest_era,
      validators: v.validators.length,
      active_validator_count: v.validators.length,
      validators_status_verified: true,
      total_staked_pot: n?.total_staked_pot ?? 0,
      total_issuance_pot: n?.total_issuance_pot ?? 0,
      staking_ratio_pct: n?.staking_ratio_pct ?? 0,
    }
  },
  stakingOverview: async (signal?: AbortSignal) => {
    const [o, n] = await Promise.all([v3Api.overview(signal), v3Api.network(signal).catch(() => null)])
    return {
      era: n?.era ?? o.latest_era ?? 0,
      total_issuance_pot: n?.total_issuance_pot ?? 0,
      total_staked_pot: n?.total_staked_pot ?? 0,
      staking_ratio: n?.staking_ratio_pct ?? 0,
      ideal_ratio: 0,
      est_network_inflation_pct: 0,
      est_base_apy_pct: 0,
      active_validators: o.validator_count,
      model_note: 'V3 testnet has insufficient verified stake data for APY.',
      apy_is_model_estimate: false,
      apy_method: 'unavailable',
      apy_calculation: 'unavailable',
      bonding_duration_eras: null,
    }
  },
  payouts: (address: string, eras = 8, signal?: AbortSignal) =>
    get<V3Payouts>(`/payouts?address=${encodeURIComponent(address)}&eras=${eras}`, signal),
  validatorList: async (signal?: AbortSignal) => {
    const data = await v3Api.validators(signal)
    return { validators: data.validators.map((v) => ({ address: v.address, name: v3ValidatorName(v), commission: commissionToPercent(v.commission_pct), total_stake_pot: v.total_pot === null ? null : toNumber(v.total_pot), status: 'Active' as const, status_source: 'V3 Session.Validators', data_errors: v.data_errors || [] })) }
  },
}

export const V3_NETWORK = {
  name: 'PortaldotV3 Testnet',
  chainId: 420420777,
  ws: 'wss://test-node-v3.portaldot.dev',
  evm: 'https://test-evm-rpc-v3.portaldot.dev',
  explorer: 'https://node-console.portaldot.dev',
} as const

export function v3ValidatorName(v: V3Validator) {
  return v.nickname || `${v.address.slice(0, 8)}…${v.address.slice(-6)}`
}

export function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function commissionToPercent(value: string | number | null | undefined) {
  const n = toNumber(value)
  // Backend V3 exposes commission_pct in percentage points (e.g. "1.0").
  // Raw chain per-billion conversion belongs in backend/app/v3.py, not here.
  return Math.max(0, Math.min(100, n))
}

export type SnapshotLatest = {
  snapshot: { id: number; taken_at: number; block_number: number; era: number | null; source: string; validator_count: number } | null
  age_seconds: number | null
  stale: boolean
  collector: { last_ok: number | null; last_error: string | null; running: boolean }
  source: string
}
export type SnapshotChange = { id: number; detected_at: number; snapshot_id: number; address: string; field: string; old_value: string | null; new_value: string | null }

export const v3SnapshotApi = {
  latest: (signal?: AbortSignal) => get<SnapshotLatest>('/snapshots/latest', signal),
  changes: (limit = 20, signal?: AbortSignal) => get<{ changes: SnapshotChange[] }>(`/snapshots/changes?limit=${limit}`, signal),
}
