'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Alert } from '@/components/alert'
import useI18n from '@/lib/notes/hooks/use-i18n'

function VerifyEmailContent() {
  const { t } = useI18n()
  const searchParams = useSearchParams()
  const router = useRouter()

  const token = searchParams.get('token')
  const email = searchParams.get('email') || ''

  const [verifying, setVerifying] = useState(false)
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState('')
  const [resendMessage, setResendMessage] = useState('')
  const [resendLoading, setResendLoading] = useState(false)

  // auto-verify if token is in URL
  useEffect(() => {
    if (!token) return

    setVerifying(true)
    fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json()
        if (res.ok) {
          setVerified(true)
          setTimeout(() => router.replace('/notes'), 2000)
        } else {
          setError(data.error || t('Verification failed. The link may have expired.'))
        }
      })
      .catch(() => {
        setError(t('An error occurred. Please try again.'))
      })
      .finally(() => setVerifying(false))
  }, [token, router, t])

  const handleResend = async () => {
    if (!email) return
    setResendLoading(true)
    setResendMessage('')
    setError('')

    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await res.json()

      if (res.ok) {
        setResendMessage(data.message || t('Verification email sent. Check your inbox.'))
      } else {
        setError(data.error || t('Failed to resend verification email.'))
      }
    } catch {
      setError(t('An error occurred. Please try again.'))
    } finally {
      setResendLoading(false)
    }
  }

  // verifying state
  if (verifying) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center py-12 bg-background">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
          <h2 className="text-2xl font-bold text-text-secondary">{t('Verifying your email...')}</h2>
          <p className="mt-2 text-text-tertiary">{t('Please wait a moment.')}</p>
        </div>
      </div>
    )
  }

  // verified state
  if (verified) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center py-12 bg-background">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <Alert
            variant="success"
            title={t('Email verified!')}
            description={t('Your email has been verified. Redirecting to your notes...')}
          />
        </div>
      </div>
    )
  }

  // default: check your inbox (no token) or error (bad token)
  return (
    <div className="flex min-h-full flex-col justify-center py-12 sm:px-6 lg:px-8 bg-background">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-2xl font-bold tracking-tight text-text-secondary">
          {t('Check your email')}
        </h2>
        <p className="mt-2 text-center text-sm text-text-tertiary">
          {email
            ? t(`We sent a verification link to ${email}. Click the link to verify your account.`)
            : t('We sent a verification link to your email. Click the link to verify your account.')}
        </p>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-[480px]">
        <div className="bg-surface/50 px-6 py-12 outline -outline-offset-1 outline-white/10 sm:rounded-lg sm:px-12 space-y-6">
          {error && <Alert variant="error" description={error} />}
          {resendMessage && <Alert variant="success" description={resendMessage} />}

          {email && (
            <button
              onClick={handleResend}
              disabled={resendLoading}
              className="flex w-full justify-center rounded-md bg-primary-500 px-3 py-1.5 text-sm/6 font-semibold text-white hover:bg-primary-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resendLoading ? t('Sending...') : t('Resend verification email')}
            </button>
          )}

          <p className="text-center text-sm text-text-tertiary">
            {t("Didn't receive the email? Check your spam folder.")}
          </p>
        </div>

        <p className="mt-10 text-center text-sm/6 text-text-tertiary">
          <Link href="/login" className="font-semibold text-primary-400 hover:text-primary-300">
            {t('Back to Login')}
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  const { t } = useI18n()
  return (
    <Suspense fallback={<div className="flex min-h-full items-center justify-center bg-background text-text-tertiary">{t('Loading...')}</div>}>
      <VerifyEmailContent />
    </Suspense>
  )
}
