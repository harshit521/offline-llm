import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Download,
  Play,
  Plus,
  RefreshCw,
  Square,
  Trash2,
  X,
} from 'lucide-react'

import { PageHeader } from '@/components/ui/PageHeader'
import {
  deleteModel,
  downloadModel,
  getRuntimeStatus,
  listModels,
  loadModel,
  registerModel,
  unloadModel,
} from '@/lib/api'
import type { DownloadProgress, RegisteredModel, RuntimeStatus } from '@/types'

const SELECTED_MODEL_KEY = 'offline-llm-selected-model'

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  )
  const value = bytes / 1024 ** exponent
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export default function Models() {
  const navigate = useNavigate()

  const [models, setModels] = useState<RegisteredModel[]>([])
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'download' | 'register'>('download')

  const [repoId, setRepoId] = useState('')
  const [filename, setFilename] = useState('')
  const [localPath, setLocalPath] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [context, setContext] = useState('4096')

  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const [formError, setFormError] = useState('')

  const refresh = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true)
    setError('')

    try {
      const [registered, status] = await Promise.all([
        listModels(),
        getRuntimeStatus(),
      ])
      setModels(registered)
      setRuntime(status)
    } catch (err) {
      setError(errorMessage(err, 'Could not load models from the backend.'))
    } finally {
      if (showSpinner) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Keep runtime state fresh while the page is open (loads can be slow).
  useEffect(() => {
    const timer = window.setInterval(() => {
      void getRuntimeStatus()
        .then((status) => setRuntime(status))
        .catch(() => undefined)
    }, 5000)
    return () => window.clearInterval(timer)
  }, [])

  const handleLoad = async (model: RegisteredModel) => {
    setBusyId(model.id)
    setError('')
    try {
      const status = await loadModel(model.id)
      setRuntime(status)
      localStorage.setItem(SELECTED_MODEL_KEY, model.id)
      await refresh(false)
    } catch (err) {
      setError(errorMessage(err, 'Could not load the model.'))
      await refresh(false)
    } finally {
      setBusyId(null)
    }
  }

  const handleUnload = async (model: RegisteredModel) => {
    setBusyId(model.id)
    setError('')
    try {
      const status = await unloadModel(model.id)
      setRuntime(status)
      await refresh(false)
    } catch (err) {
      setError(errorMessage(err, 'Could not unload the model.'))
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (model: RegisteredModel) => {
    if (!window.confirm(`Delete "${model.name}" and its GGUF file from disk?`)) {
      return
    }

    setBusyId(model.id)
    setError('')
    try {
      await deleteModel(model.id)
      if (localStorage.getItem(SELECTED_MODEL_KEY) === model.id) {
        localStorage.removeItem(SELECTED_MODEL_KEY)
      }
      await refresh(false)
    } catch (err) {
      setError(errorMessage(err, 'Could not delete the model.'))
    } finally {
      setBusyId(null)
    }
  }

  const useInChat = (model: RegisteredModel) => {
    localStorage.setItem(SELECTED_MODEL_KEY, model.id)
    navigate('/workspace')
  }

  const resetForm = () => {
    setRepoId('')
    setFilename('')
    setLocalPath('')
    setDisplayName('')
    setContext('4096')
    setProgress(null)
    setFormError('')
  }

  const closeModal = () => {
    if (downloading) return
    setOpen(false)
    resetForm()
  }

  const parseContext = (): number | null => {
    const value = Number(context)
    if (!Number.isInteger(value) || value < 256) {
      setFormError('Context must be an integer of at least 256 tokens.')
      return null
    }
    return value
  }

  const startDownload = async () => {
    setFormError('')
    const ctx = parseContext()
    if (ctx === null) return
    if (!repoId.trim() || !filename.trim()) {
      setFormError('Repository and GGUF filename are required.')
      return
    }

    setDownloading(true)
    setProgress(null)
    try {
      const result = await downloadModel(
        repoId.trim(),
        filename.trim(),
        ctx,
        (update) => setProgress(update),
      )
      setProgress(result)
      if (result.model_id) {
        localStorage.setItem(SELECTED_MODEL_KEY, result.model_id)
      }
      await refresh(false)
    } catch (err) {
      setFormError(errorMessage(err, 'The download failed.'))
    } finally {
      setDownloading(false)
    }
  }

  const submitRegister = async () => {
    setFormError('')
    const ctx = parseContext()
    if (ctx === null) return
    if (!localPath.trim()) {
      setFormError('A path inside the models directory is required.')
      return
    }

    setDownloading(true)
    try {
      const model = await registerModel({
        path: localPath.trim(),
        name: displayName.trim() || undefined,
        context: ctx,
      })
      localStorage.setItem(SELECTED_MODEL_KEY, model.id)
      await refresh(false)
      setOpen(false)
      resetForm()
    } catch (err) {
      setFormError(errorMessage(err, 'Could not register the model.'))
    } finally {
      setDownloading(false)
    }
  }

  const running = runtime?.status === 'running'

  return (
    <div>
      <PageHeader
        eyebrow="Machine configuration"
        title="LOCAL MODELS"
        subtitle="Download, register, and run GGUF models on this machine."
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
        {/* Runtime status */}
        <section className="mb-8 border rule bg-[var(--surface)] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="editorial-label">Managed runtime</div>
              <div className="mt-2 flex items-center gap-2 mono text-sm">
                <Cpu size={15} />
                {runtime?.model_name ?? 'No model loaded'}
              </div>
              <div className="mt-1 mono text-[10px] text-[var(--muted)]">
                {runtime
                  ? [
                      runtime.status.toUpperCase(),
                      runtime.port ? `PORT ${runtime.port}` : null,
                      runtime.pid ? `PID ${runtime.pid}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : 'CHECKING…'}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {running && runtime?.model_id && (
                <button
                  onClick={() => {
                    const current = models.find((m) => m.id === runtime.model_id)
                    if (current) void handleUnload(current)
                  }}
                  disabled={busyId !== null}
                  className="flex items-center gap-2 border rule px-3 py-2 text-[10px] uppercase tracking-wider disabled:opacity-50"
                >
                  <Square size={12} />
                  Unload
                </button>
              )}
              <button
                onClick={() => void refresh()}
                disabled={loading}
                className="flex items-center gap-2 border rule px-3 py-2 text-[10px] uppercase tracking-wider disabled:opacity-50"
              >
                <RefreshCw size={13} />
                Refresh
              </button>
            </div>
          </div>

          {runtime?.error && (
            <p className="mt-3 text-xs text-[var(--error)]">{runtime.error}</p>
          )}

          {!runtime?.managed && runtime?.reachable && (
            <p className="mt-3 text-xs text-[var(--muted)]">
              External llama-server reachable at {runtime.external_url}. Load a
              model here to let the backend manage the process.
            </p>
          )}

          {!runtime?.reachable && (
            <p className="mt-3 flex items-center gap-2 text-xs text-[var(--muted)]">
              <AlertTriangle size={13} />
              No llama-server is reachable. Load a registered model to start one.
            </p>
          )}
        </section>

        {error && (
          <div className="mb-6 border rule p-4 text-sm">
            <p className="text-[var(--error)]">{error}</p>
          </div>
        )}

        {loading && <p className="py-8 text-sm">Reading model registry…</p>}

        {!loading && models.length === 0 && (
          <div className="border rule p-8">
            <div className="editorial-label">Empty registry</div>
            <h2 className="mt-3 text-lg font-semibold">No models registered</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">
              Download a GGUF file from Hugging Face or register a file that is
              already inside the backend models directory. Downloaded models are
              validated and registered automatically.
            </p>
            <button
              onClick={() => {
                setMode('download')
                setOpen(true)
              }}
              className="mt-5 flex items-center gap-2 bg-[var(--accent)] px-4 py-2 text-[10px] uppercase tracking-wider text-[var(--bg)]"
            >
              <Download size={13} />
              Download a model
            </button>
          </div>
        )}

        {!loading && models.length > 0 && (
          <div className="border-t rule">
            {models.map((model) => {
              const isLoaded = runtime?.status === 'running' && runtime.model_id === model.id
              const busy = busyId === model.id
              return (
                <article
                  key={model.id}
                  className="grid gap-4 border-b rule py-5 lg:grid-cols-[1fr_auto] lg:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="mono text-sm font-semibold">{model.name}</span>
                      <span className="border rule px-2 py-0.5 mono text-[9px] text-[var(--muted)]">
                        {model.quant}
                      </span>
                      <span
                        className={`mono text-[9px] ${
                          isLoaded ? 'text-[var(--success)]' : 'text-[var(--muted)]'
                        }`}
                      >
                        ● {isLoaded ? 'LOADED' : 'AVAILABLE'}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 mono text-[10px] text-[var(--muted)]">
                      <span>{formatBytes(model.size)}</span>
                      <span>{model.context.toLocaleString()} ctx</span>
                      <span className="break-all">{model.path}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {isLoaded ? (
                      <button
                        onClick={() => void handleUnload(model)}
                        disabled={busy || busyId !== null}
                        className="flex items-center gap-1 border rule px-3 py-2 text-[9px] uppercase tracking-wider disabled:opacity-50"
                      >
                        <Square size={11} />
                        Unload
                      </button>
                    ) : (
                      <button
                        onClick={() => void handleLoad(model)}
                        disabled={busy || busyId !== null || running}
                        title={
                          running
                            ? 'Unload the running model first'
                            : 'Load this model'
                        }
                        className="flex items-center gap-1 border rule px-3 py-2 text-[9px] uppercase tracking-wider disabled:opacity-50"
                      >
                        <Play size={11} />
                        Load
                      </button>
                    )}

                    <button
                      onClick={() => useInChat(model)}
                      disabled={busy}
                      className="border rule px-3 py-2 text-[9px] uppercase tracking-wider disabled:opacity-50"
                    >
                      Use in chat
                    </button>

                    <button
                      onClick={() => void handleDelete(model)}
                      disabled={busy || isLoaded}
                      title={isLoaded ? 'Unload before deleting' : 'Delete model'}
                      className="flex items-center gap-1 border rule px-3 py-2 text-[9px] uppercase tracking-wider text-[var(--muted)] hover:text-[var(--error)] disabled:opacity-50"
                    >
                      <Trash2 size={11} />
                      Delete
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 p-5">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto border rule bg-[var(--bg)] shadow-xl">
            <div className="flex justify-between border-b rule p-6">
              <div>
                <div className="editorial-label">Model registry</div>
                <h2 className="mt-2 text-lg font-semibold">
                  {mode === 'download' ? 'Download a GGUF model' : 'Register a local file'}
                </h2>
              </div>
              <button
                onClick={closeModal}
                disabled={downloading}
                aria-label="Close"
                className="disabled:opacity-40"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 p-6">
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setMode('download')
                    setFormError('')
                  }}
                  disabled={downloading}
                  className={`flex-1 border rule px-3 py-2 text-[10px] uppercase tracking-wider ${
                    mode === 'download' ? 'bg-[var(--surface-2)]' : ''
                  }`}
                >
                  Hugging Face
                </button>
                <button
                  onClick={() => {
                    setMode('register')
                    setFormError('')
                  }}
                  disabled={downloading}
                  className={`flex-1 border rule px-3 py-2 text-[10px] uppercase tracking-wider ${
                    mode === 'register' ? 'bg-[var(--surface-2)]' : ''
                  }`}
                >
                  Existing file
                </button>
              </div>

              {mode === 'download' ? (
                <>
                  <label className="block">
                    <span className="editorial-label">Repository</span>
                    <input
                      value={repoId}
                      onChange={(event) => setRepoId(event.target.value)}
                      disabled={downloading}
                      className="mt-2 w-full border rule bg-transparent px-3 py-3 mono text-xs outline-none disabled:opacity-50"
                      placeholder="owner/repository"
                    />
                  </label>

                  <label className="block">
                    <span className="editorial-label">GGUF filename</span>
                    <input
                      value={filename}
                      onChange={(event) => setFilename(event.target.value)}
                      disabled={downloading}
                      className="mt-2 w-full border rule bg-transparent px-3 py-3 mono text-xs outline-none disabled:opacity-50"
                      placeholder="model-Q4_K_M.gguf"
                    />
                  </label>
                </>
              ) : (
                <>
                  <label className="block">
                    <span className="editorial-label">Path inside models directory</span>
                    <input
                      value={localPath}
                      onChange={(event) => setLocalPath(event.target.value)}
                      disabled={downloading}
                      className="mt-2 w-full border rule bg-transparent px-3 py-3 mono text-xs outline-none disabled:opacity-50"
                      placeholder="my-model-Q4_K_M.gguf"
                    />
                  </label>

                  <label className="block">
                    <span className="editorial-label">Display name (optional)</span>
                    <input
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      disabled={downloading}
                      className="mt-2 w-full border rule bg-transparent px-3 py-3 mono text-xs outline-none disabled:opacity-50"
                      placeholder="My local model"
                    />
                  </label>
                </>
              )}

              <label className="block">
                <span className="editorial-label">Context window</span>
                <input
                  value={context}
                  onChange={(event) => setContext(event.target.value)}
                  disabled={downloading}
                  inputMode="numeric"
                  className="mt-2 w-full border rule bg-transparent px-3 py-3 mono text-xs outline-none disabled:opacity-50"
                />
              </label>

              {mode === 'download' && progress && (
                <div className="border rule p-4">
                  <div className="flex justify-between mono text-[10px]">
                    <span>{progress.status.toUpperCase()}</span>
                    <span>
                      {progress.percent === null
                        ? formatBytes(progress.downloaded)
                        : `${progress.percent.toFixed(1)}%`}
                    </span>
                  </div>
                  <div className="progress mt-2">
                    <span style={{ width: `${progress.percent ?? 0}%` }} />
                  </div>
                  <div className="mt-2 mono text-[10px] text-[var(--muted)]">
                    {formatBytes(progress.downloaded)}
                    {progress.total ? ` / ${formatBytes(progress.total)}` : ''}
                  </div>
                  {progress.status === 'completed' && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-[var(--success)]">
                      <CheckCircle2 size={13} />
                      Downloaded and registered.
                    </div>
                  )}
                </div>
              )}

              {formError && (
                <p className="border rule p-3 text-xs text-[var(--error)]">
                  {formError}
                </p>
              )}

              <div className="flex gap-2">
                {mode === 'download' ? (
                  <button
                    onClick={() => void startDownload()}
                    disabled={downloading}
                    className="flex flex-1 items-center justify-center gap-2 bg-[var(--accent)] px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--bg)] disabled:opacity-50"
                  >
                    <Download size={13} />
                    {downloading ? 'Downloading…' : 'Start download'}
                  </button>
                ) : (
                  <button
                    onClick={() => void submitRegister()}
                    disabled={downloading}
                    className="flex flex-1 items-center justify-center gap-2 bg-[var(--accent)] px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--bg)] disabled:opacity-50"
                  >
                    <Plus size={13} />
                    {downloading ? 'Registering…' : 'Register model'}
                  </button>
                )}

                <button
                  onClick={closeModal}
                  disabled={downloading}
                  className="border rule px-4 py-3 text-[10px] uppercase tracking-wider disabled:opacity-40"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
