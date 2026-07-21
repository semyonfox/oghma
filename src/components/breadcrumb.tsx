'use client'

import { ChevronRightIcon, HomeIcon } from '@heroicons/react/20/solid'
import Link from 'next/link'
import useI18n from '@/lib/notes/hooks/use-i18n'

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
  const { t } = useI18n()
  return (
    <nav aria-label={t('Breadcrumb')} className="flex min-w-0">
      <ol role="list" className="flex items-center space-x-2 truncate">
         <li>
           <div>
             <Link href={homeHref} className="text-text-tertiary hover:text-text-secondary flex-shrink-0">
               <HomeIcon aria-hidden="true" className="size-4 shrink-0" />
               <span className="sr-only">{t('Home')}</span>
             </Link>
           </div>
         </li>
        {pages.map((page) => (
          <li key={page.name}>
            <div className="flex items-center gap-2 truncate">
              <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-text-tertiary" />
              <Link
                href={page.href}
                aria-current={page.current ? 'page' : undefined}
                className={`text-xs font-medium truncate whitespace-nowrap ${
                  page.current ? 'text-text-secondary' : 'text-text-tertiary hover:text-text-secondary'
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
