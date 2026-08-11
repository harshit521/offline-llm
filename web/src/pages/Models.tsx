import { useState } from 'react'
import {
  Plus,
  Play,
  Square,
  Trash2,
  X,
  DownloadCloud,
} from 'lucide-react'

import { models as initial } from '@/lib/mock'
import { PageHeader } from '@/components/ui/PageHeader'

export default function Models() {
  const [models, setModels] = useState(initial)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('qwen3:8b')
  const [pulling, setPulling] = useState(false)

  const pull = () => {
    setPulling(true)

    setTimeout(() => {
      setPulling(false)
      setOpen(false)

      setModels((m) =>
        m.some((x) => x.id === name)
          ? m
          : [
              ...m,
              {
                name: name.split(':')[0].toUpperCase(),
                id: name,
                size: '—',
                quant: 'Q4_K_M',
                context: '32K',
                status: 'READY',
              },
            ],
      )
    }, 1600)
  }

  return (
    <div>
      <PageHeader
        eyebrow="Machine configuration"
        title="LOCAL MODELS"
        subtitle="Models available to the local inference runtime."
        action={
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 border rule px-3 py-2 text-[10px] uppercase tracking-wider"
          >
            <Plus size={14} />
            Add model
          </button>
        }
      />

      <div className="px-7 py-8 lg:px-10">
        <div className="border-t rule">
          {models.map((m, i) => (
            <div
              key={m.id}
              className="grid gap-5 border-b rule py-6 lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto] lg:items-center"
            >
              {/* Model */}
              <div>
                <div className="mono text-sm font-semibold">
                  {m.name}
                </div>

                <div className="mt-1 mono text-[10px] text-[var(--muted)]">
                  {m.id}
                </div>
              </div>

              {/* Parameters */}
              <div>
                <div className="editorial-label">
                  Parameters
                </div>

                <div className="mt-1 mono text-xs">
                  {m.name.includes('8B') ? '8B' : '—'}
                </div>
              </div>

              {/* Quantization */}
              <div>
                <div className="editorial-label">
                  Quantization
                </div>

                <div className="mt-1 mono text-xs">
                  {m.quant}
                </div>
              </div>

              {/* Size / Context */}
              <div>
                <div className="editorial-label">
                  Size / Context
                </div>

                <div className="mt-1 mono text-xs">
                  {m.size} · {m.context}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <span className="mono mr-2 text-[10px] text-[var(--success)]">
                  ● {m.status}
                </span>

                <button
                  title="Start"
                  className="p-2 text-[var(--muted)]"
                >
                  <Play size={14} />
                </button>

                <button
                  title="Stop"
                  className="p-2 text-[var(--muted)]"
                >
                  <Square size={13} />
                </button>

                <button
                  title="Delete"
                  onClick={() =>
                    setModels((x) =>
                      x.filter((_, n) => n !== i),
                    )
                  }
                  className="p-2 text-[var(--muted)] hover:text-[var(--error)]"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add model modal */}
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 p-5">
          <div className="w-full max-w-md border rule bg-[var(--bg)] shadow-xl">
            {/* Header */}
            <div className="flex justify-between border-b rule p-6">
              <div>
                <div className="editorial-label">
                  Local runtime
                </div>

                <h2 className="mt-2 text-lg font-semibold">
                  Add model
                </h2>
              </div>

              <button onClick={() => setOpen(false)}>
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <div className="space-y-5 p-6">
              <label className="block">
                <span className="editorial-label">
                  Model identifier
                </span>

                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-2 w-full border rule bg-transparent px-3 py-3 mono text-xs outline-none focus:border-[var(--accent)]"
                  placeholder="qwen3:8b"
                />
              </label>

              <button
                disabled={pulling}
                onClick={pull}
                className="flex w-full items-center justify-center gap-2 bg-[var(--accent)] px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--bg)] disabled:opacity-60"
              >
                {pulling ? (
                  <>
                    <DownloadCloud
                      size={14}
                      className="animate-pulse"
                    />
                    Pulling model…
                  </>
                ) : (
                  <>Pull model</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}