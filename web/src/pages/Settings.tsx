import { useEffect, useState } from 'react'
import { LoaderCircle, ShieldCheck, Trash2 } from 'lucide-react'

import { PageHeader } from '@/components/ui/PageHeader'
import {
  clearAllConversations,
  getCapabilities,
  listModels,
} from '@/lib/api'
import type { RegisteredModel, SystemCapabilities } from '@/types'
import {
  MAX_MAX_TOKENS,
  MAX_TEMPERATURE,
  MAX_TOP_P,
  MAX_TOKENS_STEP,
  MIN_MAX_TOKENS,
  MIN_TEMPERATURE,
  MIN_TOP_P,
  getSettings,
  updateSettings,
  useSettings,
} from '@/store/settingsStore'

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-5 border-b rule py-5">
      <span className="text-sm">{label}</span>
      {children}
    </div>
  )
}

function StorageAction({
  label,
  description,
  disabled,
  busy,
  onClick,
}: {
  label: string
  description?: string | null
  disabled?: boolean
  busy?: boolean
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      className="flex w-full items-start justify-between gap-4 border-b rule py-4 text-left text-sm hover:text-[var(--error)] disabled:cursor-not-allowed disabled:text-[var(--muted)] disabled:hover:text-[var(--muted)]"
    >
      <span className="min-w-0">
        <span className="block">{label}</span>
        {description && (
          <span className="mt-1 block text-xs text-[var(--muted)]">
            {description}
          </span>
        )}
      </span>

      {busy ? (
        <LoaderCircle size={14} className="mt-0.5 shrink-0 animate-spin" />
      ) : (
        <Trash2 size={14} className="mt-0.5 shrink-0" />
      )}
    </button>
  )
}

