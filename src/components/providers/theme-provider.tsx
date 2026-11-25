'use client'

import { type ReactNode, useEffect } from 'react'
import { useSettingsStore } from '@/lib/notes/state/ui/settings'

import { applyColourTheme } from '@/lib/notes/theme'

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSettingsStore((s) => s.settings?.theme)

  // apply theme when the setting changes or on mount
  useEffect(() => {
    const resolved = theme || localStorage.getItem('ogma-theme') || 'system'
    applyColourTheme(resolved)
    if (theme) {
      localStorage.setItem('ogma-theme', theme)
      document.cookie = `ogma-theme=${theme}; path=/; max-age=31536000; samesite=lax`
    }
  }, [theme])

  // respond to OS preference changes when in 'system' mode
  useEffect(() => {
    const resolved = theme || localStorage.getItem('ogma-theme') || 'system'
    if (resolved !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyColourTheme('system')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  return children
}
