import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Pencil, Plus, Search, Trash2, X } from 'lucide-react'

import { PageHeader } from '@/components/ui/PageHeader'
import {
  deleteConversation,
  listConversations,
  renameConversation,
} from '@/lib/api'
import type { ConversationSummary } from '@/types'

const DAY = 24 * 60 * 60 * 1000

interface Group {
  key: string
  label: string
  items: ConversationSummary[]
}

function startOfDay(date: Date): number {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy.getTime()
}

function conversationTime(conversation: ConversationSummary): number {
  const raw = conversation.updated_at ?? conversation.created_at
  const time = raw ? new Date(raw).getTime() : 0
  return Number.isNaN(time) ? 0 : time
}

function groupConversations(items: ConversationSummary[]): Group[] {
  const today = startOfDay(new Date())
  const yesterday = today - DAY
  const weekStart = today - 7 * DAY

  const buckets: Group[] = [
    { key: 'today', label: 'TODAY', items: [] },
    { key: 'yesterday', label: 'YESTERDAY', items: [] },
    { key: 'week', label: 'PREVIOUS 7 DAYS', items: [] },
    { key: 'older', label: 'OLDER', items: [] },
  ]

  for (const item of items) {
    const time = conversationTime(item)
    if (time >= today) buckets[0].items.push(item)
    else if (time >= yesterday) buckets[1].items.push(item)
    else if (time >= weekStart) buckets[2].items.push(item)
    else buckets[3].items.push(item)
  }

  return buckets.filter((bucket) => bucket.items.length > 0)
}

