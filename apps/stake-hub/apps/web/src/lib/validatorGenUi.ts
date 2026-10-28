// Grounded generative UI for Validators. Cards are derived only from fields
// the V3 validator API actually returns. No risk score, APY, uptime, or USD.

export type ValidatorEvidence = {
  address: string
  nickname?: string | null
  commission_pct?: number | null
  total_pot?: number | null
  own_pot?: number | null
  nominator_count?: number | null
  points?: number | null
  era?: number | null
  last_seen?: string | number | null
  data_errors?: string[] | null
}

export type ValidatorCard = {
  kind: 'validator'
  title: string
  address: string
  nickname: string
  commission: string
  totalStake: string
  ownStake: string
  nominators: string
  points: string
  era: string
  lastSeen: string
  errors: string[]
  source: string
}

export type ValidatorGenView = {
  kind: 'validator_cards' | 'empty'
  title: string
  note: string
  cards: ValidatorCard[]
  source: string
  checkedAt: string | null
}

const dash = '—'
const pot = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? dash : `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} tPOT`
const text = (value: string | number | null | undefined) => value == null || value === '' ? dash : String(value)

export function validatorCards(rows: ValidatorEvidence[], checkedAt: string | null = null): ValidatorGenView {
  if (!rows.length) return { kind: 'empty', title: 'Validators', note: 'No live validator records.', cards: [], source: '/api/v3/validators', checkedAt }
  const cards = rows.map((row): ValidatorCard => ({
    kind: 'validator',
    title: row.nickname?.trim() || 'Unnamed validator',
    address: row.address,
    nickname: row.nickname?.trim() || dash,
    commission: row.commission_pct == null || !Number.isFinite(row.commission_pct) ? dash : `${row.commission_pct.toFixed(2)}%`,
    totalStake: pot(row.total_pot),
    ownStake: pot(row.own_pot),
    nominators: text(row.nominator_count),
    points: text(row.points),
    era: text(row.era),
    lastSeen: text(row.last_seen),
    errors: Array.isArray(row.data_errors) ? row.data_errors.filter(Boolean) : [],
    source: '/api/v3/validators',
  }))
  return {
    kind: 'validator_cards',
    title: 'Live validator cards',
    note: 'Rendered only from live validator fields. Commission is not a risk score.',
    cards,
    source: '/api/v3/validators',
    checkedAt,
  }
}
