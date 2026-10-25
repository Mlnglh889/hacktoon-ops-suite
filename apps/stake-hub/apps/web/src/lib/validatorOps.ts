export type ValidatorRow = {
  address: string
  name: string
  commission: number
  total_stake_pot: number | null
  own_pot: number | null
  nominators: number | null
  points: number | null
  tier: string
}

export type ValidatorCategory = "all" | "active" | "low" | "watch"
export type ValidatorSort = "stake" | "commission" | "nominators" | "risk"

export function filterAndSortValidators(rows: ValidatorRow[], options: { category: ValidatorCategory; search: string; sort: ValidatorSort }): ValidatorRow[] {
  const query = options.search.trim().toLowerCase()
  const filtered = rows.filter(row => {
    const categoryMatches = options.category === "all"
      || (options.category === "active" && row.tier !== "RISK")
      || (options.category === "low" && row.tier === "SAFE")
      || (options.category === "watch" && row.tier === "WATCH")
    const searchMatches = !query || `${row.name} ${row.address}`.toLowerCase().includes(query)
    return categoryMatches && searchMatches
  })
  return [...filtered].sort((a, b) => {
    if (options.sort === "commission") return a.commission - b.commission
    if (options.sort === "nominators") return (b.nominators ?? 0) - (a.nominators ?? 0)
    if (options.sort === "risk") return a.tier.localeCompare(b.tier)
    return (b.total_stake_pot ?? 0) - (a.total_stake_pot ?? 0)
  })
}

export function toggleSelection(selected: string[], address: string, max = 2): string[] {
  if (selected.includes(address)) return selected.filter(item => item !== address)
  if (selected.length >= max) return selected
  return [...selected, address]
}
