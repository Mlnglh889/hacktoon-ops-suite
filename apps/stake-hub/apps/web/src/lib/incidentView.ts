export type IncidentSeverity = 'critical' | 'warning' | 'info'

export function incidentSeverityClass(severity: string | undefined): string {
  if (severity === 'critical') return 'border-rose-400/30 bg-rose-950/20 text-rose-200'
  if (severity === 'warning') return 'border-amber-400/30 bg-amber-950/20 text-amber-200'
  return 'border-sky-400/30 bg-sky-950/20 text-sky-200'
}

export function incidentTitle(incident: { title?: string; kind?: string }): string {
  return incident.title || incident.kind || 'Incident'
}

export function incidentAddress(address: string | null | undefined): { full: string; short: string } {
  if (!address) return { full: '', short: '—' }
  return { full: address, short: `${address.slice(0, 4)}…${address.slice(-2)}` }
}

export function fmtIncidentTime(timestamp: number | undefined): string {
  return timestamp ? new Date(timestamp * 1000).toLocaleString('en-GB') : '—'
}

export function incidentSource(incident: { evidence?: Record<string, unknown> }): string {
  const evidence = incident.evidence || {}
  if (evidence.endpoint) return `RPC sample: ${String(evidence.endpoint)}`
  if (evidence.snapshot_id) return `Snapshot ${String(evidence.snapshot_id)}`
  return 'Persisted chain/RPC evidence'
}

export function incidentWindowLabel(window: string): string {
  return window === '1h' || window === '7d' ? window : '24h'
}

export function evidenceMetadata(evidence: Record<string, unknown> | undefined): Array<[string, string]> {
  if (!evidence) return []
  const preferred = ['endpoint', 'family', 'last_block', 'latest_ms', 'threshold_ms', 'stale_for_seconds', 'field', 'old', 'new']
  return preferred.filter(key => evidence[key] !== undefined && evidence[key] !== null).map(key => [key, String(evidence[key])])
}

export function rawEvidence(evidence: Record<string, unknown> | undefined): string {
  return JSON.stringify(evidence || {}, null, 2)
}
