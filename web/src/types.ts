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

export interface ModelInfo {
  id: string
  name: string
  status: string
}

export interface ChatApiResponse {
  content: string
  model?: string
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}