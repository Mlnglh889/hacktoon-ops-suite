import { useEffect, useState } from 'react'

export interface NetworkStats {
  block_height: number
  era: number
  validators: number
  total_staked_pot: number
  staking_ratio_pct: number
}

// Grounded on the same Portaldot V3 endpoints as Overview/Validators.
// The legacy /api/v1/stats reads the old SQLite collector (era 3918, 11 validators),
// which is a different chain than the V3 testnet the rest of this app shows
// (era ~63, 2 validators). Telemetry must never mix the two.
async function readStats(): Promise<NetworkStats | null> {
  const [networkRes, validatorsRes] = await Promise.all([
    fetch('/api/v3/network', { cache: 'no-store' }),
    fetch('/api/v3/validators', { cache: 'no-store' }),
  ])
  if (!networkRes.ok) throw new Error(`V3 network HTTP ${networkRes.status}`)
  const network = await networkRes.json()
  const validators = validatorsRes.ok ? await validatorsRes.json() : null
  const era = network.era
  const block = network.block_number
  const count = Array.isArray(validators?.validators) ? validators.validators.length : null
  if (era == null || block == null) return null
  return {
    block_height: Number(block),
    era: Number(era),
    validators: count ?? 0,
    total_staked_pot: Number(network.total_staked_pot ?? 0),
    staking_ratio_pct: Number(network.staking_ratio_pct ?? 0),
  }
}

export function useStats() {
  const [stats, setStats] = useState<NetworkStats | null>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const next = await readStats()
        // Keep the last good reading on a transient RPC failure instead of blanking.
        if (alive && next) setStats(next)
      } catch {
        /* keep last */
      }
    }
    load()
    const t = setInterval(load, 30000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  return stats
}