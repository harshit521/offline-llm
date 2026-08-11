import { useState } from 'react'
import {
  Search,
  Trash2,
  Download,
  Pencil,
} from 'lucide-react'

import { conversations as initial } from '@/lib/mock'
import { PageHeader } from '@/components/ui/PageHeader'

export default function Conversations() {
  const [q, setQ] = useState('')
  const [items, setItems] = useState(initial)

  const groups = [
    'TODAY',
    'YESTERDAY',
    'PREVIOUS 7 DAYS',
  ]

  return (
    <div>
      <PageHeader
        eyebrow="History"
        title="CONVERSATIONS"
        subtitle="Local session history stored on this device."
      />

      <div className="px-7 py-8 lg:px-10">
        {/* Search */}
        <div className="flex max-w-xl items-center gap-3 border-b rule pb-3">
          <Search
            size={15}
            className="text-[var(--muted)]"
          />

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search conversations..."
            className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
          />
        </div>

        {/* Conversation groups */}
        <div className="mt-10 max-w-4xl">
          {groups.map((g, gi) => (
            <section
              key={g}
              className="mb-9"
            >
              <div className="editorial-label mb-3">
                {g}
              </div>

              {items
                .filter((x) =>
                  x.title
                    .toLowerCase()
                    .includes(q.toLowerCase()),
                )
                .slice(
                  gi ? 3 : 0,
                  gi ? items.length : 3,
                )
                .map((x) => (
                  <div
                    key={x.title}
                    className="group flex items-center justify-between border-t rule py-4"
                  >
                    <div>
                      <div className="text-sm font-medium">
                        {x.title}
                      </div>

                      <div className="mt-1 mono text-[10px] text-[var(--muted)]">
                        {x.time}
                      </div>
                    </div>

                    <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                      <button
                        title="Rename"
                        className="p-2 text-[var(--muted)]"
                      >
                        <Pencil size={13} />
                      </button>

                      <button
                        title="Export"
                        className="p-2 text-[var(--muted)]"
                      >
                        <Download size={13} />
                      </button>

                      <button
                        title="Delete"
                        onClick={() =>
                          setItems((a) =>
                            a.filter(
                              (y) => y.title !== x.title,
                            ),
                          )
                        }
                        className="p-2 text-[var(--muted)] hover:text-[var(--error)]"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}