'use client'

import { useCanvasImportStatus } from '@/hooks/useCanvasImportStatus'
import CanvasImportToast from './CanvasImportToast'
import { useRouter } from 'next/navigation'

/**
 * Wrapper component that manages Canvas import notifications globally
 * 
 * Place this in your root layout or main app wrapper:
 * 
 * export default function RootLayout({ children }) {
 *   return (
 *     <>
 *       <CanvasIntegration />
 *       {children}
 *     </>
 *   )
 * }
 */
export default function CanvasIntegration() {
  const router = useRouter()
  const { progress, showToast, onToastClose } = useCanvasImportStatus({
    checkInterval: 6 * 60 * 60 * 1000, // Check every 6 hours
    autoCheckOnMount: true, // Check on component mount (app load)
  })

  const handleViewLogs = () => {
    // Navigate to settings page with Canvas import section
    router.push('/settings?tab=canvas-imports')
  }

  return (
    <CanvasImportToast
      show={showToast}
      progress={progress}
      onClose={onToastClose}
      onViewLogs={handleViewLogs}
    />
  )
}
