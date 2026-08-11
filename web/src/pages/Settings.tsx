import { useState } from 'react'
import {
  ShieldCheck,
  Trash2,
} from 'lucide-react'

import { PageHeader } from '@/components/ui/PageHeader'

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

export default function Settings() {
  const [stream, setStream] = useState(true)
  const [temp, setTemp] = useState(0.7)
  const [top, setTop] = useState(0.9)
  const [max, setMax] = useState(2048)

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
          <div className="editorial-label mb-2">
            General
          </div>

          <Row label="Theme">
            <span className="mono text-xs text-[var(--muted)]">
              Use sidebar toggle
            </span>
          </Row>

          <Row label="Default model">
            <select className="border rule bg-transparent px-3 py-2 mono text-xs">
              <option>Qwen3 8B</option>
              <option>Llama 3</option>
            </select>
          </Row>

          <Row label="Language">
            <span className="mono text-xs">
              English
            </span>
          </Row>

          <Row label="Streaming responses">
            <button
              onClick={() => setStream(!stream)}
              className={`h-5 w-9 p-1 ${
                stream
                  ? 'bg-[var(--accent)]'
                  : 'bg-[var(--surface-2)]'
              }`}
            >
              <span
                className={`block h-3 w-3 bg-[var(--bg)] transition-transform ${
                  stream ? 'translate-x-4' : ''
                }`}
              />
            </button>
          </Row>
        </section>

        {/* Inference */}
        <section className="mt-12">
          <div className="editorial-label mb-2">
            Inference
          </div>

          <Row label={`Temperature · ${temp}`}>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={temp}
              onChange={(e) => setTemp(+e.target.value)}
              className="accent-[var(--accent)]"
            />
          </Row>

          <Row label={`Top P · ${top}`}>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={top}
              onChange={(e) => setTop(+e.target.value)}
              className="accent-[var(--accent)]"
            />
          </Row>

          <Row label={`Maximum tokens · ${max}`}>
            <input
              type="range"
              min="256"
              max="8192"
              step="256"
              value={max}
              onChange={(e) => setMax(+e.target.value)}
              className="accent-[var(--accent)]"
            />
          </Row>

          <Row label="Context length">
            <span className="mono text-xs">
              32,768
            </span>
          </Row>
        </section>

        {/* Local processing */}
        <section className="mt-12 border rule bg-[var(--surface)] p-6">
          <div className="flex gap-4">
            <ShieldCheck
              size={19}
              className="mt-0.5 text-[var(--accent)]"
            />

            <div>
              <div className="font-semibold">
                LOCAL PROCESSING
              </div>

              <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">
                Your prompts, documents, and conversations are
                processed on this device.
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
          <div className="editorial-label mb-2">
            Storage
          </div>

          {[
            'CLEAR CHAT HISTORY',
            'CLEAR INDEXED DOCUMENTS',
            'CLEAR LOCAL CACHE',
          ].map((x) => (
            <button
              key={x}
              onClick={() =>
                confirm(
                  `Confirm ${x.toLowerCase()}?`,
                )
              }
              className="flex w-full items-center justify-between border-b rule py-4 text-left text-sm hover:text-[var(--error)]"
            >
              <span>{x}</span>
              <Trash2 size={14} />
            </button>
          ))}
        </section>
      </div>
    </div>
  )
}