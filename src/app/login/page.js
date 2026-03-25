'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { getErrorMessage, login } from '@/lib/apiClient'
import { Alert } from '@/components/alert'
import Link from 'next/link'
import useI18n from '@/lib/notes/hooks/use-i18n'

export default function LoginPage() {
  const { t } = useI18n()
  const userRef = useRef(null)
  const errRef = useRef(null)
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [pwd, setPwd] = useState('')
  const [errMsg, setErrMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)

  useEffect(() => {
    userRef.current?.focus()
  }, [])

  // Clear error message on input change (via input handlers below, not effect)
  const handleEmailChange = (e) => {
    setEmail(e.target.value)
    setErrMsg('')
  }

  const handlePasswordChange = (e) => {
    setPwd(e.target.value)
    setErrMsg('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const response = await login(email, pwd)

      // Login successful - redirect to /notes
      router.replace('/notes')

      // Fallback redirect in case router.replace doesn't work
      setTimeout(() => {
        window.location.href = '/notes'
      }, 1000)
    } catch (err) {
      setErrMsg(getErrorMessage(err))
      setPwd('')
      errRef.current?.focus()
      setLoading(false)
    }
  }

  // OAuth login handler - delegates to Auth.js
  const handleSocialLogin = (provider) => {
    signIn(provider, { callbackUrl: '/notes' })
  }

  return (
    <div className="flex min-h-full flex-col justify-center py-12 sm:px-6 lg:px-8 bg-background">
       <div className="sm:mx-auto sm:w-full sm:max-w-md">
         <h2 className="mt-6 text-center text-2xl font-bold tracking-tight text-text-secondary">{t('Sign in to your account')}</h2>
       </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-[480px]">
          <div className="bg-surface/50 px-6 py-12 outline -outline-offset-1 outline-white/10 sm:rounded-lg sm:px-12">
          <form onSubmit={handleSubmit} method="POST" className="space-y-6">
            {errMsg && (
              <div ref={errRef}>
                <Alert variant="error" title={t('Sign in failed')} description={errMsg} />
              </div>
            )}

            <div>
               <label htmlFor="email" className="block text-sm/6 font-medium text-text-secondary">
                 {t('Email address')}
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
                    onChange={handleEmailChange}
                    className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-text-secondary outline-1 -outline-offset-1 outline-white/10 placeholder:text-text-tertiary focus:outline-2 focus:-outline-offset-2 focus:outline-primary-500 sm:text-sm/6"
                 />
              </div>
            </div>

            <div>
               <label htmlFor="password" className="block text-sm/6 font-medium text-text-secondary">
                 {t('Password')}
               </label>
               <div className="mt-2">
                 <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={pwd}
                    onChange={handlePasswordChange}
                    className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-text-secondary outline-1 -outline-offset-1 outline-white/10 placeholder:text-text-tertiary focus:outline-2 focus:-outline-offset-2 focus:outline-primary-500 sm:text-sm/6"
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
                     className="size-4 rounded border-white/10 bg-white/5 text-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-offset-background"
                  />
                </div>
                 <label htmlFor="remember-me" className="block text-sm/6 text-text-secondary">
                  {t('Remember me')}
                </label>
              </div>

              <Link href="/forgot-password" className="text-sm/6 font-semibold text-indigo-400 hover:text-indigo-300">
                {t('Forgot password?')}
              </Link>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="flex w-full justify-center rounded-md bg-indigo-500 px-3 py-1.5 text-sm/6 font-semibold text-white hover:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? t('Signing in...') : t('Sign in')}
              </button>
            </div>
          </form>

          {/* Social login section */}
          <div>
            <div className="mt-10 flex items-center gap-x-6">
              <div className="w-full flex-1 border-t border-white/10" />
               <p className="text-sm/6 font-medium text-nowrap text-text-secondary">{t('Or continue with')}</p>
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
                 onClick={() => handleSocialLogin('azure-ad')}
                className="flex w-full items-center justify-center gap-3 rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white ring ring-white/5 hover:bg-white/20 focus-visible:ring-transparent"
              >
                <svg viewBox="0 0 2499.6 2500" aria-hidden="true" className="h-5 w-5">
                  <path d="m1187.9 1187.9h-1187.9v-1187.9h1187.9z" fill="#f1511b" />
                  <path d="m2499.6 1187.9h-1188v-1187.9h1187.9v1187.9z" fill="#80cc28" />
                  <path d="m1187.9 2500h-1187.9v-1187.9h1187.9z" fill="#00adef" />
                  <path d="m2499.6 2500h-1188v-1187.9h1187.9v1187.9z" fill="#fbbc09" />
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
                <svg viewBox="0 0 41.5 51" aria-hidden="true" className="h-5 w-5">
                  <path fill="#FFFFFF" d="M40.2,17.4c-3.4,2.1-5.5,5.7-5.5,9.7c0,4.5,2.7,8.6,6.8,10.3c-0.8,2.6-2,5-3.5,7.2c-2.2,3.1-4.5,6.3-7.9,6.3
                    s-4.4-2-8.4-2c-3.9,0-5.3,2.1-8.5,2.1s-5.4-2.9-7.9-6.5C2,39.5,0.1,33.7,0,27.6c0-9.9,6.4-15.2,12.8-15.2c3.4,0,6.2,2.2,8.3,2.2
                    c2,0,5.2-2.3,9-2.3C34.1,12.2,37.9,14.1,40.2,17.4z M28.3,8.1C30,6.1,30.9,3.6,31,1c0-0.3,0-0.7-0.1-1c-2.9,0.3-5.6,1.7-7.5,3.9
                    c-1.7,1.9-2.7,4.3-2.8,6.9c0,0.3,0,0.6,0.1,0.9c0.2,0,0.5,0.1,0.7,0.1C24.1,11.6,26.6,10.2,28.3,8.1z" />
                </svg>
                <span className="text-sm/6 font-semibold">Apple</span>
              </button>
            </div>
          </div>
        </div>

          <p className="mt-10 text-center text-sm/6 text-text-tertiary">
          {t("Don't have an account?")}{' '}
          <Link href="/register" className="font-semibold text-indigo-400 hover:text-indigo-300">
            {t('Create one')}
          </Link>
        </p>
      </div>
    </div>
  )
}
