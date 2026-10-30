import { useState, useEffect } from 'react'
import { Search, Trash2, Download, Pencil } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'

export default function Conversations() {
  const [q, setQ] = useState('')
  const [items, setItems] = useState<{id: string; title: string; created_at?: string}[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    fetchConversations()
  }, [])

  const fetchConversations = async () => {
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/chat/conversations`,
        { credentials: 'include' }
      )
      if (!resp.ok) throw new Error('Failed')
      const data = await resp.json()
      setItems(data)
    } catch (err) {
      setError('Failed to load conversations')
      setItems([])
    }
  }

  const deleteConversation = async (title: string) => {
    if (!window.confirm(`Delete "${title}"?`)) return
    try {
      await fetch(
        `${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/chat/conversations`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        }
      )
      fetchConversations()
    } catch (err) {
      setError('Failed to delete')
    }
  }

  const groups = ['TODAY', 'YESTERDAY', 'PREVIOUS 7 DAYS']

  return (
    <div>
      <PageHeader eyebrow="History" title="CONVERSATIONS" subtitle="Local session history" />
      <div className="px-7 py-8 lg:px-10">
        <div className="flex max-w-xl items-center gap-3 border-b rule pb-3">
          <Search size={15} className="text-[var(--muted)]" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search conversations..."
            className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
          />
        </div>

        {error && (
          <div className="border rule p-5 text-sm">
            <p className="text-[var(--error)]">{error}</p>
          </div>
        )}

        <div className="mt-10">
          {groups.map((g) => (
            <div key={g} className="mb-9">
              <div className="editorial-label mb-3">{g}</div>
              {items.length > 0 ? (
                items
                  .filter((x) => x.title.toLowerCase().includes(q.toLowerCase()))
                  .map((x) => (
                    <div
                      key={x.id}
                      className="group flex items-center justify-between border-t rule py-4"
                    >
                      <div>
                        <div className="text-sm font-medium">{x.title}</div>
                        <div className="mt-1 mono text-[10px] text-[var(--muted)]">
                          {x.created_at ? new Date(x.created_at).toLocaleDateString() : '—'}
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                        <button
                          title="Delete"
                          onClick={() => deleteConversation(x.title)}
                          className="p-2 text-[var(--muted)]"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))
              ) : (
                <p className="text-[var(--muted)] px-4 py-8">No conversations yet</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
