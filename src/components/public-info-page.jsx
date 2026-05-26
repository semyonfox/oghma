import Header from "@/components/header";
import Footer from "@/components/footer";

export default function PublicInfoPage({
  eyebrow,
  title,
  description,
  children,
}) {
  return (
    <div className="min-h-screen bg-background text-text">
      <Header />
      <main className="mx-auto max-w-4xl px-6 pb-20 pt-32 sm:pt-40 lg:px-8">
        <p className="text-sm font-semibold uppercase text-primary-300">
          {eyebrow}
        </p>
        <h1 className="mt-4 font-serif text-4xl font-semibold tracking-normal text-white sm:text-5xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-6 text-lg leading-8 text-text-secondary">
            {description}
          </p>
        ) : null}
        <div className="mt-12 space-y-10 text-base leading-7 text-text-secondary">
          {children}
        </div>
      </main>
      <Footer />
    </div>
  );
}

export function InfoSection({ title, children }) {
  return (
    <section>
      <h2 className="font-serif text-2xl font-semibold text-white">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}
