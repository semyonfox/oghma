'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getErrorMessage, login } from '@/lib/apiClient'
import Link from 'next/link'

export default function LoginPage() {
  const userRef = useRef(null)
  const errRef = useRef(null)
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [pwd, setPwd] = useState('')
  const [errMsg, setErrMsg] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)

  useEffect(() => {
    userRef.current?.focus()
  }, [])

  useEffect(() => {
    setErrMsg('')
  }, [email, pwd])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await login(email, pwd)
      setEmail('')
      setPwd('')
      setSuccess(true)
      // TODO: Store "remember me" preference in localStorage if needed
      setTimeout(() => router.push('/notes'), 1500)
    } catch (err) {
      setErrMsg(getErrorMessage(err))
      setPwd('')
      errRef.current?.focus()
    } finally {
      setLoading(false)
    }
  }

  // TODO: Implement social login handlers (Google, Microsoft, GitHub, Apple)
  const handleSocialLogin = (provider) => {
    console.log(`Social login with ${provider}`)
    // TODO: Redirect to OAuth endpoint or backend authentication
  }

  if (success) {
    return (
      <div className="flex min-h-full flex-col justify-center py-12 sm:px-6 lg:px-8 bg-gray-900">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white">Login successful!</h2>
            <p className="mt-2 text-sm text-gray-400">Redirecting to your notes...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col justify-center py-12 sm:px-6 lg:px-8 bg-gray-900">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-2xl font-bold tracking-tight text-white">Sign in to your account</h2>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-[480px]">
        <div className="bg-gray-800/50 px-6 py-12 outline -outline-offset-1 outline-white/10 sm:rounded-lg sm:px-12">
          <form onSubmit={handleSubmit} method="POST" className="space-y-6">
            {errMsg && (
              <div ref={errRef} role="alert" className="rounded-lg bg-red-500/10 p-4 border border-red-500/20">
                <p className="text-sm font-medium text-red-200">{errMsg}</p>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm/6 font-medium text-white">
                Email address
              </label>
              <div className="mt-2">
                <input
                  ref={userRef}
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm/6 font-medium text-white">
                Password
              </label>
              <div className="mt-2">
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex gap-3">
                <div className="flex h-6 shrink-0 items-center">
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="size-4 rounded border-white/10 bg-white/5 text-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-gray-900"
                  />
                </div>
                <label htmlFor="remember-me" className="block text-sm/6 text-white">
                  Remember me
                </label>
              </div>

              <Link href="/forgot-password" className="text-sm/6 font-semibold text-indigo-400 hover:text-indigo-300">
                Forgot password?
              </Link>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="flex w-full justify-center rounded-md bg-indigo-500 px-3 py-1.5 text-sm/6 font-semibold text-white hover:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </div>
          </form>

          {/* Social login section */}
          <div>
            <div className="mt-10 flex items-center gap-x-6">
              <div className="w-full flex-1 border-t border-white/10" />
              <p className="text-sm/6 font-medium text-nowrap text-white">Or continue with</p>
              <div className="w-full flex-1 border-t border-white/10" />
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4">
              {/* Google */}
              <button
                type="button"
                onClick={() => handleSocialLogin('google')}
                className="flex w-full items-center justify-center gap-3 rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white ring ring-white/5 hover:bg-white/20 focus-visible:ring-transparent"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
                  <path
                    d="M12.0003 4.75C13.7703 4.75 15.3553 5.36002 16.6053 6.54998L20.0303 3.125C17.9502 1.19 15.2353 0 12.0003 0C7.31028 0 3.25527 2.69 1.28027 6.60998L5.27028 9.70498C6.21525 6.86002 8.87028 4.75 12.0003 4.75Z"
                    fill="#EA4335"
                  />
                  <path
                    d="M23.49 12.275C23.49 11.49 23.415 10.73 23.3 10H12V14.51H18.47C18.18 15.99 17.34 17.25 16.08 18.1L19.945 21.1C22.2 19.01 23.49 15.92 23.49 12.275Z"
                    fill="#4285F4"
                  />
                  <path
                    d="M5.26498 14.2949C5.02498 13.5699 4.88501 12.7999 4.88501 11.9999C4.88501 11.1999 5.01998 10.4299 5.26498 9.7049L1.275 6.60986C0.46 8.22986 0 10.0599 0 11.9999C0 13.9399 0.46 15.7699 1.28 17.3899L5.26498 14.2949Z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12.0004 24.0001C15.2404 24.0001 17.9654 22.935 19.9454 21.095L16.0804 18.095C15.0054 18.82 13.6204 19.245 12.0004 19.245C8.8704 19.245 6.21537 17.135 5.2654 14.29L1.27539 17.385C3.25539 21.31 7.3104 24.0001 12.0004 24.0001Z"
                    fill="#34A853"
                  />
                </svg>
                <span className="text-sm/6 font-semibold">Google</span>
              </button>

              {/* Microsoft */}
              <button
                type="button"
                onClick={() => handleSocialLogin('microsoft')}
                className="flex w-full items-center justify-center gap-3 rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white ring ring-white/5 hover:bg-white/20 focus-visible:ring-transparent"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-white">
                  <path d="M0 0h11v11H0z" />
                  <path d="M13 0h11v11H13z" />
                  <path d="M0 13h11v11H0z" />
                  <path d="M13 13h11v11H13z" />
                </svg>
                <span className="text-sm/6 font-semibold">Microsoft</span>
              </button>

              {/* GitHub */}
              <button
                type="button"
                onClick={() => handleSocialLogin('github')}
                className="flex w-full items-center justify-center gap-3 rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white ring ring-white/5 hover:bg-white/20 focus-visible:ring-transparent"
              >
                <svg fill="currentColor" viewBox="0 0 20 20" aria-hidden="true" className="size-5 fill-white">
                  <path
                    d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z"
                    clipRule="evenodd"
                    fillRule="evenodd"
                  />
                </svg>
                <span className="text-sm/6 font-semibold">GitHub</span>
              </button>

              {/* Apple */}
              <button
                type="button"
                onClick={() => handleSocialLogin('apple')}
                className="flex w-full items-center justify-center gap-3 rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white ring ring-white/5 hover:bg-white/20 focus-visible:ring-transparent"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-white">
                  <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.61-2.53 3.44l-.87-.07z" />
                </svg>
                <span className="text-sm/6 font-semibold">Apple</span>
              </button>
            </div>
          </div>
        </div>

        <p className="mt-10 text-center text-sm/6 text-gray-400">
          Don't have an account?{' '}
          <Link href="/register" className="font-semibold text-indigo-400 hover:text-indigo-300">
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}
