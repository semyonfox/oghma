import Header from "@/components/header";
import Footer from "@/components/footer";
import React from "react";
import { getServerI18n } from "@/lib/i18n/server";

function localizeText(node, t) {
  if (typeof node === "string") {
    return node.trim() ? t(node) : node;
  }
  if (Array.isArray(node)) {
    return node.map((child) => localizeText(child, t));
  }
  if (!React.isValidElement(node)) {
    return node;
  }

  return React.cloneElement(node, {
    ...node.props,
    children: localizeText(node.props.children, t),
  });
}

export default async function PublicInfoPage({
  eyebrow,
  title,
  description,
  children,
}) {
  const { t } = await getServerI18n();
  return (
    <div className="min-h-screen bg-background text-text">
      <Header />
      <main className="mx-auto max-w-4xl px-6 pb-20 pt-32 sm:pt-40 lg:px-8">
        <p className="text-sm font-semibold uppercase text-primary-300">
          {t(eyebrow)}
        </p>
        <h1 className="mt-4 font-serif text-4xl font-semibold tracking-normal text-text sm:text-5xl">
          {t(title)}
        </h1>
        {description ? (
          <p className="mt-6 text-lg leading-8 text-text-secondary">
            {t(description)}
          </p>
        ) : null}
        <div className="mt-12 space-y-10 text-base leading-7 text-text-secondary">
          {localizeText(children, t)}
        </div>
      </main>
      <Footer />
    </div>
  );
}

export async function InfoSection({ title, children }) {
  const { t } = await getServerI18n();
  return (
    <section>
      <h2 className="font-serif text-2xl font-semibold text-text">
        {t(title)}
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}
