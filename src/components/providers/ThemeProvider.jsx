'use client'

import { useEffect } from 'react'
import { useSettingsStore } from '@/lib/notes/state/ui/settings'

function applyTheme(theme) {
  const root = document.documentElement
  let isDark
  if (theme === 'system' || !theme) {
    isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  } else {
    isDark = theme === 'dark'
  }
  root.classList.toggle('light', !isDark)
  root.classList.toggle('dark', isDark)
}

export default function ThemeProvider({ children }) {
  const theme = useSettingsStore((s) => s.settings?.theme)

  // apply theme when the setting changes or on mount
  useEffect(() => {
    const resolved = theme || localStorage.getItem('ogma-theme') || 'system'
    applyTheme(resolved)
    if (theme) localStorage.setItem('ogma-theme', theme)
  }, [theme])

  // respond to OS preference changes when in 'system' mode
  useEffect(() => {
    const resolved = theme || localStorage.getItem('ogma-theme') || 'system'
    if (resolved !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme('system')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  return children
}
