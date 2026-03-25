import { useMemo } from 'react'
import {
  ArrowPathIcon,
  CloudArrowUpIcon,
  Cog6ToothIcon,
  FingerPrintIcon,
  LockClosedIcon,
  ServerIcon,
} from '@heroicons/react/20/solid'
import useI18n from '@/lib/notes/hooks/use-i18n'

export function useHomeFeatures() {
  const { t } = useI18n()

  return useMemo(
    () => [
      {
        name: t('Rich Markdown Editor'),
        description: t('Write beautiful, formatted notes with live preview, syntax highlighting, and seamless organization.'),
        icon: Cog6ToothIcon,
      },
      {
        name: t('AI-Powered Insights'),
        description: t('Get intelligent summaries, key concepts, and study questions generated automatically from your notes.'),
        icon: CloudArrowUpIcon,
      },
      {
        name: t('Canvas Integration'),
        description: t('Seamlessly sync notes from your Canvas courses and keep all study materials in one place.'),
        icon: ArrowPathIcon,
      },
      {
        name: t('Secure Cloud Storage'),
        description: t('Your notes are safely stored and accessible from any device with enterprise-grade encryption.'),
        icon: LockClosedIcon,
      },
      {
        name: t('Collaborative Learning'),
        description: t('Share notes with classmates, collaborate on study materials, and learn together in real-time.'),
        icon: FingerPrintIcon,
      },
      {
        name: t('Multi-User Support'),
        description: t('Built for university teams with secure authentication, role-based access, and session management.'),
        icon: ServerIcon,
      },
    ],
    [t]
  )
}
