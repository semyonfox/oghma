import {
  CheckCircleIcon,
  InformationCircleIcon,
} from "@heroicons/react/20/solid";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { findBlogPost } from "@/lib/blog-data";
import { getServerI18n } from "@/lib/i18n/server";

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { t } = await getServerI18n();
  const post = findBlogPost(slug);

  if (!post) {
    notFound();
  }

  return (
    <>
      <Header />
      <div className="bg-landing relative px-6 py-28 sm:py-32 lg:px-8">
        <div className="mx-auto max-w-3xl text-base/7 text-text-secondary">
          <div className="mb-8 border-b border-border pb-8">
            <Link
              href="/blog"
              className="text-sm text-accent hover:text-accent-hover mb-4 inline-block"
            >
              {t("blog.backToPostsArrow")}
            </Link>
            <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-text-tertiary">
              {t("blog.articleLabel")}
            </p>
            <h1 className="mt-3 font-serif text-4xl font-semibold tracking-tight text-pretty text-text sm:text-5xl">
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
              <span className="font-mono text-xs text-text-tertiary">{post.date}</span>
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
                    className="mt-1 size-5 flex-none text-accent"
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

            <h2 className="mt-16 font-serif text-3xl font-semibold tracking-tight text-pretty text-text">
              {t(post.section2Title)}
            </h2>
            <p className="mt-6">{t(post.section2Content)}</p>

            {post.callout ? (
              <figure className="mt-10 rounded-radius-lg bg-surface-elevated px-6 py-5">
                <blockquote className="font-serif text-lg font-semibold text-text">
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
              sizes="(max-width: 768px) 100vw, 768px"
              className="aspect-video rounded-radius-xl border border-border bg-surface-elevated object-cover"
            />
            <figcaption className="mt-4 flex gap-x-2 text-sm/6 text-text-secondary">
              <InformationCircleIcon
                aria-hidden="true"
                className="mt-0.5 size-5 flex-none text-text-tertiary"
              />
              {t("blog.featuredImageFor")} {t(post.title)}
            </figcaption>
          </figure>

          <div className="mt-16 max-w-2xl text-text-secondary border-t border-border pt-8">
            <h2 className="font-serif text-3xl font-semibold tracking-tight text-pretty text-text">
              {t("blog.cta.title")}
            </h2>
            <p className="mt-6">{t("blog.cta.description")}</p>
            <div className="mt-8">
              <Link
                href="/contact#contact-form"
                className="rounded-radius-md bg-action px-6 py-2.5 text-sm font-semibold text-on-action transition-colors hover:bg-action-hover"
              >
                {t("Join the beta")}
              </Link>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </>
  );
}
