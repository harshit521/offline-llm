import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  SETTINGS_STORAGE_KEY,
  DEFAULT_SETTINGS,
} from './settingsStore'

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

describe('settings store', () => {
  it('persists inference settings to localStorage', async () => {
    const store = await import('./settingsStore')

    store.updateSettings({
      temperature: 1.4,
      topP: 0.55,
      maxTokens: 4096,
      streaming: false,
      defaultModelId: 'model-1',
    })

    const saved = JSON.parse(
      localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}',
    )

    expect(saved).toMatchObject({
      temperature: 1.4,
      topP: 0.55,
      maxTokens: 4096,
      streaming: false,
      defaultModelId: 'model-1',
    })
  })

  it('restores persisted settings after a reload', async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        temperature: 1.2,
        maxTokens: 3072,
        topP: 0.6,
        streaming: false,
        defaultModelId: 'model-2',
      }),
    )

    vi.resetModules()
    const store = await import('./settingsStore')

    expect(store.getSettings()).toEqual({
      temperature: 1.2,
      maxTokens: 3072,
      topP: 0.6,
      streaming: false,
      defaultModelId: 'model-2',
    })
  })

  it('clamps values to the limits shared with the backend', async () => {
    const store = await import('./settingsStore')

    expect(store.updateSettings({ temperature: 9 }).temperature).toBe(2)
    expect(store.updateSettings({ temperature: -3 }).temperature).toBe(0)
    expect(store.updateSettings({ topP: 2 }).topP).toBe(1)
    expect(store.updateSettings({ topP: -2 }).topP).toBe(0)
    expect(store.updateSettings({ maxTokens: 99999 }).maxTokens).toBe(8192)
    expect(store.updateSettings({ maxTokens: 1 }).maxTokens).toBe(256)
  })

  it('migrates the legacy model selection key', async () => {
    localStorage.setItem('offline-llm-selected-model', 'legacy-model')

    vi.resetModules()
    const store = await import('./settingsStore')

    expect(store.getSettings().defaultModelId).toBe('legacy-model')
  })

  it('falls back to defaults for malformed storage', async () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, '{not-json')

    vi.resetModules()
    const store = await import('./settingsStore')

    expect(store.getSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('notifies subscribers and reset restores defaults', async () => {
    const store = await import('./settingsStore')
    const listener = vi.fn()
    const unsubscribe = store.subscribeSettings(listener)

    store.updateSettings({ temperature: 1.5 })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getSettings().temperature).toBe(1.5)

    store.resetSettings()
    expect(store.getSettings()).toEqual(DEFAULT_SETTINGS)

    unsubscribe()
    store.updateSettings({ temperature: 0.4 })
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('keeps the selected model in sync when settings change', async () => {
    const store = await import('./settingsStore')

    store.setDefaultModelId('model-9')

    expect(store.getSettings().defaultModelId).toBe('model-9')
    expect(localStorage.getItem('offline-llm-selected-model')).toBe('model-9')

    store.resetSettings()
    expect(store.updateSettings({ topP: 0.5 }).topP).toBe(0.5)
  })
})
