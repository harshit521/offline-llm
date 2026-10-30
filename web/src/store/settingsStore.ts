import { useState, useEffect } from 'react'

const defaultSettings = {
  temperature: 0.2,
  maxTokens: 512,
}

/**
 * Load settings from localStorage, fall back to defaults.
 */
function loadSettings(): typeof defaultSettings {
  try {
    const stored = localStorage.getItem('offline-llm-settings')
    if (stored) {
      const parsed = JSON.parse(stored)
      if (typeof parsed?.temperature === 'number' && parsed.temperature >= 0 && parsed.temperature <= 2) {
        return { temperature: parsed.temperature, maxTokens: parsed.maxTokens ?? defaultSettings.maxTokens }
      }
    }
  } catch {
    //
  }
  return defaultSettings
}

/**
 * Save settings to localStorage.
 */
function saveSettings(settings: typeof defaultSettings): void {
  try {
    localStorage.setItem('offline-llm-settings', JSON.stringify(settings))
  } catch {
    //
  }
}

/**
 * Hook that provides persistent settings.
 */
export function usePersistedSettings() {
  const [settings, setSettings] = useState<typeof defaultSettings>(loadSettings)

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  return settings
}