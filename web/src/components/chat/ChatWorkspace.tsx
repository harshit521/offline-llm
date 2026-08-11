import { useState } from 'react'
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

type Msg = {
  role: 'USER' | 'ASSISTANT'
  text: string
  time: string
}

const seed: Msg[] = []

const response = `CAP theorem describes a constraint on distributed systems: when a network partition occurs, a system can guarantee **consistency** or **availability**, but not both at the same time.

A simple example is a distributed database with two nodes. If the nodes lose communication, a consistency-first design may refuse writes until they agree again. An availability-first design may keep accepting writes and reconcile them later.

The third property, partition tolerance, is generally treated as mandatory for distributed systems because network failures can happen independently of the application.`

export function ChatWorkspace() {
  const [messages, setMessages] = useState<Msg[]>(seed)
  const [input, setInput] = useState('')
  const [generating, setGenerating] = useState(false)
  const [model, setModel] = useState('Qwen3 8B')

  const send = () => {
    if (!input.trim() || generating) return

    const now = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })

    setMessages((m) => [
      ...m,
      {
        role: 'USER',
        text: input.trim(),
        time: now,
      },
    ])

    setInput('')
    setGenerating(true)

    setTimeout(() => {
      setMessages((m) => [
        ...m,
        {
          role: 'ASSISTANT',
          text: '',
          time: now,
        },
      ])

      let i = 0

      const timer = setInterval(() => {
        i += Math.max(8, Math.floor(response.length / 45))

        setMessages((m) => {
          const a = [...m]
          const last = a.length - 1

          if (last >= 0 && a[last].role === 'ASSISTANT') {
            a[last] = {
              ...a[last],
              text: response.slice(0, i),
            }
          }

          return a
        })

        if (i >= response.length) {
          clearInterval(timer)
          setGenerating(false)
        }
      }, 55)
    }, 450)
  }

  const copy = (t: string) => {
    navigator.clipboard?.writeText(t)
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b rule px-7 py-5 lg:px-9">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="editorial-label">
              Workspace / Conversation
            </div>

            <h1 className="mt-2 text-xl font-semibold tracking-tight">
              Untitled Session
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {/* Model selector */}
            <div className="relative">
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="appearance-none border rule bg-transparent py-2 pl-3 pr-8 mono text-[11px] outline-none"
              >
                <option>Qwen3 8B</option>
                <option>Llama 3</option>
              </select>

              <ChevronDown
                size={13}
                className="pointer-events-none absolute right-2 top-2.5 text-[var(--muted)]"
              />
            </div>

            {/* Clear conversation */}
            <button
              title="Clear conversation"
              onClick={() => setMessages([])}
              className="grid h-8 w-8 place-items-center border rule text-[var(--muted)] hover:text-[var(--text)]"
            >
              <Trash2 size={14} />
            </button>

            {/* Export conversation */}
            <button
              title="Export conversation"
              onClick={() => {
                const t = messages
                  .map((x) => `${x.role}: ${x.text}`)
                  .join('\n\n')

                const a = document.createElement('a')

                a.href = URL.createObjectURL(
                  new Blob([t], { type: 'text/plain' }),
                )

                a.download = 'offline-session.txt'
                a.click()
              }}
              className="hidden h-8 items-center gap-2 border rule px-3 text-[10px] uppercase tracking-wider sm:flex"
            >
              <Download size={13} />
              Export
            </button>
          </div>
        </div>
      </header>

      {/* Messages */}
      <section className="flex-1 px-7 py-10 lg:px-14">
        {messages.length === 0 ? (
          <Empty />
        ) : (
          <div className="mx-auto max-w-3xl">
            {messages.map((m, i) => (
              <article
                key={i}
                className="fade-in border-b rule py-7 first:pt-0"
              >
                <div className="mb-3 flex justify-between">
                  <div className="editorial-label">{m.role}</div>

                  <span className="mono text-[10px] text-[var(--muted)]">
                    {m.time}
                  </span>
                </div>

                <div className="prose-local whitespace-pre-wrap text-[15px] leading-7">
                  {m.text}
                </div>

                {m.role === 'ASSISTANT' && (
                  <div className="mt-5 flex gap-2">
                    <button
                      onClick={() => copy(m.text)}
                      className="flex items-center gap-1 border rule px-2 py-1 text-[9px] tracking-wider text-[var(--muted)]"
                    >
                      <Copy size={11} />
                      COPY
                    </button>

                    <button
                      onClick={() =>
                        setInput(
                          'Regenerate the previous answer with a clearer example.',
                        )
                      }
                      className="flex items-center gap-1 border rule px-2 py-1 text-[9px] tracking-wider text-[var(--muted)]"
                    >
                      <RotateCcw size={11} />
                      REGENERATE
                    </button>
                  </div>
                )}
              </article>
            ))}

            {generating && (
              <div className="mt-6 mono text-[10px] text-[var(--accent)]">
                ASSISTANT ·{' '}
                <span className="inline-block animate-pulse">
                  ● GENERATING
                </span>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Input */}
      <div className="sticky bottom-0 bg-[var(--bg)] px-7 pb-6 pt-2 lg:px-14">
        <div className="mx-auto max-w-3xl border rule bg-[var(--surface)]">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
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
                onClick={() => setGenerating(false)}
                className="flex items-center gap-2 bg-[var(--text)] px-3 py-1.5 text-[10px] text-[var(--bg)]"
              >
                <Square size={11} fill="currentColor" />
                STOP
              </button>
            ) : (
              <button
                onClick={send}
                className="flex items-center gap-2 bg-[var(--accent)] px-3 py-1.5 text-[10px] text-[var(--bg)]"
              >
                <Play size={11} fill="currentColor" />
                RUN
              </button>
            )}
          </div>
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
        ].map((x) => (
          <div
            key={x[0]}
            className="grid grid-cols-[34px_130px_1fr] items-center gap-4 border-b rule py-5 text-sm"
          >
            <span className="mono text-[10px] text-[var(--muted)]">
              {x[0]}
            </span>

            <span className="font-semibold tracking-wide">
              {x[1]}
            </span>

            <span className="text-[var(--muted)]">
              {x[2]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}