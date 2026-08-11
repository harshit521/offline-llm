import { Link, useLocation } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen, LayoutGrid, MessagesSquare, FileText, Cpu, Activity, Settings, Sun, Moon } from 'lucide-react'

const items = [
  ['01', 'Workspace', '/workspace', LayoutGrid],
  ['02', 'Conversations', '/conversations', MessagesSquare],
  ['03', 'Documents', '/documents', FileText],
  ['04', 'Models', '/models', Cpu],
  ['05', 'System', '/system', Activity],
  ['06', 'Settings', '/settings', Settings],
] as const

export function Sidebar({
  collapsed,
  setCollapsed,
  theme,
  setTheme,
}: {
  collapsed: boolean
  setCollapsed: (v: boolean) => void
  theme: 'light' | 'dark'
  setTheme: (v: 'light' | 'dark') => void
}) {
  const { pathname } = useLocation()
  return (
    <aside className={`${collapsed ? 'w-[72px]' : 'w-[246px]'} sticky top-0 h-screen border-r rule bg-[var(--bg)] transition-all duration-200 max-md:w-[72px]`}>
      <div className="flex h-full flex-col px-3 py-5">
        <div className="flex items-start justify-between px-2 pb-10">
          {!collapsed && (
            <div>
              <div className="flex items-center gap-2 text-[15px] font-bold tracking-[.18em]">
                <span className="grid h-5 w-5 place-items-center border border-[var(--text)]">
                  <span className="h-2 w-2 bg-[var(--accent)]" />
                </span>
                OFFLINE
              </div>
              <div className="mt-1 editorial-label">Local Intelligence</div>
            </div>
          )}
          <button onClick={() => setCollapsed(!collapsed)} aria-label="Toggle navigation" className="grid h-8 w-8 place-items-center text-[var(--muted)] hover:text-[var(--text)]">
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>
        <nav className="space-y-1">
          {items.map(([num, label, href, Icon]) => {
            const active = pathname.startsWith(href)
            return (
              <Link
                key={href}
                to={href}
                title={label}
                className={`group flex items-center gap-3 border-l-2 px-2 py-3 text-sm transition-colors ${active ? 'border-[var(--accent)] bg-[var(--surface)]' : 'border-transparent hover:bg-[var(--surface)]'} ${collapsed ? 'justify-center' : ''}`}
              >
                <Icon size={16} strokeWidth={1.5} />
                {!collapsed && (
                  <>
                    <span className="mono w-5 text-[10px] text-[var(--muted)]">{num}</span>
                    <span>{label}</span>
                  </>
                )}
              </Link>
            )
          })}
        </nav>
        <div className="mt-auto space-y-5">
          {!collapsed && (
            <div className="border-t rule pt-5">
              <div className="editorial-label mb-2">Local</div>
              <div className="flex items-center gap-2 text-xs">
                <span className="h-2 w-2 rounded-full bg-[var(--success)]" />
                SYSTEM READY
              </div>
            </div>
          )}
          <div className={`${collapsed ? 'flex-col' : 'flex'} gap-1 border border-[var(--border)] p-1`}>
            <button onClick={() => setTheme('light')} className={`flex flex-1 items-center justify-center gap-1 px-2 py-2 text-[10px] uppercase tracking-wider ${theme === 'light' ? 'bg-[var(--surface-2)]' : ''}`}>
              <Sun size={13} /> {!collapsed && 'Light'}
            </button>
            <button onClick={() => setTheme('dark')} className={`flex flex-1 items-center justify-center gap-1 px-2 py-2 text-[10px] uppercase tracking-wider ${theme === 'dark' ? 'bg-[var(--surface-2)]' : ''}`}>
              <Moon size={13} /> {!collapsed && 'Dark'}
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}
