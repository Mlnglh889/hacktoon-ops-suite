// Validation for the browser-side last-good cache of V3 validator data.
// Only data that matches the expected shape is rendered; anything else is discarded.

export type CachedValidatorRow = {
  address: string
  commission_pct: string | null
  total_pot: string | null
  own_pot: string | null
  nominator_count: number | null
  points: number | null
  nickname?: string | null
}

export type ValidatorCache = {
  at: number
  blockNumber: number | null
  overview: unknown | null
  validators: CachedValidatorRow[]
}

const STORAGE_KEY = 'portaldot.v3.validators.cache'

const isStrOrNull = (v: unknown) => v === null || typeof v === 'string'
const isNumOrNull = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v))

function isRow(v: unknown): v is CachedValidatorRow {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return typeof r.address === 'string' && r.address.length > 0
    && isStrOrNull(r.commission_pct) && isStrOrNull(r.total_pot) && isStrOrNull(r.own_pot)
    && isNumOrNull(r.nominator_count) && isNumOrNull(r.points)
}

export function readValidatorCache(): ValidatorCache | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as Record<string, unknown>
    if (typeof data.at !== 'number' || !Number.isFinite(data.at)) return null
    if (!Array.isArray(data.validators) || data.validators.length === 0) return null
    if (!data.validators.every(isRow)) return null
    const blockNumber = typeof data.blockNumber === 'number' && Number.isFinite(data.blockNumber) ? data.blockNumber : null
    return { at: data.at, blockNumber, overview: data.overview ?? null, validators: data.validators }
  } catch {
    return null
  }
}

export function writeValidatorCache(cache: ValidatorCache): void {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache)) } catch { /* quota or disabled: keep running */ }
}
