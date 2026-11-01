import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'
import type { ReactNode } from 'react'

import { getRuntimeStatus } from '@/lib/api'
import type { RuntimeStatus } from '@/types'

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
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null)

  useEffect(() => {
    let cancelled = false

    const refresh = () => {
      getRuntimeStatus()
        .then((status) => {
          if (!cancelled) setRuntime(status)
        })
        .catch(() => undefined)
    }

    refresh()
    const timer = window.setInterval(refresh, 5000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  const running = runtime?.status === 'running'

  return (
    <aside className="sticky top-0 h-screen border-l rule bg-[var(--surface)] px-5 py-6 max-lg:hidden">
      <div className="mb-6 flex items-center justify-between">
        <span className="editorial-label">Local Environment</span>
        <span className="mono text-[10px] text-[var(--muted)]">01</span>
      </div>

      <Item label="Model">
        <div className="mono text-sm">
          {runtime?.model_name ?? 'NO MODEL LOADED'}
        </div>
        <div className="mono mt-1 text-[11px] text-[var(--muted)]">
          {running
            ? `${runtime.model_quant ?? '—'} · ${
                runtime.model_context?.toLocaleString() ?? '—'
              } CONTEXT`
            : 'LOAD A MODEL IN MODELS'}
        </div>
      </Item>

      <Item label="Runtime">
        <div className="mono flex items-center gap-2 text-xs">
          LLAMA.CPP
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              running ? 'bg-[var(--success)]' : 'bg-[var(--muted)]'
            }`}
          />
          {runtime?.status.toUpperCase() ?? 'UNKNOWN'}
        </div>
        {runtime?.port && (
          <div className="mono mt-1 text-[10px] text-[var(--muted)]">
            PORT {runtime.port} · PID {runtime.pid ?? '—'}
          </div>
        )}
      </Item>

      <Item label="Context">
        <div className="mono mb-2 flex justify-between text-xs">
          <span>{runtime?.model_context?.toLocaleString() ?? '—'}</span>
          <span className="text-[var(--muted)]">CONFIGURED</span>
        </div>

        <div className="progress">
          <span style={{ width: running ? '100%' : '0%' }} />
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