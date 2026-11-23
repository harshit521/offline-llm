import { useSyncExternalStore } from 'react'

/**
 * Single persisted settings source for the whole app.
 *
 * Both the Settings page and the chat workspace read from this store, and every
 * mutation is written to localStorage so values survive a browser reload.
 */

export const SETTINGS_STORAGE_KEY = 'offline-llm-settings'
/** Legacy key used before the settings store owned the default model. */
export const LEGACY_MODEL_STORAGE_KEY = 'offline-llm-selected-model'

export const MIN_TEMPERATURE = 0
export const MAX_TEMPERATURE = 2
export const MIN_TOP_P = 0
export const MAX_TOP_P = 1
export const MIN_MAX_TOKENS = 256
export const MAX_MAX_TOKENS = 8192
export const MAX_TOKENS_STEP = 256

export interface AppSettings {
  temperature: number
  maxTokens: number
  topP: number
  streaming: boolean
  defaultModelId: string
}

export const DEFAULT_SETTINGS: AppSettings = {
  temperature: 0.2,
  maxTokens: 2048,
  topP: 0.9,
  streaming: true,
  defaultModelId: '',
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function clampMaxTokens(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const snapped = Math.round(value / MAX_TOKENS_STEP) * MAX_TOKENS_STEP
  return Math.min(MAX_MAX_TOKENS, Math.max(MIN_MAX_TOKENS, snapped))
}

/** Normalise any persisted/partial object into a valid settings object. */
export function sanitizeSettings(raw: unknown): AppSettings {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >

  return {
    temperature: clampNumber(
      source.temperature,
      MIN_TEMPERATURE,
      MAX_TEMPERATURE,
      DEFAULT_SETTINGS.temperature,
    ),
    maxTokens: clampMaxTokens(
      source.maxTokens,
      DEFAULT_SETTINGS.maxTokens,
    ),
    topP: clampNumber(source.topP, MIN_TOP_P, MAX_TOP_P, DEFAULT_SETTINGS.topP),
    streaming:
      typeof source.streaming === 'boolean'
        ? source.streaming
        : DEFAULT_SETTINGS.streaming,
    defaultModelId:
      typeof source.defaultModelId === 'string'
        ? source.defaultModelId
        : DEFAULT_SETTINGS.defaultModelId,
  }
}

function readLegacyModelId(): string {
  try {
    return localStorage.getItem(LEGACY_MODEL_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as Record<string, unknown>
      const settings = sanitizeSettings(parsed)
      // Migrate the pre-store model selection once.
      if (!settings.defaultModelId) {
        settings.defaultModelId = readLegacyModelId()
      }
      return settings
    }
  } catch {
    // Fall through to defaults when storage is unavailable or malformed.
  }

  return {
    ...DEFAULT_SETTINGS,
    defaultModelId: readLegacyModelId(),
  }
}

function persistSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
    if (settings.defaultModelId) {
      localStorage.setItem(
        LEGACY_MODEL_STORAGE_KEY,
        settings.defaultModelId,
      )
    } else {
      localStorage.removeItem(LEGACY_MODEL_STORAGE_KEY)
    }
  } catch {
    // Persistence is best-effort; the in-memory store still works.
  }
}

let currentSettings: AppSettings = loadSettings()
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

/** Current settings snapshot (stable reference until the next update). */
export function getSettings(): AppSettings {
  return currentSettings
}

/** Subscribe to settings changes. Returns an unsubscribe function. */
export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Merge a partial update into the settings, persist it, and notify subscribers.
 * Values are clamped so UI and backend limits always agree.
 */
export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  currentSettings = sanitizeSettings({ ...currentSettings, ...patch })
  persistSettings(currentSettings)
  emit()
  return currentSettings
}

/** Replace the default model selection in the shared store. */
export function setDefaultModelId(modelId: string): AppSettings {
  return updateSettings({ defaultModelId: modelId })
}

/** Restore defaults (used by tests and an explicit reset). */
export function resetSettings(): AppSettings {
  currentSettings = { ...DEFAULT_SETTINGS }
  persistSettings(currentSettings)
  emit()
  return currentSettings
}

/** React hook returning the shared, persisted settings. */
export function useSettings(): AppSettings {
  return useSyncExternalStore(
    subscribeSettings,
    getSettings,
    getSettings,
  )
}

/** Backwards-compatible alias for components written against the old hook. */
export function usePersistedSettings(): AppSettings {
  return useSettings()
}
