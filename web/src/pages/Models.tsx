import { useEffect, useState } from 'react'
import { Plus, RefreshCw, X, Cpu } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { listModels } from '@/lib/api'

const API_URL =
  import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

type ModelInfo = {
  id: string
  name: string
  status: string
}

export default function Models() {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [modelName, setModelName] = useState('')

  async function loadModels() {
    setLoading(true)
    setError('')

    try {
      const data = await listModels()
      setModels(data)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not connect to the llama.cpp server.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadModels()
  }, [])

  return (
    <div>
      <PageHeader
        eyebrow="Machine configuration"
        title="LOCAL MODELS"
        subtitle="Models exposed by your local llama.cpp inference server."
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
        <div className="mb-5 flex items-center justify-between">
          <span className="editorial-label">Inference runtime</span>
          <button
            onClick={() => void loadModels()}
            disabled={loading}
            className="flex items-center gap-2 border rule px-3 py-2 text-xs disabled:opacity-50"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>

        {loading && <p className="py-8 text-sm">Checking local models…</p>}

        {!loading && error && (
          <div className="border rule p-5 text-sm">
            <p className="text-[var(--error)]">{error}</p>
            <p className="mt-2 text-[var(--muted)]">
              Make sure llama-server is running on port 8080.
            </p>
            <button
              onClick={() => void loadModels()}
              className="mt-4 border rule px-3 py-2 text-xs"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && models.length === 0 && (
          <p className="border rule p-5 text-sm">
            The server responded, but did not report any models.
          </p>
        )}

        {!loading &&
          !error &&
          models.map((model) => (
            <div
              key={model.id}
              className="grid gap-4 border-t rule py-6 lg:grid-cols-[1fr_auto_auto] lg:items-center"
            >
              <div className="flex items-start gap-3">
                <Cpu size={18} className="mt-1 text-[var(--muted)]" />
                <div>
                  <div className="mono text-sm font-semibold">
                    {model.name}
                  </div>
                  <div className="mt-1 break-all mono text-[10px] text-[var(--muted)]">
                    {model.id}
                  </div>
                </div>
              </div>
              <span className="mono text-[10px] text-[var(--success)]">
                ● {model.status}
              </span>
              <span className="text-xs text-[var(--muted)]">
                Served by llama.cpp
              </span>
            </div>
          ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 p-5">
          <div className="w-full max-w-md border rule bg-[var(--bg)] shadow-xl">
            <div className="flex justify-between border-b rule p-6">
              <div>
                <div className="editorial-label">Local runtime</div>
                <h2 className="mt-2 text-lg font-semibold">Add model</h2>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4 p-6">
              <p className="text-sm text-[var(--muted)]">
                Model downloads are not connected yet. Your backend needs a
                GGUF download endpoint before this action can install models.
              </p>
              <label className="block">
                <span className="editorial-label">Model identifier</span>
                <input
                  value={modelName}
                  onChange={(event) => setModelName(event.target.value)}
                  className="mt-2 w-full border rule bg-transparent px-3 py-3 mono text-xs outline-none"
                  placeholder="Hugging Face model ID"
                />
              </label>
              <button
                onClick={() => {
                  setOpen(false)
                  setError(
                    'Model downloading is not implemented by the backend yet.',
                  )
                }}
                className="w-full border rule px-4 py-3 text-xs uppercase tracking-wider"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}