import { useEffect, useState } from 'react'
import { Sidebar } from './Sidebar'
import { SystemPanel } from './SystemPanel'

export function AppShell({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('offline-theme') as 'light' | 'dark' | null
    const t = saved ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    setTheme(t)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('offline-theme', theme)
  }, [theme])

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] transition-colors duration-200">
      <div className="grid min-h-screen grid-cols-[auto_minmax(0,1fr)_280px] max-lg:grid-cols-[auto_minmax(0,1fr)]">
        <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} theme={theme} setTheme={setTheme} />
        <main className="min-w-0">{children}</main>
        <SystemPanel />
      </div>
    </div>
  )
}
