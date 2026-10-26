// Post-transaction verification helpers. Pure functions, no chain access.

export type NominationCheck = {
  ok: boolean
  missing: string[] // requested but not on chain
  extra: string[] // on chain but not requested
  onChainCount: number
  requestedCount: number
}

// Compare the requested validator set with the nominations read back from chain after finalization.
// Order is ignored; duplicates on either side are collapsed.
export function verifyNominationSet(requested: string[], onChain: string[]): NominationCheck {
  const want = new Set(requested)
  const have = new Set(onChain)
  const missing = [...want].filter(a => !have.has(a))
  const extra = [...have].filter(a => !want.has(a))
  return {
    ok: missing.length === 0 && extra.length === 0,
    missing,
    extra,
    onChainCount: have.size,
    requestedCount: want.size,
  }
}

export type BondCheck = { ok: boolean; expectedPlanck: string; deltaPlanck: string }

// Verify the ledger grew by exactly the requested bond amount after finalization.
// Pure: caller reads ledger before and after the tx and passes planck values as strings.
export function verifyBondDelta(beforePlanck: string, afterPlanck: string, requestedPlanck: string): BondCheck {
  const before = BigInt(beforePlanck), after = BigInt(afterPlanck), req = BigInt(requestedPlanck)
  const delta = after - before
  return { ok: delta === req, expectedPlanck: req.toString(), deltaPlanck: delta.toString() }
}
