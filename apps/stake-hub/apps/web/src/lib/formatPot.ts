// Single source of truth for tPOT amounts in the UI.
//
// Chain values arrive already scaled in whole tPOT (see backend/app/v3.py, which
// divides planck by 10^14). The UI must therefore NEVER divide again and must
// NEVER invent a "M"/"K" suffix: at V3 testnet magnitude a second division turns
// 20,240 tPOT into "0.02M POT", which is a fabricated scale.
export const TPOT_UNIT = 'tPOT'
export const TPOT_DECIMALS = 14

const DASH = '—'

export function formatTPot(
  value: number | null | undefined,
  fractionDigits = 2,
): string {
  if (value == null || !Number.isFinite(value)) return DASH
  return `${value.toLocaleString('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })} ${TPOT_UNIT}`
}

/** Value only (no unit), for table cells that render the unit separately. */
export function formatTPotValue(
  value: number | null | undefined,
  fractionDigits = 2,
): string {
  if (value == null || !Number.isFinite(value)) return DASH
  return value.toLocaleString('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
}