import { useState } from 'react'
import {
  FilePlus2,
  Trash2,
  RotateCcw,
  Eye,
  X,
  Check,
  LoaderCircle,
} from 'lucide-react'

import { documents as initial } from '@/lib/mock'
import { PageHeader } from '@/components/ui/PageHeader'

export default function Documents() {
  const [docs, setDocs] = useState(initial)
  const [selected, setSelected] = useState<
    (typeof initial)[number] | null
  >(null)

  const add = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]

    if (!f) return

    setDocs((d) => [
      {
        name: f.name,
        type: f.name.split('.').pop()?.toUpperCase() || 'FILE',
        size: `${Math.max(1, Math.round(f.size / 1024))} KB`,
        status: 'PROCESSING',
        added: 'Just now',
        pages: '—',
        chunks: 0,
        embedding: 'all-MiniLM-L6-v2',
      },
      ...d,
    ])
  }

  return (
    <div>
      <PageHeader
        eyebrow="Knowledge base"
        title="DOCUMENTS"
        subtitle="Local knowledge base — files are indexed on this device."
        action={
          <label className="flex cursor-pointer items-center gap-2 border rule px-3 py-2 text-[10px] uppercase tracking-wider hover:bg-[var(--surface)]">
            <FilePlus2 size={14} />
            Add document

            <input
              type="file"
              className="hidden"
              accept=".pdf,.txt,.docx,.md"
              onChange={add}
            />
          </label>
        }
      />

      <div className="px-7 py-8 lg:px-10">
        {/* Upload area */}
        <label className="flex cursor-pointer items-center justify-between border rule bg-[var(--surface)] px-5 py-5 hover:bg-[var(--surface-2)]">
          <div>
            <div className="text-sm font-semibold">
              Drop files here or browse
            </div>

            <div className="mt-1 mono text-[10px] text-[var(--muted)]">
              PDF / TXT / DOCX / MD
            </div>
          </div>

          <span className="editorial-label">
            + ADD DOCUMENT
          </span>

          <input
            type="file"
            className="hidden"
            accept=".pdf,.txt,.docx,.md"
            onChange={add}
          />
        </label>

        {/* Documents table */}
        <div className="mt-9 overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b rule">
                <th className="pb-3 font-normal editorial-label">
                  Name
                </th>
                <th className="pb-3 font-normal editorial-label">
                  Type
                </th>
                <th className="pb-3 font-normal editorial-label">
                  Size
                </th>
                <th className="pb-3 font-normal editorial-label">
                  Status
                </th>
                <th className="pb-3 font-normal editorial-label">
                  Added
                </th>
                <th />
              </tr>
            </thead>

            <tbody>
              {docs.map((d, i) => (
                <tr
                  key={`${d.name}-${i}`}
                  className="group border-b rule hover:bg-[var(--surface)]"
                >
                  <td className="py-4">
                    <button
                      onClick={() => setSelected(d)}
                      className="flex items-center gap-3 text-left"
                    >
                      <span className="mono text-[10px] text-[var(--muted)]">
                        {String(i + 1).padStart(2, '0')}
                      </span>

                      <span className="font-medium">
                        {d.name}
                      </span>
                    </button>
                  </td>

                  <td className="py-4 mono text-[10px] text-[var(--muted)]">
                    {d.type}
                  </td>

                  <td className="py-4 mono text-[10px] text-[var(--muted)]">
                    {d.size}
                  </td>

                  <td className="py-4">
                    <span
                      className={`inline-flex items-center gap-1.5 mono text-[10px] ${
                        d.status === 'INDEXED'
                          ? 'text-[var(--success)]'
                          : d.status === 'PROCESSING'
                            ? 'text-[var(--warning)]'
                            : 'text-[var(--error)]'
                      }`}
                    >
                      {d.status === 'PROCESSING' ? (
                        <LoaderCircle
                          size={11}
                          className="animate-spin"
                        />
                      ) : (
                        <span>
                          {d.status === 'INDEXED' ? '●' : '○'}
                        </span>
                      )}

                      {d.status}
                    </span>
                  </td>

                  <td className="py-4 mono text-[10px] text-[var(--muted)]">
                    {d.added}
                  </td>

                  <td className="py-4">
                    <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        title="Open"
                        onClick={() => setSelected(d)}
                        className="p-2 text-[var(--muted)] hover:text-[var(--text)]"
                      >
                        <Eye size={14} />
                      </button>

                      <button
                        title="Re-index"
                        className="p-2 text-[var(--muted)] hover:text-[var(--text)]"
                      >
                        <RotateCcw size={14} />
                      </button>

                      <button
                        title="Delete"
                        onClick={() =>
                          setDocs((x) =>
                            x.filter((_, n) => n !== i),
                          )
                        }
                        className="p-2 text-[var(--muted)] hover:text-[var(--error)]"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Document modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/20 p-5"
          onMouseDown={() => setSelected(null)}
        >
          <div
            className="w-full max-w-2xl border rule bg-[var(--bg)] shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-start justify-between border-b rule p-6">
              <div>
                <div className="editorial-label">
                  Document
                </div>

                <h2 className="mt-2 text-xl font-semibold">
                  {selected.name}
                </h2>
              </div>

              <button
                onClick={() => setSelected(null)}
              >
                <X size={18} />
              </button>
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-px bg-[var(--border)] sm:grid-cols-3">
              {[
                ['SIZE', selected.size],
                ['TYPE', selected.type],
                ['PAGES', String(selected.pages)],
                ['CHUNKS', String(selected.chunks)],
                ['EMBEDDING', selected.embedding],
                ['STATUS', selected.status],
              ].map((x) => (
                <div
                  key={x[0]}
                  className="bg-[var(--bg)] p-5"
                >
                  <div className="editorial-label">
                    {x[0]}
                  </div>

                  <div className="mt-2 mono text-xs">
                    {x[1]}
                  </div>
                </div>
              ))}
            </div>

            {/* Context / preview */}
            <div className="p-6">
              <div className="flex items-center justify-between border rule p-4">
                <div>
                  <div className="text-sm font-medium">
                    Use as context
                  </div>

                  <div className="mt-1 text-xs text-[var(--muted)]">
                    Allow this document in local retrieval.
                  </div>
                </div>

                <div className="h-5 w-9 bg-[var(--accent)] p-1">
                  <div className="ml-auto h-3 w-3 bg-[var(--bg)]" />
                </div>
              </div>

              <div className="mt-5 grid min-h-[160px] place-items-center border rule bg-[var(--surface)] text-xs text-[var(--muted)]">
                <Check size={15} />
                Preview available after backend integration
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}