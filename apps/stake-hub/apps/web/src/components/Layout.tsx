import { ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  children: ReactNode
  actions?: ReactNode
}

export default function Layout({ title, subtitle, children, actions }: Props) {
  return (
    <div className="max-w-[1100px] mx-auto px-5 pt-10 pb-24">
      {/* Page header */}
      <div className="flex items-end justify-between mb-8 pb-5 border-b border-white/[0.06]">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-white/40 mt-1">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>

      {/* Page content */}
      {children}
    </div>
  )
}
