'use client'

import { useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Alert } from '@/components/alert'
import Link from 'next/link'
import useI18n from '@/lib/notes/hooks/use-i18n'

export default function ResetPasswordPage() {
  const { t } = useI18n()
  const router = useRouter()
  const params = useParams()
  const token = params.token

  const [pwd, setPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [errMsg, setErrMsg] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const errRef = useRef()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrMsg('')

    if (pwd !== confirmPwd) {
      setErrMsg(t('Passwords do not match'))
      errRef.current?.focus()
      return
    }

    if (pwd.length < 8) {
      setErrMsg(t('Password must be at least 8 characters'))
      errRef.current?.focus()
      return
    }

    setLoading(true)
    try {
      // TODO: Call backend endpoint to reset password with token
      // const response = await fetch('/api/auth/reset-password', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ token, password: pwd }),
      // })
      // if (!response.ok) throw new Error('Failed to reset password')
      
      setSuccess(true)
      setTimeout(() => router.push('/login'), 2000)
    } catch (err) {
      // TODO: Use getErrorMessage utility from apiClient
      setErrMsg(err.message || t('Failed to reset password. Token may have expired.'))
      errRef.current?.focus()
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex min-h-full flex-col justify-center py-12 sm:px-6 lg:px-8 bg-gray-900">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <Alert 
            variant="success" 
            title={t('Password reset successful!')} 
            description={t('Your password has been reset. Redirecting to sign in...')} 
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col justify-center py-12 sm:px-6 lg:px-8 bg-gray-900">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-2xl font-bold tracking-tight text-white">{t('Reset your password')}</h2>
        <p className="mt-2 text-center text-sm text-gray-400">
          {t('Enter your new password below.')}
        </p>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-[480px]">
        <div className="bg-gray-800/50 px-6 py-12 outline -outline-offset-1 outline-white/10 sm:rounded-lg sm:px-12">
          <form onSubmit={handleSubmit} method="POST" className="space-y-6">
            {errMsg && (
              <div ref={errRef}>
                <Alert variant="error" description={errMsg} />
              </div>
            )}

            <div>
              <label htmlFor="password" className="block text-sm/6 font-medium text-white">
                {t('New password')}
              </label>
              <div className="mt-2">
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6"
                />
              </div>
              <p className="mt-1 text-xs text-gray-400">{t('Minimum 8 characters')}</p>
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-sm/6 font-medium text-white">
                {t('Confirm password')}
              </label>
              <div className="mt-2">
                <input
                  id="confirm-password"
                  name="confirm-password"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="flex w-full justify-center rounded-md bg-indigo-500 px-3 py-1.5 text-sm/6 font-semibold text-white hover:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? t('Resetting...') : t('Reset password')}
              </button>
            </div>
          </form>
        </div>

        <p className="mt-10 text-center text-sm/6 text-gray-400">
          <Link href="/login" className="font-semibold text-indigo-400 hover:text-indigo-300">
            {t('Back to sign in')}
          </Link>
        </p>
      </div>
    </div>
  )
}
