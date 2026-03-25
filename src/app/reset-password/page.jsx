'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Alert } from '@/components/alert'
import useI18n from '@/lib/notes/hooks/use-i18n'

function ResetPasswordForm() {
  const { t } = useI18n()
  const searchParams = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const token = searchParams.get('token') || ''

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')

    if (password !== confirmPassword) {
      setError(t('Passwords do not match'))
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/password-reset/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })

      const data = await res.json()

      if (res.ok) {
        setMessage(t('Password reset successful! Redirecting to login...'))
        setTimeout(() => {
          window.location.href = '/login'
        }, 2000)
      } else {
        setError(data.error || data.errors?.join(', ') || t('Failed to reset password'))
      }
    } catch (err) {
      setError(t('An error occurred. Please try again.'))
    }

    setLoading(false)
  }

  if (!token) {
    return (
      <div className="flex min-h-full flex-col justify-center py-12 sm:px-6 lg:px-8 bg-background">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <Alert
            variant="error"
            title={t('Invalid Reset Link')}
            description={t('The password reset link is invalid or missing.')}
          />
          <p className="mt-6 text-center text-sm/6 text-text-tertiary">
            <Link href="/login" className="font-semibold text-primary-400 hover:text-primary-300">
              {t('Back to Login')}
            </Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col justify-center py-12 sm:px-6 lg:px-8 bg-background">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-2xl font-bold tracking-tight text-text-secondary">
          {t('Reset Password')}
        </h2>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-[480px]">
        <div className="bg-surface/50 px-6 py-12 outline -outline-offset-1 outline-white/10 sm:rounded-lg sm:px-12">
          <form onSubmit={handleSubmit} className="space-y-6">
            {message && (
              <Alert variant="success" description={message} />
            )}
            {error && (
              <Alert variant="error" description={error} />
            )}

            <div>
              <label htmlFor="password" className="block text-sm/6 font-medium text-text-secondary">
                {t('New Password')}
              </label>
              <div className="mt-2">
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('Enter new password')}
                  className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-text-secondary outline-1 -outline-offset-1 outline-white/10 placeholder:text-text-tertiary focus:outline-2 focus:-outline-offset-2 focus:outline-primary-500 sm:text-sm/6"
                />
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm/6 font-medium text-text-secondary">
                {t('Confirm Password')}
              </label>
              <div className="mt-2">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t('Confirm new password')}
                  className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-text-secondary outline-1 -outline-offset-1 outline-white/10 placeholder:text-text-tertiary focus:outline-2 focus:-outline-offset-2 focus:outline-primary-500 sm:text-sm/6"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="flex w-full justify-center rounded-md bg-primary-500 px-3 py-1.5 text-sm/6 font-semibold text-white hover:bg-primary-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? t('Resetting...') : t('Reset Password')}
              </button>
            </div>
          </form>
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

export default function ResetPasswordPage() {
  const { t } = useI18n()
  return (
    <Suspense fallback={<div className="flex min-h-full items-center justify-center bg-background text-text-tertiary">{t('Loading...')}</div>}>
      <ResetPasswordForm />
    </Suspense>
  )
}
