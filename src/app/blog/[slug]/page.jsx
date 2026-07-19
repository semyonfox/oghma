import {
  CheckCircleIcon,
  InformationCircleIcon,
} from "@heroicons/react/20/solid";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { blogPostsBySlug } from "@/lib/blog-data";
import { getServerI18n } from "@/lib/i18n/server";

export default async function BlogPost({ params }) {
  const { slug } = await params;
  const { t } = await getServerI18n();
  const post = blogPostsBySlug[slug];

  if (!post) {
    notFound();
  }

  return (
    <>
      <Header />
      <div className="bg-landing relative isolate px-6 py-28 sm:py-32 lg:px-8">
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
        <div className="mx-auto max-w-3xl text-base/7 text-text-secondary">
          <div className="mb-8 border-b border-border-subtle pb-8">
            <Link
              href="/blog"
              className="text-sm text-primary-400 hover:text-primary-300 mb-4 inline-block"
            >
              {t("blog.backToPostsArrow")}
            </Link>
            <p className="text-base/7 font-semibold text-primary-400">
              {t("blog.articleLabel")}
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-pretty text-text sm:text-5xl">
              {t(post.title)}
            </h1>
            <div className="mt-6 flex items-center gap-x-4 text-sm text-text-secondary">
              <a
                href={post.author.linkedin}
                className="flex items-center gap-x-2 text-text-secondary hover:text-text"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Image
                  alt={post.author.name}
                  src={post.author.imageUrl}
                  width={32}
                  height={32}
                  className="size-8 rounded-full bg-surface-elevated"
                />
                <div>
                  <p className="font-semibold text-text">{post.author.name}</p>
                  <p className="text-xs text-text-secondary">{t(post.authorRole)}</p>
                </div>
              </a>
              <span>•</span>
              <span>{post.date}</span>
            </div>
          </div>

          <p className="mt-6 text-xl/8">{t(post.intro)}</p>

          <div className="mt-10 max-w-2xl text-text-secondary">
            <p className="whitespace-pre-line">{t(post.content)}</p>

            <ul role="list" className="mt-8 max-w-xl space-y-8 text-text-secondary">
              {post.highlights.map((item, idx) => (
                <li key={idx} className="flex gap-x-3">
                  <CheckCircleIcon
                    aria-hidden="true"
                    className="mt-1 size-5 flex-none text-primary-400"
                  />
                  <span>
                    <strong className="font-semibold text-text">
                      {t(item.title)}.
                    </strong>{" "}
                    {t(item.description)}
                  </span>
                </li>
              ))}
            </ul>

            <p className="mt-8">{t(post.section2Content)}</p>

            <h2 className="mt-16 text-3xl font-semibold tracking-tight text-pretty text-text">
              {t(post.section2Title)}
            </h2>
            <p className="mt-6">{t(post.section2Content)}</p>

            {post.callout ? (
              <figure className="mt-10 border-l border-primary-400 pl-9">
                <blockquote className="font-semibold text-text">
                  <p>{t(post.callout)}</p>
                </blockquote>
              </figure>
            ) : null}

            <p className="mt-10">{t(post.section3Content)}</p>
          </div>

          <figure className="mt-16">
            <Image
              alt={t(post.title)}
              src={post.imageUrl}
              width={800}
              height={450}
              className="aspect-video rounded-xl bg-surface-elevated object-cover"
            />
            <figcaption className="mt-4 flex gap-x-2 text-sm/6 text-text-secondary">
              <InformationCircleIcon
                aria-hidden="true"
                className="mt-0.5 size-5 flex-none text-text-tertiary"
              />
              {t("blog.featuredImageFor")} {t(post.title)}
            </figcaption>
          </figure>

          <div className="mt-16 max-w-2xl text-text-secondary border-t border-border-subtle pt-8">
            <h2 className="text-3xl font-semibold tracking-tight text-pretty text-text">
              {t("blog.cta.title")}
            </h2>
            <p className="mt-6">{t("blog.cta.description")}</p>
            <div className="mt-8">
              <Link
                href="/register"
                className="rounded-radius-md bg-primary-600 px-6 py-2.5 text-sm font-semibold text-text-on-primary hover:bg-primary-700"
              >
                {t("blog.cta.button")}
              </Link>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </>
  );
}
