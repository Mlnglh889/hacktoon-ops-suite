import { Component, type ErrorInfo, type ReactNode } from 'react'

// Isolates one dashboard section: if it throws while rendering, only this section shows a notice.
// The rest of the page keeps working instead of going blank.
type Props = { name: string; children: ReactNode }
type State = { error: Error | null }

export class SectionBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[Portaldot] section "${this.props.name}" failed`, error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <section role="alert" className="mt-5 rounded-[10px] border border-amber-500/40 bg-amber-950/30 p-4 text-xs font-mono text-amber-200">
        <div className="font-semibold">{this.props.name} could not render.</div>
        <div className="mt-1 text-[#cbd5e1]">The rest of the page still works. Reload to retry.</div>
        <button type="button" onClick={() => this.setState({ error: null })} className="mt-2 rounded border border-[#24305c] px-2 py-1 text-[#e2e8f0]">Retry section</button>
      </section>
    )
  }
}
