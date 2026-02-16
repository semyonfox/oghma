'use client'

import { Button } from '@/components/catalyst/button'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { useRouter } from 'next/navigation'

export default function NotFound() {
  const router = useRouter()

  // TODO: Check if user is authenticated
  // const { auth } = useContext(AuthContext) or similar
  // const isAuthenticated = !!auth?.accessToken
  // const homeUrl = isAuthenticated ? '/notes' : '/'
  const homeUrl = '/'

  return (
    <main className="grid min-h-dvh place-items-center bg-white px-6 py-24 dark:bg-zinc-900 sm:py-32 lg:px-8">
      <div className="text-center">
        <p className="text-base font-semibold text-blue-600 dark:text-blue-400">404</p>
        <Heading className="mt-4 text-5xl sm:text-7xl">Page not found</Heading>
        <Text className="mt-6 text-lg text-zinc-600 dark:text-zinc-400 sm:text-xl/8">
          Sorry, we couldn't find the page you're looking for.
        </Text>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
          <Button href={homeUrl}>Go home</Button>
          <Button plain onClick={() => router.back()}>
            Go back <span aria-hidden="true">&rarr;</span>
          </Button>
        </div>
      </div>
    </main>
  )
}
