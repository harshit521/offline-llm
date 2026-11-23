export interface Conversation {
  id: string
  title: string
  preview: string
  time: string
  messages: number
  model: string
}

export interface ChatMessage {
  role: 'USER' | 'ASSISTANT'
  text: string
  time: string
}

export type DocumentStatus = 'PROCESSING' | 'INDEXED' | 'ERROR' | 'READY'

export interface Document {
  id: string
  name: string
  type: string
  size: string
  status: DocumentStatus
  content: string
  added: string
  pages: string
  chunks: number
  embedding: string
}

export interface ChatApiResponse {
  content: string
  model?: string
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
  conversation_id?: string
  conversation_title?: string
}

/** A message as stored by the backend. */
export interface PersistedMessage {
  id: string
  conversation_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  tokens: number
  created_at: string | null
}

/** Conversation row returned by the list endpoint. */
export interface ConversationSummary {
  id: string
  title: string
  model: string | null
  created_at: string | null
  updated_at: string | null
  message_count: number
  preview: string
}

/** Conversation row including its ordered messages. */
export interface ConversationDetail extends ConversationSummary {
  messages: PersistedMessage[]
}

/** One maintenance capability reported by the backend. */
export interface Capability {
  supported: boolean
  endpoint: string | null
  reason: string | null
}

/** Maintenance capabilities exposed by GET /api/system/capabilities. */
export interface SystemCapabilities {
  clear_history: Capability
  clear_documents: Capability
  clear_cache: Capability
}

/** A GGUF file recorded in the backend model registry. */
export interface RegisteredModel {
  id: string
  name: string
  path: string
  quant: string
  size: number
  context: number
  created_at: string | null
  loaded: boolean
  status: 'loaded' | 'available'
}

export type RuntimeStatusValue =
  | 'unloaded'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error'

export interface RuntimeStatus {
  status: RuntimeStatusValue
  model_id: string | null
  model_name: string | null
  model_quant: string | null
  model_context: number | null
  port: number | null
  pid: number | null
  base_url: string | null
  started_at: string | null
  error: string | null
  managed: boolean
  external_url: string
  reachable: boolean
  active_base_url: string
  models_dir: string
}

export type DownloadStatus =
  | 'queued'
  | 'downloading'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface DownloadProgress {
  id: string
  repo_id: string
  filename: string
  context: number
  status: DownloadStatus
  downloaded: number
  total: number | null
  percent: number | null
  error: string | null
  model_id: string | null
  path: string | null
  created_at: string
  updated_at: string
}
