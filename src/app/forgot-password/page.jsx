'use client'

import { useState, useRef } from 'react'
import { Alert } from '@/components/alert'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [errMsg, setErrMsg] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const errRef = useRef()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrMsg('')
    setLoading(true)

    try {
      // TODO: Call backend endpoint to request password reset
      // const response = await fetch('/api/auth/forgot-password', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ email }),
      // })
      // if (!response.ok) throw new Error('Failed to send reset email')
      
      setSuccess(true)
      setEmail('')
    } catch (err) {
      // TODO: Use getErrorMessage utility from apiClient
      setErrMsg(err.message || 'Failed to send password reset email')
      errRef.current?.focus()
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex min-h-full flex-col justify-center py-12 sm:px-6 lg:px-8 bg-gray-900">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white">Check your email</h2>
            <p className="mt-4 text-sm text-gray-400">
              We've sent password reset instructions to your email address. Check your inbox and follow the link to reset your password.
            </p>
            <p className="mt-2 text-xs text-gray-500">
              Didn't receive an email? Check your spam folder or{' '}
              <button
                onClick={() => setSuccess(false)}
                className="text-indigo-400 hover:text-indigo-300 font-semibold"
              >
                try again
              </button>
            </p>
            <Link href="/login" className="mt-8 inline-block font-semibold text-indigo-400 hover:text-indigo-300">
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col justify-center py-12 sm:px-6 lg:px-8 bg-gray-900">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-2xl font-bold tracking-tight text-white">Reset your password</h2>
        <p className="mt-2 text-center text-sm text-gray-400">
          Enter your email address and we'll send you a link to reset your password.
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
              <label htmlFor="email" className="block text-sm/6 font-medium text-white">
                Email address
              </label>
              <div className="mt-2">
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6"
                  placeholder="your@university.edu"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="flex w-full justify-center rounded-md bg-indigo-500 px-3 py-1.5 text-sm/6 font-semibold text-white hover:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Sending...' : 'Send reset link'}
              </button>
            </div>
          </form>
        </div>

        <p className="mt-10 text-center text-sm/6 text-gray-400">
          <Link href="/login" className="font-semibold text-indigo-400 hover:text-indigo-300">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
