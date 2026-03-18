'use client'

import Link from 'next/link'
import Header from '@/components/header'
import Footer from '@/components/footer'
import { blogCards } from '@/lib/blog-data'
import useI18n from '@/lib/notes/hooks/use-i18n'

export default function BlogPage() {
  const { t } = useI18n()

  return (
    <div className="bg-gray-900 min-h-screen">
      <Header />
      <main className="pt-24 pb-16">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:mx-0">
            <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">{t('blog.title')}</h2>
            <p className="mt-2 text-lg leading-8 text-gray-400">
              {t('blog.subtitle')}
            </p>
          </div>
          <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-x-8 gap-y-20 lg:mx-0 lg:max-w-none lg:grid-cols-3">
            {blogCards.map((post) => (
              <article key={post.slug} className="flex flex-col items-start justify-between">
                <div className="relative w-full">
                  <img
                    src={post.imageUrl}
                    alt=""
                    className="aspect-video w-full rounded-2xl bg-gray-100 object-cover sm:aspect-square lg:aspect-video"
                  />
                  <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-gray-900/10" />
                </div>
                <div className="max-w-xl">
                  <div className="mt-8 flex items-center gap-x-4 text-xs">
                    <time dateTime={post.date} className="text-gray-500">
                      {post.date}
                    </time>
                    <Link href={`/blog/${post.slug}`} className="relative z-10 rounded-full bg-gray-100 px-3 py-1.5 font-medium text-gray-600 hover:bg-gray-200">
                      {t('blog.readButton')}
                    </Link>
                  </div>
                  <div className="group relative">
                    <h3 className="mt-3 text-lg font-semibold leading-6 text-white group-hover:text-gray-300">
                      <Link href={`/blog/${post.slug}`}>
                        <span className="absolute inset-0" />
                        {post.title}
                      </Link>
                    </h3>
                    <p className="mt-5 line-clamp-3 text-sm leading-6 text-gray-400">{post.excerpt}</p>
                  </div>
                  <div className="mt-6 flex items-center gap-x-4">
                    <a
                      href={post.author.linkedin}
                      className="flex items-center gap-x-3 text-sm leading-6 text-gray-300 hover:text-white"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <img alt={post.author.name} src={post.author.imageUrl} className="h-10 w-10 rounded-full bg-gray-800" />
                      <div>
                        <p className="font-semibold text-white">{post.author.name}</p>
                        <p className="text-gray-400">{post.authorRole}</p>
                      </div>
                    </a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
