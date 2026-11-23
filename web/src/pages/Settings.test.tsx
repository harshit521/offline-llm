import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearAllConversations,
  getCapabilities,
  listModels,
} from '@/lib/api'
import type { RegisteredModel, SystemCapabilities } from '@/types'
import { SETTINGS_STORAGE_KEY, resetSettings } from '@/store/settingsStore'
import Settings from './Settings'

vi.mock('@/lib/api', () => ({
  listModels: vi.fn(),
  getCapabilities: vi.fn(),
  clearAllConversations: vi.fn(),
}))

const MODEL: RegisteredModel = {
  id: 'model-1',
  name: 'Model A',
  path: '/models/a.gguf',
  quant: 'Q8_0',
  size: 1024,
  context: 4096,
  created_at: null,
  loaded: false,
  status: 'available',
}

const CAPABILITIES: SystemCapabilities = {
  clear_history: {
    supported: true,
    endpoint: 'DELETE /api/chat/conversations',
    reason: null,
  },
  clear_documents: {
    supported: false,
    endpoint: null,
    reason: 'Document indexing is not implemented in this build.',
  },
  clear_cache: {
    supported: false,
    endpoint: null,
    reason: 'This backend does not manage a cache directory.',
  },
}

function savedSettings() {
  return JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}')
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  resetSettings()

  vi.mocked(listModels).mockResolvedValue([MODEL])
  vi.mocked(getCapabilities).mockResolvedValue(CAPABILITIES)
  vi.mocked(clearAllConversations).mockResolvedValue({
    success: true,
    deleted: 3,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Settings page', () => {
  it('persists slider changes to the shared settings store', async () => {
    render(<Settings />)
    await screen.findByRole('option', { name: 'Model A' })

    fireEvent.change(screen.getByLabelText('Temperature'), {
      target: { value: '1.4' },
    })
    fireEvent.change(screen.getByLabelText('Top P'), {
      target: { value: '0.55' },
    })
    fireEvent.change(screen.getByLabelText('Maximum tokens'), {
      target: { value: '4096' },
    })

    expect(savedSettings()).toMatchObject({
      temperature: 1.4,
      topP: 0.55,
      maxTokens: 4096,
    })
  })

  it('persists the streaming toggle and exposes the 8192 token limit', async () => {
    render(<Settings />)
    await screen.findByRole('option', { name: 'Model A' })

    const toggle = screen.getByRole('switch', {
      name: 'Streaming responses',
    })
    expect(toggle).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(savedSettings().streaming).toBe(false)
    expect(screen.getByLabelText('Maximum tokens')).toHaveAttribute(
      'max',
      '8192',
    )
  })

  it('clears history through the backend and disables unsupported actions', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<Settings />)
    await waitFor(() => expect(getCapabilities).toHaveBeenCalled())

    fireEvent.click(
      screen.getByRole('button', { name: /CLEAR CHAT HISTORY/ }),
    )

    await waitFor(() => expect(clearAllConversations).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Deleted 3 conversations.',
    )

    expect(
      screen.getByRole('button', { name: /CLEAR LOCAL CACHE/ }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: /CLEAR INDEXED DOCUMENTS/ }),
    ).toBeDisabled()
  })
})
