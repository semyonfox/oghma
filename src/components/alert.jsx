'use client'

import {
  ExclamationTriangleIcon,
  XCircleIcon,
  CheckCircleIcon,
  InformationCircleIcon,
  XMarkIcon,
} from '@heroicons/react/20/solid'
import { useState } from 'react'
import useI18n from '@/lib/notes/hooks/use-i18n'

const alertVariants = {
  warning: {
    bgColor: 'bg-yellow-500/10',
    outlineColor: 'outline-yellow-500/15',
    iconColor: 'text-yellow-300',
    titleColor: 'text-yellow-100',
    descColor: 'text-yellow-100/80',
    icon: ExclamationTriangleIcon,
  },
  error: {
    bgColor: 'bg-red-500/15',
    outlineColor: 'outline-red-500/25',
    iconColor: 'text-red-400',
    titleColor: 'text-red-200',
    descColor: 'text-red-200/80',
    icon: XCircleIcon,
  },
  success: {
    bgColor: 'bg-green-500/10',
    outlineColor: 'outline-green-500/20',
    iconColor: 'text-green-400',
    titleColor: 'text-green-200',
    descColor: 'text-green-200/85',
    icon: CheckCircleIcon,
  },
  info: {
    bgColor: 'bg-blue-500/10',
    outlineColor: 'outline-blue-500/20',
    iconColor: 'text-blue-400',
    titleColor: 'text-blue-300',
    descColor: 'text-blue-300/85',
    icon: InformationCircleIcon,
  },
}

export function Alert({
  variant = 'info',
  title,
  description,
  children,
  dismissible = false,
  onDismiss,
  className = '',
}) {
  const { t } = useI18n()
  const [isOpen, setIsOpen] = useState(true)

  const styles = alertVariants[variant] || alertVariants.info
  const Icon = styles.icon

  if (!isOpen) return null

  const handleDismiss = () => {
    setIsOpen(false)
    onDismiss?.()
  }

  return (
    <div className={`rounded-md ${styles.bgColor} p-4 outline ${styles.outlineColor} ${className}`}>
      <div className="flex">
        <div className="shrink-0">
          <Icon aria-hidden="true" className={`size-5 ${styles.iconColor}`} />
        </div>
        <div className="ml-3 flex-1">
          {title && <h3 className={`text-sm font-medium ${styles.titleColor}`}>{title}</h3>}
          {description && (
            <div className={`${title ? 'mt-2' : ''} text-sm ${styles.descColor}`}>
              {typeof description === 'string' ? <p>{description}</p> : description}
            </div>
          )}
          {children && <div className={`${title ? 'mt-2' : ''} text-sm ${styles.descColor}`}>{children}</div>}
        </div>
        {dismissible && (
          <div className="ml-auto pl-3">
            <div className="-mx-1.5 -my-1.5">
               <button
                 type="button"
                 onClick={handleDismiss}
                 className={`inline-flex rounded-md p-1.5 ${styles.iconColor} hover:bg-${variant}-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-${variant}-500/50`}
                 aria-label={t('Dismiss alert')}
               >
                 <span className="sr-only">{t('Dismiss')}</span>
                 <XMarkIcon aria-hidden="true" className="size-5" />
               </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
