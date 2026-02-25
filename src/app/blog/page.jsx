import Link from 'next/link'
import Header from '@/components/header'
import Footer from '@/components/footer'

const blogPosts = [
  {
    slug: 'master-note-taking',
    title: 'Master Note-Taking: The Cornell Method with AI Assistance',
    author: 'Samuel',
    role: 'RAG & Search',
    excerpt: 'Learn how to structure your notes using the Cornell Method and leverage OghmaNotes AI to automatically generate summaries and study guides from your notes.',
    date: 'Jan 15, 2025',
    imageUrl: 'https://images.unsplash.com/photo-1496128858413-b36217c2ce36?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=3603&q=80',
  },
  {
    slug: 'canvas-integration',
    title: 'Canvas Integration: Sync Your Assignments in One Click',
    author: 'Semyon',
    role: 'Authentication & Backend',
    excerpt: 'Discover how to connect OghmaNotes to Canvas and never miss an assignment deadline again with automatic syncing.',
    date: 'Jan 10, 2025',
    imageUrl: 'https://images.unsplash.com/photo-1547586696-ea22b4d4235d?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=3270&q=80',
  },
  {
    slug: 'study-tips',
    title: 'Transform Your Study Sessions: Tips from Top Performers',
    author: 'Shrey',
    role: 'Infrastructure & AWS',
    excerpt: 'Real students share their strategies for using OghmaNotes to improve grades, stay organized, and reduce study time by 40%.',
    date: 'Jan 5, 2025',
    imageUrl: 'https://images.unsplash.com/photo-1492724441997-5dc865305da7?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=3270&q=80',
  },
]

export default function BlogPage() {
  return (
    <div className="bg-gray-900 min-h-screen">
      <Header />
      <main className="pt-24 pb-16">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:mx-0">
            <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">Our Blog</h2>
            <p className="mt-2 text-lg leading-8 text-gray-400">
              Insights on learning, study techniques, and how to get the most out of OghmaNotes.
            </p>
          </div>
          <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-x-8 gap-y-20 lg:mx-0 lg:max-w-none lg:grid-cols-3">
            {blogPosts.map((post) => (
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
                    <a href={`/blog/${post.slug}`} className="relative z-10 rounded-full bg-gray-100 px-3 py-1.5 font-medium text-gray-600 hover:bg-gray-200">
                      Read
                    </a>
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
                    <div className="flex items-center gap-x-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500">
                        <span className="text-sm font-semibold text-white">{post.author[0]}</span>
                      </div>
                      <div className="text-sm leading-6">
                        <p className="font-semibold text-white">{post.author}</p>
                        <p className="text-gray-400">{post.role}</p>
                      </div>
                    </div>
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
