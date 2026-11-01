import type {
  ChatMessage,
  ChatApiResponse,
  DownloadProgress,
  RegisteredModel,
  RuntimeStatus,
} from '@/types'

// Backend API URL from environment variables with development fallback.
// The frontend never talks to llama.cpp directly.
export const API_URL =
  import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * Transform frontend ChatMessage format to backend API format.
 * Frontend uses { role, text, time }, backend expects { role, content }.
 */
function toBackendMessage(message: ChatMessage): { role: string; content: string } {
  return {
    role: message.role.toLowerCase(),
    content: message.text,
  }
}

async function responseError(response: Response): Promise<ApiError> {
  let detail = `Backend returned HTTP ${response.status}`

  try {
    const body: unknown = await response.json()
    if (body && typeof body === 'object' && 'detail' in body) {
      const raw = (body as { detail: unknown }).detail
      if (typeof raw === 'string') {
        detail = raw
      } else if (Array.isArray(raw)) {
        detail = raw
          .map((item) =>
            item && typeof item === 'object' && 'msg' in item
              ? String((item as { msg: unknown }).msg)
              : 'Invalid request',
          )
          .join('; ')
      }
    }
  } catch {
    // Keep the generic status message when the body is not JSON.
  }

  return new ApiError(response.status, detail)
}

async function requestJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init)
  if (!response.ok) {
    throw await responseError(response)
  }
  return (await response.json()) as T
}

/**
 * Read Server-Sent Events and yield each `data:` payload.
 */
async function* readSseData(response: Response): AsyncGenerator<string> {
  if (!response.body) {
    throw new Error('The backend returned an empty response body.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      let newline = buffer.indexOf('\n')
      while (newline >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, '')
        buffer = buffer.slice(newline + 1)

        if (line.startsWith('data:')) {
          const data = line.slice(5).trimStart()
          if (data === '[DONE]') return
          if (data) yield data
        }

        newline = buffer.indexOf('\n')
      }
    }

    // Flush a final line that did not end with a newline.
    const tail = buffer.trim()
    if (tail.startsWith('data:')) {
      const data = tail.slice(5).trimStart()
      if (data && data !== '[DONE]') yield data
    }
  } finally {
    void reader.cancel().catch(() => undefined)
  }
}

export interface ChatOptions {
  temperature?: number
  max_tokens?: number
  model_id?: string
}

/**
 * Send a chat message to the backend API (non-streaming).
 */
export async function sendChat(
  messages: ChatMessage[],
  options: ChatOptions = {},
  signal?: AbortSignal,
): Promise<ChatApiResponse> {
  return requestJson<ChatApiResponse>('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: messages.map(toBackendMessage),
      temperature: options.temperature ?? 0.2,
      max_tokens: options.max_tokens ?? 512,
      model_id: options.model_id,
    }),
    signal,
  })
}

/**
 * Send a chat message and yield incremental text chunks as they arrive.
 */
export async function* sendChatStream(
  messages: ChatMessage[],
  options: ChatOptions = {},
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const response = await fetch(`${API_URL}/api/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: messages.map(toBackendMessage),
      temperature: options.temperature ?? 0.2,
      max_tokens: options.max_tokens ?? 512,
      model_id: options.model_id,
    }),
    signal,
  })

  if (!response.ok) {
    throw await responseError(response)
  }

  for await (const data of readSseData(response)) {
    let parsed: unknown
    try {
      parsed = JSON.parse(data)
    } catch {
      continue
    }

    if (parsed && typeof parsed === 'object') {
      if ('error' in parsed) {
        throw new Error(String((parsed as { error: unknown }).error))
      }
      if (
        'content' in parsed &&
        typeof (parsed as { content: unknown }).content === 'string'
      ) {
        yield (parsed as { content: string }).content
      }
    }
  }
}

/** List models registered in the backend registry. */
export async function listModels(): Promise<RegisteredModel[]> {
  return requestJson<RegisteredModel[]>('/api/models')
}

/** Register an existing GGUF file inside the backend models directory. */
export async function registerModel(payload: {
  path: string
  name?: string
  context?: number
}): Promise<RegisteredModel> {
  return requestJson<RegisteredModel>('/api/models', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

/**
 * Download a GGUF file from Hugging Face, streaming real progress updates.
 */
export async function downloadModel(
  repoId: string,
  filename: string,
  context: number | undefined,
  onProgress: (progress: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<DownloadProgress> {
  const response = await fetch(`${API_URL}/api/models/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo_id: repoId, filename, context }),
    signal,
  })

  if (!response.ok) {
    throw await responseError(response)
  }

  let latest: DownloadProgress | null = null

  for await (const data of readSseData(response)) {
    let parsed: unknown
    try {
      parsed = JSON.parse(data)
    } catch {
      continue
    }

    const progress = parsed as DownloadProgress
    if (!progress || typeof progress.status !== 'string') continue

    latest = progress
    onProgress(progress)

    if (progress.status === 'completed') return progress
    if (progress.status === 'failed' || progress.status === 'cancelled') {
      throw new Error(progress.error || 'Download failed.')
    }
  }

  if (!latest) {
    throw new Error('The download stream ended without progress updates.')
  }

  if (latest.status === 'completed') return latest

  throw new Error(latest.error || 'The download stream ended unexpectedly.')
}

/** Delete a model from the registry and remove its file from disk. */
export async function deleteModel(
  id: string,
): Promise<{ success: boolean; deleted_id: string; file_removed: boolean }> {
  return requestJson('/api/models/' + encodeURIComponent(id), {
    method: 'DELETE',
  })
}

/** Start a managed llama-server for a registered model. */
export async function loadModel(id: string): Promise<RuntimeStatus> {
  return requestJson<RuntimeStatus>(
    `/api/models/${encodeURIComponent(id)}/load`,
    { method: 'POST' },
  )
}

/** Stop the managed llama-server for a registered model. */
export async function unloadModel(id: string): Promise<RuntimeStatus> {
  return requestJson<RuntimeStatus>(
    `/api/models/${encodeURIComponent(id)}/unload`,
    { method: 'POST' },
  )
}

/** Current managed runtime state plus external-server reachability. */
export async function getRuntimeStatus(): Promise<RuntimeStatus> {
  return requestJson<RuntimeStatus>('/api/models/runtime')
}
