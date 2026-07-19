import Image from "next/image";
import Link from "next/link";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { blogCards } from "@/lib/blog-data";
import { getServerI18n } from "@/lib/i18n/server";

export default async function BlogPage() {
  const { t } = await getServerI18n();

  return (
    <div className="bg-landing min-h-screen">
      <Header />
      <div className="relative isolate">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80"
        >
          <div
            style={{
              clipPath:
                "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)",
            }}
            className="relative left-[calc(50%-11rem)] aspect-1155/678 w-144.5 -translate-x-1/2 rotate-30 bg-linear-to-tr from-primary-500/25 to-primary-400/10 opacity-20 sm:left-[calc(50%-30rem)] sm:w-288.75"
          />
        </div>
      </div>
      <main className="pt-28 pb-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:mx-0">
            <h2 className="text-4xl font-bold tracking-tight text-text sm:text-5xl">
              {t("blog.title")}
            </h2>
            <p className="mt-2 text-lg leading-8 text-text-secondary">
              {t("blog.subtitle")}
            </p>
          </div>
          <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-x-8 gap-y-20 lg:mx-0 lg:max-w-none lg:grid-cols-3">
            {blogCards.map((post, index) => (
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
                    preload={index === 0}
                    className="aspect-video w-full rounded-2xl bg-subtle object-cover sm:aspect-square lg:aspect-video"
                  />
                  <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-gray-900/10" />
                </div>
                <div className="max-w-xl">
                  <div className="mt-8 flex items-center gap-x-4 text-xs">
                    <time dateTime={post.date} className="text-text-tertiary">
                      {post.date}
                    </time>
                    <Link
                      href={`/blog/${post.slug}`}
                      className="relative z-10 rounded-full bg-subtle px-3 py-1.5 font-medium text-text-secondary hover:bg-subtle"
                    >
                      {t("blog.readButton")}
                    </Link>
                  </div>
                  <div className="group relative">
                    <h3 className="mt-3 text-lg font-semibold leading-6 text-text group-hover:text-text-secondary">
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
