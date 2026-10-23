import { useEffect, useState } from 'react'

export interface NetworkStats {
  block_height: number
  era: number
  validators: number
  total_staked_pot: number
  staking_ratio_pct: number
}

export function useStats() {
  const [stats, setStats] = useState<NetworkStats | null>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const r = await fetch('/api/v1/stats')
        const d = await r.json()
        if (alive) setStats(d)
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