export default function Settings() {
  const settings = useSettings()

  const [models, setModels] = useState<RegisteredModel[]>([])
  const [capabilities, setCapabilities] = useState<SystemCapabilities | null>(
    null,
  )
  const [clearing, setClearing] = useState(false)
  const [notice, setNotice] = useState<{
    kind: 'success' | 'error'
    text: string
  } | null>(null)

  useEffect(() => {
    let cancelled = false

    listModels()
      .then((registered) => {
        if (cancelled) return
        setModels(registered)

        const preferred = getSettings().defaultModelId
        if (!registered.some((model) => model.id === preferred)) {
          updateSettings({ defaultModelId: registered[0]?.id ?? '' })
        }
      })
      .catch(() => undefined)

    getCapabilities()
      .then((result) => {
        if (!cancelled) setCapabilities(result)
      })
      .catch(() => {
        // Keep unsupported actions disabled when capability discovery fails.
        if (!cancelled) setCapabilities(null)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const selectedModel =
    models.find((model) => model.id === settings.defaultModelId) ?? null

  const clearHistorySupported =
    capabilities?.clear_history.supported ?? true

  const clearHistory = async () => {
    if (
      !window.confirm(
        'Delete every saved conversation and message? This cannot be undone.',
      )
    ) {
      return
    }

    setClearing(true)
    setNotice(null)

    try {
      const result = await clearAllConversations()
      setNotice({
        kind: 'success',
        text:
          result.deleted === 1
            ? 'Deleted 1 conversation.'
            : `Deleted ${result.deleted} conversations.`,
      })
    } catch (error) {
      setNotice({
        kind: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Could not clear the chat history.',
      })
    } finally {
      setClearing(false)
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Configuration"
        title="SETTINGS"
        subtitle="Control local inference and storage behavior."
      />

      <div className="max-w-4xl px-7 py-8 lg:px-10">
        {/* General */}
        <section>
          <div className="editorial-label mb-2">General</div>

          <Row label="Theme">
            <span className="mono text-xs text-[var(--muted)]">
              Use sidebar toggle
            </span>
          </Row>

          <Row label="Default model">
            <select
              aria-label="Default model"
              value={settings.defaultModelId}
              onChange={(event) =>
                updateSettings({ defaultModelId: event.target.value })
              }
              disabled={models.length === 0}
              className="max-w-[240px] border rule bg-transparent px-3 py-2 mono text-xs disabled:opacity-50"
            >
              {models.length === 0 ? (
                <option value="">No models registered</option>
              ) : (
                models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))
              )}
            </select>
          </Row>

          <Row label="Language">
            <span className="mono text-xs">English</span>
          </Row>

          <Row label="Streaming responses">
            <button
              type="button"
              role="switch"
              aria-checked={settings.streaming}
              aria-label="Streaming responses"
              onClick={() =>
                updateSettings({ streaming: !settings.streaming })
              }
              className={`h-5 w-9 p-1 ${
                settings.streaming
                  ? 'bg-[var(--accent)]'
                  : 'bg-[var(--surface-2)]'
              }`}
            >
              <span
                className={`block h-3 w-3 bg-[var(--bg)] transition-transform ${
                  settings.streaming ? 'translate-x-4' : ''
                }`}
              />
            </button>
          </Row>
        </section>

        {/* Inference */}
        <section className="mt-12">
          <div className="editorial-label mb-2">Inference</div>

          <Row label={`Temperature · ${settings.temperature}`}>
            <input
              aria-label="Temperature"
              type="range"
              min={MIN_TEMPERATURE}
              max={MAX_TEMPERATURE}
              step="0.1"
              value={settings.temperature}
              onChange={(event) =>
                updateSettings({ temperature: +event.target.value })
              }
              className="accent-[var(--accent)]"
            />
          </Row>

          <Row label={`Top P · ${settings.topP}`}>
            <input
              aria-label="Top P"
              type="range"
              min={MIN_TOP_P}
              max={MAX_TOP_P}
              step="0.05"
              value={settings.topP}
              onChange={(event) =>
                updateSettings({ topP: +event.target.value })
              }
              className="accent-[var(--accent)]"
            />
          </Row>

          <Row
            label={`Maximum tokens · ${settings.maxTokens.toLocaleString()}`}
          >
            <input
              aria-label="Maximum tokens"
              type="range"
              min={MIN_MAX_TOKENS}
              max={MAX_MAX_TOKENS}
              step={MAX_TOKENS_STEP}
              value={settings.maxTokens}
              onChange={(event) =>
                updateSettings({ maxTokens: +event.target.value })
              }
              className="accent-[var(--accent)]"
            />
          </Row>

          <Row label="Context length">
            <span className="mono text-xs">
              {selectedModel
                ? selectedModel.context.toLocaleString()
                : '—'}
            </span>
          </Row>
        </section>

        {/* Local processing */}
        <section className="mt-12 border rule bg-[var(--surface)] p-6">
          <div className="flex gap-4">
            <ShieldCheck size={19} className="mt-0.5 text-[var(--accent)]" />

            <div>
              <div className="font-semibold">LOCAL PROCESSING</div>

              <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">
                Your prompts, documents, and conversations are processed on this
                device.
              </p>

              <div className="mt-4 flex flex-wrap gap-4 mono text-[10px] text-[var(--success)]">
                <span>✓ NO CLOUD API</span>
                <span>✓ NO EXTERNAL AI SERVICE</span>
                <span>✓ LOCAL INFERENCE</span>
              </div>
            </div>
          </div>
        </section>

        {/* Storage */}
        <section className="mt-12">
          <div className="editorial-label mb-2">Storage</div>

          <StorageAction
            label="CLEAR CHAT HISTORY"
            description="Delete every saved conversation and message."
            disabled={!clearHistorySupported}
            busy={clearing}
            onClick={() => void clearHistory()}
          />

          <StorageAction
            label="CLEAR INDEXED DOCUMENTS"
            description={
              capabilities?.clear_documents.reason ??
              'Document indexing is not available in this build.'
            }
            disabled={!capabilities?.clear_documents.supported}
          />

          <StorageAction
            label="CLEAR LOCAL CACHE"
            description={
              capabilities?.clear_cache.reason ??
              'This backend does not manage a clearable cache.'
            }
            disabled={!capabilities?.clear_cache.supported}
          />

          {notice && (
            <p
              role="status"
              className={`mt-5 text-sm ${
                notice.kind === 'success'
                  ? 'text-[var(--success)]'
                  : 'text-[var(--error)]'
              }`}
            >
              {notice.text}
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
