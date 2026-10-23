import { Routes, Route, useLocation } from 'react-router-dom'
import CosmicBackground from './components/CosmicBackground'
import SideNav from './components/SideNav'
import WalletButton from './components/WalletButton'
import Home from './pages/Home'
import Stake from './pages/Stake'
import Unstake from './pages/Unstake'

import Portfolio from './pages/Portfolio'
import Alerts from './pages/Alerts'
import AskDot from './pages/AskDot'
import Validators from './pages/Validators'
import Overview from './pages/Overview'
import Payouts from './pages/Payouts'

function Footer() {
  return (
    <footer className="w-full mt-auto relative overflow-hidden bg-surface-container-lowest border-t border-outline-variant/20 shadow-[0_-4px_20px_-5px_rgba(139,92,246,0.1)] z-10">
      <div className="flex flex-col md:flex-row justify-between items-center w-full px-space-lg py-space-md max-w-[1600px] mx-auto gap-space-sm">
        <div className="text-[15px] text-on-surface-variant flex items-center gap-2 text-center md:text-left">
          <span className="w-1.5 h-1.5 rounded-full bg-primary/80"></span>
          <span>© 2025 PORTALDOT · Substrate NPoS Consensus Engine · Non-Custodial</span>
        </div>
        <nav className="flex items-center flex-wrap justify-center gap-6">
          {['Network Telemetry', 'Consensus Specs', 'Validator Portal', 'Docs'].map((l) => (
            <a key={l} className="text-[15px] text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer hover:text-primary duration-150" href="#">
              {l}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  )
}

export default function App() {
  const loc = useLocation()
  const isHome = loc.pathname === '/'
  const isUnstake = loc.pathname === '/unstake' || loc.pathname === '/stake'
  const routes = <Routes>
    <Route path="/" element={<Home />} />
    <Route path="/overview" element={<Overview />} />
    <Route path="/stake" element={<Stake />} />
    <Route path="/unstake" element={<Unstake />} />
    <Route path="/payouts" element={<Payouts />} />
    <Route path="/portfolio" element={<Portfolio />} />
    <Route path="/validators" element={<Validators />} />
    <Route path="/alerts" element={<Alerts />} />
    <Route path="/ai" element={<AskDot />} />
  </Routes>

  // Keep the shared sidebar so users can move between Stake, Unstake,
  // Validators, and the other app sections. The Unstake page only owns its
  // Stitch header/content shell and does not add the legacy floating wallet
  // button or footer around it.
  if (isUnstake) return (
    <div className="bg-[#020617] text-on-surface min-h-screen relative overflow-x-hidden selection:bg-secondary-container selection:text-primary-fixed">
      <SideNav />
      <div className="lg:pl-[182px] min-h-screen">
        <div className="wallet-floating fixed top-4 right-4 sm:top-6 sm:right-8 z-[100]">
          <WalletButton />
        </div>
        {routes}
      </div>
    </div>
  )

  return (
    <div className="bg-[#020617] text-on-surface min-h-screen flex flex-col relative overflow-x-hidden selection:bg-secondary-container selection:text-primary-fixed">
      {isHome && <CosmicBackground />}
      <SideNav />
      <div className="lg:pl-[182px] flex flex-col min-h-screen">
        {(isHome || loc.pathname === '/stake') && (
          <div className="fixed top-4 right-4 sm:top-6 sm:right-8 z-50">
            <WalletButton />
          </div>
        )}
        {routes}
        <Footer />
      </div>
    </div>
  )
}
