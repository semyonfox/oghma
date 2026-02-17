'use client'

import { HomeIcon } from '@heroicons/react/20/solid'
import Link from 'next/link'

interface BreadcrumbPage {
  name: string
  href: string
  current: boolean
}

interface BreadcrumbProps {
  pages?: BreadcrumbPage[]
  homeHref?: string
}

export function Breadcrumb({ pages = [], homeHref = '/' }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0">
      <ol role="list" className="flex items-center space-x-2 truncate">
        <li>
          <div>
            <Link href={homeHref} className="text-gray-400 hover:text-gray-300 flex-shrink-0">
              <HomeIcon aria-hidden="true" className="size-4 shrink-0" />
              <span className="sr-only">Home</span>
            </Link>
          </div>
        </li>
        {pages.map((page) => (
          <li key={page.name}>
            <div className="flex items-center gap-2 truncate">
              <svg fill="currentColor" viewBox="0 0 20 20" aria-hidden="true" className="size-4 shrink-0 text-gray-600">
                <path d="M5.555 17.776l8-16 .894.448-8 16-.894-.448z" />
              </svg>
              <Link
                href={page.href}
                aria-current={page.current ? 'page' : undefined}
                className={`text-xs font-medium truncate whitespace-nowrap ${
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
