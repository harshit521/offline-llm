import {
  Activity,
  Database,
  Cpu,
  HardDrive,
  WifiOff,
  Server,
} from 'lucide-react'

import { PageHeader } from '@/components/ui/PageHeader'

const metrics = [
  ['CPU', '32%'],
  ['MEMORY', '8.4 GB'],
  ['GPU / MPS', 'ACTIVE'],
  ['TOKENS / SEC', '24'],
  ['CONTEXT', '8,192 / 32,768'],
]

export default function System() {
  return (
    <div>
      <PageHeader
        eyebrow="Local runtime status"
        title="SYSTEM"
        subtitle="A quiet view of the machine behind the model."
      />

      <div className="px-7 py-8 lg:px-10">
        {/* Runtime services */}
        <div className="grid border-t rule sm:grid-cols-2">
          {[
            [
              'INFERENCE ENGINE',
              'OLLAMA',
              'RUNNING',
              Server,
            ],
            [
              'API',
              'FASTAPI',
              'LOCALHOST:8000 · CONNECTED',
              Activity,
            ],
            [
              'VECTOR DATABASE',
              'CHROMADB',
              'READY',
              Database,
            ],
            [
              'MODEL',
              'QWEN3 8B',
              'LOADED',
              Cpu,
            ],
            [
              'NETWORK',
              'OFFLINE',
              'NO EXTERNAL CONNECTION REQUIRED',
              WifiOff,
            ],
            [
              'STORAGE',
              'MODEL STORAGE',
              '18.4 GB / 50 GB',
              HardDrive,
            ],
          ].map(([a, b, c, I]) => (
            <div
              key={String(a)}
              className="border-b rule p-7 sm:[&:nth-child(odd)]:border-r"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="editorial-label">
                    {a as string}
                  </div>

                  <div className="mt-3 mono text-sm">
                    {b as string}
                  </div>

                  <div className="mt-1 mono text-[10px] text-[var(--muted)]">
                    ● {c as string}
                  </div>
                </div>

                <I
                  size={17}
                  strokeWidth={1.3}
                  className="text-[var(--muted)]"
                />
              </div>

              {a === 'STORAGE' && (
                <div className="mt-5 progress">
                  <span style={{ width: '37%' }} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* System metrics */}
        <div className="mt-12">
          <div className="editorial-label mb-4">
            System metrics
          </div>

          <div className="grid grid-cols-2 gap-px border border-[var(--border)] bg-[var(--border)] sm:grid-cols-5">
            {metrics.map((x) => (
              <div
                key={x[0]}
                className="bg-[var(--bg)] p-5"
              >
                <div className="editorial-label">
                  {x[0]}
                </div>

                <div className="mt-3 mono text-lg">
                  {x[1]}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Architecture chains */}
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {/* Runtime chain */}
          <div className="border rule bg-[var(--surface)] p-6">
            <div className="editorial-label">
              Runtime chain
            </div>

            <div className="mt-5 mono text-xs leading-8">
              REACT (VITE)
              <br />
              ↓
              <br />
              FASTAPI
              <br />
              ↓
              <br />
              OLLAMA
              <br />
              ↓
              <br />
              LOCAL LLM
            </div>
          </div>

          {/* Retrieval chain */}
          <div className="border rule bg-[var(--surface)] p-6">
            <div className="editorial-label">
              Retrieval chain
            </div>

            <div className="mt-5 mono text-xs leading-8">
              DOCUMENTS
              <br />
              ↓
              <br />
              PROCESSING
              <br />
              ↓
              <br />
              EMBEDDINGS
              <br />
              ↓
              <br />
              CHROMADB
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}