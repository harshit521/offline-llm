import type { ChatMessage, ChatApiResponse, ModelInfo } from '@/types'

// Backend API URL from environment variables with development fallback
export const API_URL =
  import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

export const LLAMA_BASE_URL =
  import.meta.env.VITE_LLAMA_URL || 'http://127.0.0.1:8080'

/**
 * Transform frontend ChatMessage format to backend API format.
 * Frontend uses { role, text, time }, backend expects { role, content }.
 */
function toBackendMessage(message: ChatMessage): { role: string; content: string } {
  return {
    role: message.role,
    content: message.text,
  }
}

/**
 * Send a chat message to the backend API (non-streaming).
 * Handles JSON serialization, response parsing, and error handling.
 * Supports optional AbortSignal for cancellation.
 */
export async function sendChat(
  messages: ChatMessage[],
  options: { temperature?: number; max_tokens?: number } = {},
  signal?: AbortSignal,
): Promise<ChatApiResponse> {
  const response = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: messages.map(toBackendMessage),
      temperature: options.temperature ?? 0.2,
      max_tokens: options.max_tokens ?? 512,
    }),
    signal,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(
      `Backend returned HTTP ${response.status}: ${errorText}`,
    )
  }

  return response.json() as Promise<ChatApiResponse>
}

/**
 * Send a chat message to the backend API (streaming).
 * Uses SSE (text/event-stream) and returns parsed content chunks.
 * 
 * Example usage:
 *   for await (const delta of sendChatStream(messages)) {
 *     appendDeltaToUI(delta.content);
 *   }
 * 
 * Yields strings of incremental text content.
 */
export async function* sendChatStream(
  messages: ChatMessage[],
  options: { temperature?: number; max_tokens?: number } = {},
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const response = await fetch(`${API_URL}/api/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: messages.map(toBackendMessage),
      temperature: options.temperature ?? 0.2,
      max_tokens: options.max_tokens ?? 512,
    }),
    signal,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(
      `Backend returned HTTP ${response.status}: ${errorText}`,
    )
  }

  if (!response.body) {
    throw new Error('No response body')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      
      if (done) {
        // Stream completed
        buffer += value || ''
        break
      }

      buffer += decoder.decode(value, { stream: true })

      // Process complete SSE events from the buffer
      while (buffer.includes('\n')) {
        const newlineIdx = buffer.indexOf('\n')
        const line = buffer.substring(0, newlineIdx).trim()
        buffer = buffer.substring(newlineIdx + 1).trim()

        if (!line) {
          continue
        }

        if (line.startsWith('data: ')) {
          const data = line.substring(6).trim()

          if (data === '[DONE]') {
            // Stream finished
            break
          }

          try {
            const parsed = JSON.parse(data)
            if ('content' in parsed && parsed.content !== undefined) {
              yield parsed.content
            }
            // Ignore other payload structures (like error flags for now)
          } catch (e) {
            // Skip malformed JSON, continue processing
            continue
          }
        }
        // Ignore non-data lines (id, event, retry)
      }
    }
  } finally {
    reader.cancel()
  }
}

/**
 * List models available from the configured llama.cpp server
 * via the backend proxy endpoint.
 */
export async function listModels(): Promise<ModelInfo[]> {
  const response = await fetch(`${API_URL}/api/chat/models`)

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(
      `Backend returned HTTP ${response.status}: ${errorText}`,
    )
  }

  const data = await response.json()
  const list = data.data || []

  return list.map((item: { id?: string; name?: string }) => ({
    id: item.id || item.name || 'unknown',
    name: item.id || item.name || 'Local GGUF model',
    status: 'AVAILABLE',
  }))
}