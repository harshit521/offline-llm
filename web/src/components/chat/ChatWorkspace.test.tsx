import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createConversation,
  getRuntimeStatus,
  listModels,
  sendChat,
  sendChatStream,
} from '@/lib/api'
import type { RegisteredModel, RuntimeStatus } from '@/types'
import { resetSettings, updateSettings } from '@/store/settingsStore'
import { ChatWorkspace } from './ChatWorkspace'

vi.mock('@/lib/api', () => ({
  createConversation: vi.fn(),
  getConversation: vi.fn(),
  getRuntimeStatus: vi.fn(),
  listModels: vi.fn(),
  loadModel: vi.fn(),
  sendChat: vi.fn(),
  sendChatStream: vi.fn(),
  unloadModel: vi.fn(),
}))

const MODEL: RegisteredModel = {
  id: 'model-1',
  name: 'Model A',
  path: '/models/a.gguf',
  quant: 'Q8_0',
  size: 1024,
  context: 4096,
  created_at: null,
  loaded: true,
  status: 'loaded',
}

const RUNTIME: RuntimeStatus = {
  status: 'running',
  model_id: 'model-1',
  model_name: 'Model A',
  model_quant: 'Q8_0',
  model_context: 4096,
  port: 8081,
  pid: 1234,
  base_url: 'http://127.0.0.1:8081',
  started_at: null,
  error: null,
  managed: true,
  external_url: 'http://127.0.0.1:8080',
  reachable: true,
  active_base_url: 'http://127.0.0.1:8081',
  models_dir: '/models',
}

async function renderWorkspace() {
  render(
    <MemoryRouter initialEntries={['/workspace']}>
      <ChatWorkspace />
    </MemoryRouter>,
  )

  await screen.findByPlaceholderText('Write a prompt...')
  await waitFor(() => expect(listModels).toHaveBeenCalled())
}

function send(text: string) {
  const textarea = screen.getByPlaceholderText('Write a prompt...')
  fireEvent.change(textarea, { target: { value: text } })
  fireEvent.keyDown(textarea, { key: 'Enter' })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  resetSettings()
  updateSettings({
    temperature: 1.3,
    topP: 0.45,
    maxTokens: 4096,
    streaming: true,
    defaultModelId: 'model-1',
  })

  vi.mocked(listModels).mockResolvedValue([MODEL])
  vi.mocked(getRuntimeStatus).mockResolvedValue(RUNTIME)
  vi.mocked(createConversation).mockResolvedValue({
    id: 'conv-1',
    title: 'New Conversation',
    model: 'Model A',
    created_at: null,
    updated_at: null,
    message_count: 0,
    preview: '',
  })
  vi.mocked(sendChatStream).mockImplementation(() =>
    (async function* () {
      yield 'Streamed reply'
    })(),
  )
  vi.mocked(sendChat).mockResolvedValue({ content: 'Non-stream reply' })
})

describe('ChatWorkspace settings wiring', () => {
  it('uses the persisted sampling settings for the next chat', async () => {
    await renderWorkspace()

    send('Hello')

    await waitFor(() => expect(sendChatStream).toHaveBeenCalledTimes(1))

    const options = vi.mocked(sendChatStream).mock.calls[0][1]
    expect(options).toMatchObject({
      temperature: 1.3,
      top_p: 0.45,
      max_tokens: 4096,
      model_id: 'model-1',
    })

    expect(await screen.findByText('Streamed reply')).toBeInTheDocument()
  })

  it('uses the non-streaming endpoint when streaming is disabled', async () => {
    updateSettings({ streaming: false })

    await renderWorkspace()

    send('Hello')

    await waitFor(() => expect(sendChat).toHaveBeenCalledTimes(1))
    expect(sendChatStream).not.toHaveBeenCalled()

    const options = vi.mocked(sendChat).mock.calls[0][1]
    expect(options).toMatchObject({
      temperature: 1.3,
      top_p: 0.45,
      max_tokens: 4096,
    })

    expect(await screen.findByText('Non-stream reply')).toBeInTheDocument()
  })
})
