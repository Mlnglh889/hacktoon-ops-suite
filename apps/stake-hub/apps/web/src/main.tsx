import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { WalletProvider } from './lib/walletContext'
import './index.css'

// Keep browser translation enabled for dynamically rendered React content.
document.documentElement.lang = 'en'
document.documentElement.setAttribute('translate', 'yes')
document.body.removeAttribute('translate')

type Props = { children: ReactNode }
type State = { error: Error | null }

class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Portaldot] render error', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main style={{ minHeight: '100vh', background: '#020617', color: '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif', padding: 32, display: 'grid', placeItems: 'center' }}>
        <section style={{ maxWidth: 560, width: '100%', border: '1px solid rgba(248,113,113,.35)', borderRadius: 16, padding: 24, background: '#0b1228' }}>
          <div style={{ color: '#fca5a5', fontWeight: 700, letterSpacing: '.12em', fontSize: 12 }}>PORTALDOT STAKE HUB</div>
          <h1 style={{ fontSize: 24, margin: '14px 0 8px' }}>Dashboard failed to render</h1>
          <p style={{ color: '#cbd5e1', lineHeight: 1.6, margin: 0 }}>Refresh the page or try the latest browser version. The technical error is shown below for diagnosis.</p>
          <pre style={{ marginTop: 18, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: '#fda4af', fontSize: 12 }}>{this.state.error.message}</pre>
          <button onClick={() => location.reload()} style={{ marginTop: 18, border: 0, borderRadius: 10, padding: '10px 16px', color: '#fff', background: '#6d3bd7', fontWeight: 700 }}>Reload dashboard</button>
        </section>
      </main>
    )
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <WalletProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </WalletProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
