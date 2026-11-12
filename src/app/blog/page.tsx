import Image from "next/image";
import Link from "next/link";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { blogPosts } from "@/lib/blog-data";
import { getServerI18n } from "@/lib/i18n/server";

export default async function BlogPage() {
  const { t } = await getServerI18n();

  return (
    <div className="bg-landing min-h-screen">
      <Header />
      <main className="pt-28 pb-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:mx-0">
            <h2 className="font-serif text-4xl font-semibold tracking-tight text-text sm:text-5xl">
              {t("blog.title")}
            </h2>
            <p className="mt-2 text-lg leading-8 text-text-secondary">
              {t("blog.subtitle")}
            </p>
          </div>
          <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-x-8 gap-y-20 lg:mx-0 lg:max-w-none lg:grid-cols-3">
            {blogPosts.map((post, index) => (
              <article
                key={post.slug}
                className="flex flex-col items-start justify-between"
              >
                <div className="relative w-full">
                  <Image
                    src={post.imageUrl}
                    alt={t(post.title)}
                    width={800}
                    height={450}
                    sizes="(max-width: 1024px) 100vw, 33vw"
                    preload={index === 0}
                    className="aspect-video w-full rounded-radius-xl bg-subtle object-cover sm:aspect-square lg:aspect-video"
                  />
                  <div className="absolute inset-0 rounded-radius-xl ring-1 ring-inset ring-border" />
                </div>
                <div className="max-w-xl">
                  <div className="mt-8 flex items-center gap-x-4 text-xs">
                    <time dateTime={post.date} className="font-mono text-text-tertiary">
                      {post.date}
                    </time>
                    <Link
                      href={`/blog/${post.slug}`}
                      className="relative z-10 rounded-full border border-border bg-surface px-3 py-1.5 font-medium text-text-secondary hover:bg-subtle hover:text-text"
                    >
                      {t("blog.readButton")}
                    </Link>
                  </div>
                  <div className="group relative">
                    <h3 className="mt-3 font-serif text-xl font-semibold leading-7 tracking-tight text-text group-hover:text-accent">
                      <Link href={`/blog/${post.slug}`}>
                        <span className="absolute inset-0" />
                        {t(post.title)}
                      </Link>
                    </h3>
                    <p className="mt-5 line-clamp-3 text-sm leading-6 text-text-secondary">
                      {t(post.excerpt)}
                    </p>
                  </div>
                  <div className="mt-6 flex items-center gap-x-4">
                    <a
                      href={post.author.linkedin}
                      className="flex items-center gap-x-3 text-sm leading-6 text-text-secondary hover:text-text"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Image
                        alt={post.author.name}
                        src={post.author.imageUrl}
                        width={40}
                        height={40}
                        className="h-10 w-10 rounded-full bg-surface-elevated"
                      />
                      <div>
                        <p className="font-semibold text-text">
                          {post.author.name}
                        </p>
                        <p className="text-text-secondary">{t(post.authorRole)}</p>
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
  );
}