function formatDate(conversation: ConversationSummary): string {
  const raw = conversation.updated_at ?? conversation.created_at
  if (!raw) return '—'

  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export default function Conversations() {
  const navigate = useNavigate()

  const [items, setItems] = useState<ConversationSummary[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true)
    setError('')

    try {
      setItems(await listConversations())
    } catch (err) {
      setError(
        errorMessage(err, 'Could not load conversations from the backend.'),
      )
    } finally {
      if (showSpinner) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items

    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(needle) ||
        item.preview.toLowerCase().includes(needle),
    )
  }, [items, q])

  const groups = useMemo(() => groupConversations(filtered), [filtered])

  const openConversation = (id: string) => {
    navigate(`/workspace?conversation=${encodeURIComponent(id)}`)
  }

  const handleDelete = async (conversation: ConversationSummary) => {
    if (!window.confirm(`Delete "${conversation.title}"?`)) return

    setBusyId(conversation.id)
    setError('')

    try {
      await deleteConversation(conversation.id)
      setItems((current) =>
        current.filter((item) => item.id !== conversation.id),
      )
      if (renamingId === conversation.id) {
        setRenamingId(null)
        setRenameValue('')
      }
    } catch (err) {
      setError(errorMessage(err, 'Could not delete the conversation.'))
    } finally {
      setBusyId(null)
    }
  }

  const startRename = (conversation: ConversationSummary) => {
    setRenamingId(conversation.id)
    setRenameValue(conversation.title)
  }

  const cancelRename = () => {
    setRenamingId(null)
    setRenameValue('')
  }

  const submitRename = async (conversation: ConversationSummary) => {
    const title = renameValue.trim()
    if (!title || title === conversation.title) {
      cancelRename()
      return
    }

    setBusyId(conversation.id)
    setError('')

    try {
      const updated = await renameConversation(conversation.id, title)
      setItems((current) =>
        current.map((item) =>
          item.id === conversation.id
            ? {
                ...item,
                title: updated.title,
                updated_at: updated.updated_at,
              }
            : item,
        ),
      )
      cancelRename()
    } catch (err) {
      setError(errorMessage(err, 'Could not rename the conversation.'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="History"
        title="CONVERSATIONS"
        subtitle="Local session history"
        action={
          <button
            onClick={() => navigate('/workspace')}
            className="flex items-center gap-2 border rule px-3 py-2 text-[10px] uppercase tracking-wider"
          >
            <Plus size={14} />
            New chat
          </button>
        }
      />

      <div className="px-7 py-8 lg:px-10">
        <div className="flex max-w-xl items-center gap-3 border-b rule pb-3">
          <Search size={15} className="text-[var(--muted)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search conversations..."
            className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
          />
        </div>

        {error && (
          <div className="mt-6 border rule p-5 text-sm">
            <p className="text-[var(--error)]">{error}</p>
          </div>
        )}

        {loading && (
          <p className="mt-10 text-sm text-[var(--muted)]">
            Loading conversations…
          </p>
        )}

        {!loading && items.length === 0 && (
          <div className="mt-10 border rule p-8">
            <div className="editorial-label">Empty history</div>
            <h2 className="mt-3 text-lg font-semibold">No conversations yet</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">
              Start a chat in the Workspace. Messages are saved on this device
              and appear here automatically.
            </p>
            <button
              onClick={() => navigate('/workspace')}
              className="mt-5 flex items-center gap-2 bg-[var(--accent)] px-4 py-2 text-[10px] uppercase tracking-wider text-[var(--bg)]"
            >
              <Plus size={13} />
              New chat
            </button>
          </div>
        )}

        {!loading && items.length > 0 && groups.length === 0 && (
          <p className="mt-10 text-sm text-[var(--muted)]">
            No conversations match “{q}”.
          </p>
        )}

        {!loading && groups.length > 0 && (
          <div className="mt-10">
            {groups.map((group) => (
              <div key={group.key} className="mb-9">
                <div className="editorial-label mb-3">{group.label}</div>

                {group.items.map((conversation) => {
                  const busy = busyId === conversation.id
                  const renaming = renamingId === conversation.id

                  return (
                    <div
                      key={conversation.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openConversation(conversation.id)}
                      onKeyDown={(event) => {
                        // Ignore keys bubbling from the rename input/buttons.
                        if (event.target !== event.currentTarget) return
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          openConversation(conversation.id)
                        }
                      }}
                      className="group flex cursor-pointer items-center justify-between gap-4 border-t rule py-4 hover:bg-[var(--surface)]"
                    >
                      <div className="min-w-0">
                        {renaming ? (
                          <div
                            className="flex items-center gap-2"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <input
                              autoFocus
                              value={renameValue}
                              onChange={(event) =>
                                setRenameValue(event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault()
                                  void submitRename(conversation)
                                }
                                if (event.key === 'Escape') {
                                  event.preventDefault()
                                  cancelRename()
                                }
                              }}
                              className="w-full max-w-md border rule bg-transparent px-2 py-1 text-sm outline-none"
                            />
                            <button
                              title="Save title"
                              onClick={() => void submitRename(conversation)}
                              disabled={busy}
                              className="p-1.5 text-[var(--muted)] hover:text-[var(--success)] disabled:opacity-50"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              title="Cancel rename"
                              onClick={cancelRename}
                              disabled={busy}
                              className="p-1.5 text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-50"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="truncate text-sm font-medium">
                            {conversation.title}
                          </div>
                        )}

                        <div className="mt-1 truncate text-xs text-[var(--muted)]">
                          {conversation.preview || 'No messages yet'}
                        </div>

                        <div className="mt-1 mono text-[10px] text-[var(--muted)]">
                          {formatDate(conversation)} ·{' '}
                          {conversation.message_count}{' '}
                          {conversation.message_count === 1
                            ? 'message'
                            : 'messages'}
                        </div>
                      </div>

                      <div
                        className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button
                          title="Rename"
                          onClick={() => startRename(conversation)}
                          disabled={busy || renaming}
                          className="p-2 text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-50"
                        >
                          <Pencil size={13} />
                        </button>

                        <button
                          title="Delete"
                          onClick={() => void handleDelete(conversation)}
                          disabled={busy}
                          className="p-2 text-[var(--muted)] hover:text-[var(--error)] disabled:opacity-50"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
