'use client'

import { HomeIcon } from '@heroicons/react/20/solid'
import Link from 'next/link'
import useI18n from '@/lib/notes/hooks/use-i18n'

export function Breadcrumb({ pages = [], homeHref = '/' }) {
  const { t } = useI18n()
  return (
    <nav aria-label="Breadcrumb" className="flex">
      <ol role="list" className="flex items-center space-x-4">
        <li>
          <div>
            <Link href={homeHref} className="text-gray-400 hover:text-gray-300">
              <HomeIcon aria-hidden="true" className="size-5 shrink-0" />
              <span className="sr-only">{t('Home')}</span>
            </Link>
          </div>
        </li>
        {pages.map((page) => (
          <li key={page.name}>
            <div className="flex items-center">
              <svg fill="currentColor" viewBox="0 0 20 20" aria-hidden="true" className="size-5 shrink-0 text-gray-600">
                <path d="M5.555 17.776l8-16 .894.448-8 16-.894-.448z" />
              </svg>
              <Link
                href={page.href}
                aria-current={page.current ? 'page' : undefined}
                className={`ml-4 text-sm font-medium ${
                  page.current ? 'text-gray-200' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {page.name}
              </Link>
            </div>
          </li>
        ))}
      </ol>
    </nav>
  )
}
