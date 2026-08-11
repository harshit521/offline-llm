import { WifiOff } from 'lucide-react'
import type { ReactNode } from 'react'

function Item({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="border-t rule py-4">
      <div className="editorial-label mb-2">{label}</div>
      {children}
    </div>
  )
}

export function SystemPanel() {
  return (
    <aside className="sticky top-0 h-screen border-l rule bg-[var(--surface)] px-5 py-6 max-lg:hidden">
      <div className="mb-6 flex items-center justify-between">
        <span className="editorial-label">Local Environment</span>
        <span className="mono text-[10px] text-[var(--muted)]">01</span>
      </div>

      <Item label="Model">
        <div className="mono text-sm">QWEN3 8B</div>
        <div className="mono mt-1 text-[11px] text-[var(--muted)]">
          5.2 GB · Q4_K_M · 32K CONTEXT
        </div>
      </Item>

      <Item label="Runtime">
        <div className="mono flex items-center gap-2 text-xs">
          OLLAMA
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
          RUNNING
        </div>
      </Item>

      <Item label="Context">
        <div className="mono mb-2 flex justify-between text-xs">
          <span>8,192</span>
          <span className="text-[var(--muted)]">/ 32,768</span>
        </div>

        <div className="progress">
          <span style={{ width: '25%' }} />
        </div>
      </Item>

      <Item label="Performance">
        <div className="grid grid-cols-2 gap-3 mono text-xs">
          <div>
            <div>24 tok/s</div>
            <div className="mt-1 text-[10px] text-[var(--muted)]">
              THROUGHPUT
            </div>
          </div>

          <div>
            <div>1.2s</div>
            <div className="mt-1 text-[10px] text-[var(--muted)]">
              LATENCY
            </div>
          </div>
        </div>
      </Item>

      <Item label="System">
        <div className="mono space-y-2 text-xs">
          <div className="flex justify-between">
            <span>RAM</span>
            <span>8.4 GB</span>
          </div>

          <div className="flex justify-between">
            <span>CPU</span>
            <span>32%</span>
          </div>

          <div className="flex justify-between">
            <span>GPU/MPS</span>
            <span className="text-[var(--success)]">ACTIVE</span>
          </div>
        </div>
      </Item>

      <Item label="Network">
        <div className="flex items-center gap-2 mono text-xs">
          <WifiOff size={14} />
          OFFLINE
        </div>

        <div className="mt-1 mono text-[10px] text-[var(--muted)]">
          NO CLOUD CONNECTION
        </div>
      </Item>

      <div className="mt-5 border-t rule pt-4 text-[10px] leading-5 text-[var(--muted)]">
        All AI processing happens on this device.
      </div>
    </aside>
  )
}