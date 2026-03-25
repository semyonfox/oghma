'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'

const ERROR_MESSAGES: Record<string, string> = {
    OAuthSignin: 'Could not start the sign-in flow. Please try again.',
    OAuthCallback: 'Something went wrong handling the OAuth callback. The redirect URI may be misconfigured.',
    OAuthCreateAccount: 'Could not create your account. Please try again.',
    OAuthAccountNotLinked: 'This email is already registered with a different sign-in method. Please sign in using the original method and link accounts in settings.',
    Callback: 'An error occurred during sign-in. Please try again.',
    AccessDenied: 'Access was denied. You may not have permission to sign in.',
    Configuration: 'There is a server configuration problem. Please contact support.',
    Verification: 'The sign-in link has expired or already been used.',
    Default: 'An unexpected error occurred. Please try again.',
}

function AuthErrorContent() {
    const params = useSearchParams()
    const error = params.get('error') ?? 'Default'
    const message = ERROR_MESSAGES[error] ?? ERROR_MESSAGES.Default

    return (
        <div className="flex min-h-full flex-col justify-center py-12 sm:px-6 lg:px-8 bg-background">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-surface/50 px-6 py-12 outline -outline-offset-1 outline-white/10 sm:rounded-lg sm:px-12">
                    <div className="text-center">
                        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
                            <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                            </svg>
                        </div>
                        <h2 className="text-xl font-semibold text-text-secondary mb-2">Sign-in failed</h2>
                        <p className="text-sm text-text-tertiary mb-1">{message}</p>
                        {process.env.NODE_ENV === 'development' && (
                            <p className="mt-2 text-xs text-text-tertiary font-mono bg-white/5 rounded px-2 py-1">
                                error code: {error}
                            </p>
                        )}
                    </div>
                    <div className="mt-8 flex flex-col gap-3">
                        <Link
                            href="/login"
                            className="flex w-full justify-center rounded-md bg-indigo-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-400"
                        >
                            Back to sign in
                        </Link>
                        <Link
                            href="/"
                            className="flex w-full justify-center rounded-md bg-white/5 px-3 py-1.5 text-sm font-semibold text-text-secondary hover:bg-white/10"
                        >
                            Go home
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default function AuthErrorPage() {
    return (
        <Suspense>
            <AuthErrorContent />
        </Suspense>
    )
}
