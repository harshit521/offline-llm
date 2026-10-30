export const conversations = [
  {
    id: 'conv-1',
    title: 'Getting started with Qwen',
    preview: 'Hello! Introduce yourself.',
    time: 'Today',
    messages: 2,
    model: 'Qwen3.5 0.8B (GGUF)',
  },
  {
    id: 'conv-2',
    title: 'Code assistance',
    preview: 'Help me understand this function.',
    time: 'Yesterday',
    messages: 4,
    model: 'Qwen3.5 0.8B (GGUF)',
  },
]

export const documents = [
  {
    id: 'doc-1',
    name: 'Welcome.md',
    type: 'Markdown',
    size: '1 KB',
    status: 'READY' as const,
    content: 'Welcome to your Offline LLM workspace.',
    added: 'Just now',
    pages: '—',
    chunks: 0,
    embedding: 'all-MiniLM-L6-v2',
  },
  {
    id: 'doc-2',
    name: 'Notes.txt',
    type: 'Text',
    size: '1 KB',
    status: 'READY' as const,
    content: 'Your local documents will appear here.',
    added: 'Just now',
    pages: '—',
    chunks: 0,
    embedding: 'all-MiniLM-L6-v2',
  },
]