import { useRef, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Paperclip,
  Play,
  Square,
  Copy,
  RotateCcw,
  Trash2,
  Download,
  ChevronDown,
} from 'lucide-react'

import {
  getRuntimeStatus,
  listModels,
  loadModel,
  sendChatStream,
  unloadModel,
} from '@/lib/api'
import type { ChatMessage, RegisteredModel, RuntimeStatus } from '@/types'
import { MessageContent } from '@/components/chat/MessageContent'
import { usePersistedSettings } from '@/store/settingsStore'

const SELECTED_MODEL_KEY = 'offline-llm-selected-model'

export function ChatWorkspace() {
  const { temperature, maxTokens } = usePersistedSettings()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [generating, setGenerating] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [models, setModels] = useState<RegisteredModel[]>([])
  const [selectedModelId, setSelectedModelId] = useState('')
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null)
  const [registryLoaded, setRegistryLoaded] = useState(false)
  const [error, setError] = useState('')

  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadRegistry = async () => {
      try {
        const [registered, status] = await Promise.all([
          listModels(),
          getRuntimeStatus(),
        ])
        if (cancelled) return

        setModels(registered)
        setRuntime(status)

        const stored = localStorage.getItem(SELECTED_MODEL_KEY)
        const next =
          registered.find((model) => model.id === stored)?.id ??
          registered[0]?.id ??
          ''
        setSelectedModelId(next)
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Could not load the model registry.',
          )
        }
      } finally {
        if (!cancelled) setRegistryLoaded(true)
      }
    }

    void loadRegistry()
    return () => {
      cancelled = true
    }
  }, [])

  const selectModel = (id: string) => {
    setSelectedModelId(id)
    if (id) localStorage.setItem(SELECTED_MODEL_KEY, id)
    else localStorage.removeItem(SELECTED_MODEL_KEY)
  }

  const selectedModel =
    models.find((model) => model.id === selectedModelId) ?? null

  /**
   * Make sure the model chosen in the UI is the one llama-server is serving.
   * Switching models unloads the previous managed instance first.
   */
  const ensureModelLoaded = async (): Promise<void> => {
    if (!selectedModelId) {
      throw new Error(
        'No model is selected. Download or register a model on the Models page first.',
      )
    }

    const status = await getRuntimeStatus()
    setRuntime(status)

    if (status.status === 'running' && status.model_id === selectedModelId) {
      return
    }

    if (status.status === 'starting' || status.status === 'stopping') {
      throw new Error('A model is starting or stopping. Try again shortly.')
    }

    if (status.status === 'running' && status.model_id) {
      await unloadModel(status.model_id)
    }

    setPreparing(true)
    try {
      const loaded = await loadModel(selectedModelId)
      setRuntime(loaded)
    } finally {
      setPreparing(false)
    }
  }

  const send = async (
    promptOverride?: string,
    historyOverride?: ChatMessage[],
  ) => {
    const prompt = (promptOverride ?? input).trim()

    if (!prompt || generating) return

    const now = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })

    const userMessage: ChatMessage = {
      role: 'USER',
      text: prompt,
      time: now,
    }

    const conversationHistory = historyOverride ?? messages
    const nextMessages = [...conversationHistory, userMessage]

    setMessages([
      ...nextMessages,
      { role: 'ASSISTANT', text: '', time: now },
    ])

    setInput('')
    setGenerating(true)
    setError('')

    // Create abort controller for this generation request
    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      // Make sure the selected model is the one actually serving requests.
      await ensureModelLoaded()

      const contentChunks: string[] = []

      for await (const delta of sendChatStream(
        nextMessages,
        {
          temperature,
          max_tokens: maxTokens,
          model_id: selectedModelId,
        },
        controller.signal,
      )) {
        contentChunks.push(delta)

        setMessages((current) => {
          const updated = [...current]
          const last = updated.length - 1

          if (last >= 0 && updated[last].role === 'ASSISTANT') {
            updated[last] = {
              ...updated[last],
              text: contentChunks.join(''),
            }
          }

          return updated
        })
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setMessages((current) => {
          const updated = [...current]
          const last = updated.length - 1

          if (last >= 0 && updated[last].role === 'ASSISTANT') {
            updated[last] = {
              ...updated[last],
              text: updated[last].text || 'Generation stopped',
            }
          }

          return updated
        })
      } else {
        setError(
          err instanceof Error ? err.message : 'An unknown error occurred.',
        )
        setMessages((current) => {
          const last = current.length - 1
          if (
            last >= 0 &&
            current[last].role === 'ASSISTANT' &&
            !current[last].text
          ) {
            return current.slice(0, last)
          }
          return current
        })
      }
    } finally {
      abortControllerRef.current = null
      setPreparing(false)
      setGenerating(false)
    }
  }

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text)
  }

  const regenerate = (assistantIndex: number) => {
    if (generating) return

    const userIndex = assistantIndex - 1
    const userMessage = messages[userIndex]

    if (userMessage?.role !== 'USER') return

    const history = messages.slice(0, userIndex)
    void send(userMessage.text, history)
  }

  const clearConversation = () => {
    if (generating) return
    setMessages([])
    setError('')
  }

  const exportConversation = () => {
    const text = messages
      .map((message) => `${message.role}: ${message.text}`)
      .join('\n\n')

    const blob = new Blob([text], {
      type: 'text/plain;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = 'offline-session.txt'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b rule px-7 py-5 lg:px-9">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="editorial-label">
              Workspace / Conversation
            </div>

            <h1 className="mt-2 text-xl font-semibold tracking-tight">
              Untitled Session
            </h1>

            <div className="mt-1 mono text-[10px] text-[var(--muted)]">
              {selectedModel
                ? `${selectedModel.quant} · ${selectedModel.context.toLocaleString()} ctx`
                : 'No model selected'}
              {runtime?.status === 'running' &&
              runtime.model_id === selectedModelId
                ? ' · LOADED'
                : ''}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                value={selectedModelId}
                onChange={(event) => selectModel(event.target.value)}
                disabled={generating || preparing || models.length === 0}
                className="max-w-[240px] appearance-none truncate border rule bg-transparent py-2 pl-3 pr-8 mono text-[11px] outline-none disabled:opacity-50"
              >
                {models.length === 0 ? (
                  <option value="">No models registered</option>
                ) : (
                  models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name} · {model.quant}
                    </option>
                  ))
                )}
              </select>

              <ChevronDown
                size={13}
                className="pointer-events-none absolute right-2 top-2.5 text-[var(--muted)]"
              />
            </div>

            <button
              title="Clear conversation"
              onClick={clearConversation}
              disabled={generating || preparing}
              className="grid h-8 w-8 place-items-center border rule text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-50"
            >
              <Trash2 size={14} />
            </button>

            <button
              title="Export conversation"
              onClick={exportConversation}
              className="hidden h-8 items-center gap-2 border rule px-3 text-[10px] uppercase tracking-wider sm:flex"
            >
              <Download size={13} />
              Export
            </button>
          </div>
        </div>
      </header>

      {registryLoaded && models.length === 0 && (
        <div className="border-b rule bg-[var(--surface)] px-7 py-3 text-xs text-[var(--muted)] lg:px-9">
          No models registered. Open the{' '}
          <Link to="/models" className="underline">
            Models
          </Link>{' '}
          page to download or register a GGUF file.
        </div>
      )}

      <section className="flex-1 px-7 py-10 lg:px-14">
        {messages.length === 0 ? (
          <Empty />
        ) : (
          <div className="mx-auto max-w-3xl">
            {messages.map((message, index) => (
              <article
                key={index}
                className="fade-in border-b rule py-7 first:pt-0"
              >
                <div className="mb-3 flex justify-between">
                  <div className="editorial-label">
                    {message.role}
                  </div>

                  <span className="mono text-[10px] text-[var(--muted)]">
                    {message.time}
                  </span>
                </div>

                <MessageContent content={message.text} className="prose-local whitespace-pre-wrap text-[15px] leading-7" />

                {message.role === 'ASSISTANT' && message.text && (
                  <div className="mt-5 flex gap-2">
                    <button
                      onClick={() => copy(message.text)}
                      className="flex items-center gap-1 border rule px-2 py-1 text-[9px] tracking-wider text-[var(--muted)]"
                    >
                      <Copy size={11} />
                      COPY
                    </button>

                    <button
                      onClick={() => regenerate(index)}
                      disabled={generating}
                      className="flex items-center gap-1 border rule px-2 py-1 text-[9px] tracking-wider text-[var(--muted)] disabled:opacity-50"
                    >
                      <RotateCcw size={11} />
                      REGENERATE
                    </button>
                  </div>
                )}

                {generating && message.role === 'ASSISTANT' && !message.text && (
                  <div className="mt-5 text-sm text-[var(--muted)]">
                    {preparing ? 'Loading model…' : 'Generating...'}
                  </div>
                )}
              </article>
            ))}

            {generating && (
              <div className="mt-6 mono text-[10px] text-[var(--accent)]">
                {selectedModel?.name ?? 'No model'} ·{' '}
                <span className="inline-block animate-pulse">
                  {preparing ? 'LOADING MODEL' : '● GENERATING'}
                </span>
              </div>
            )}
          </div>
        )}
      </section>

      <div className="sticky bottom-0 bg-[var(--bg)] px-7 pb-6 pt-2 lg:px-14">
        <div className="mx-auto max-w-3xl border rule bg-[var(--surface)]">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void send()
              }
            }}
            rows={3}
            placeholder="Write a prompt..."
            className="w-full resize-none bg-transparent p-4 text-sm outline-none placeholder:text-[var(--muted)]"
          />

          <div className="flex items-center justify-between border-t rule px-3 py-2">
            <div className="flex items-center gap-3">
              <button
                title="Attach document"
                onClick={() => {
                  setError('Document attachment is not implemented yet.')
                }}
                className="grid h-7 w-7 place-items-center text-[var(--muted)] hover:text-[var(--text)]"
              >
                <Paperclip size={15} />
              </button>

              <span className="hidden mono text-[9px] text-[var(--muted)] sm:inline">
                SHIFT + ENTER&nbsp; NEW LINE
              </span>

              <span className="hidden mono text-[9px] text-[var(--muted)] sm:inline">
                ENTER&nbsp; RUN
              </span>
            </div>

            {generating ? (
              <button
                onClick={stopGeneration}
                className="flex items-center gap-2 bg-[var(--text)] px-3 py-1.5 text-[10px] text-[var(--bg)]"
              >
                <Square size={11} fill="currentColor" />
                STOP
              </button>
            ) : (
              <button
                onClick={() => void send()}
                disabled={!input.trim()}
                className="flex items-center gap-2 bg-[var(--accent)] px-3 py-1.5 text-[10px] text-[var(--bg)] disabled:opacity-50"
              >
                <Play size={11} fill="currentColor" />
                RUN
              </button>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="border-t rule px-4 py-2 text-xs text-red-500"
            >
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Empty() {
  return (
    <div className="mx-auto max-w-3xl pt-12 lg:pt-20">
      <div className="editorial-label">Private runtime</div>

      <h2 className="mt-3 text-4xl font-semibold leading-[.95] tracking-[-.045em] sm:text-6xl">
        LOCAL
        <br />
        INTELLIGENCE
      </h2>

      <p className="mt-7 max-w-lg text-sm leading-6 text-[var(--muted)]">
        A private language model running entirely on this machine.
      </p>

      <div className="mt-12 border-t rule">
        {[
          ['01', 'SUMMARIZE', 'Summarize a document or long-form text'],
          ['02', 'ANALYZE', 'Examine arguments, concepts, or technical material'],
          ['03', 'WRITE', 'Draft, rewrite, or improve text'],
          ['04', 'ASK', 'Query the local language model'],
        ].map((item) => (
          <div
            key={item[0]}
            className="grid grid-cols-[34px_130px_1fr] items-center gap-4 border-b rule py-5 text-sm"
          >
            <span className="mono text-[10px] text-[var(--muted)]">
              {item[0]}
            </span>
            <span className="mono text-[10px]">{item[1]}</span>
            <span className="text-[var(--muted)]">{item[2]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}