import {
  ArrowRightIcon,
  CheckIcon,
  EyeIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import Header from "@/components/header";
import Footer from "@/components/footer";
import FadeIn from "@/components/public/fade-in";

export const metadata = {
  title: "Semester Pricing",
  description:
    "Try OghmaNotes with a free first Canvas import. Paid semester and academic-year plans are being finalised for public launch.",
  alternates: { canonical: "/pricing" },
};

const plans = [
  {
    name: "Free first import",
    price: "€0",
    note: "See the useful bit before you pay",
    description:
      "Import a limited slice of Canvas and try the core study workflow during beta.",
    features: [
      "A limited Canvas or one-module import",
      "Manual notes and a small AI allowance",
      "Flashcards with spaced repetition",
      "One vault with limited storage",
    ],
    cta: "Join the beta free",
    href: "/contact#contact-form",
  },
  {
    name: "Semester",
    price: "€39–49",
    note: "Planned price for one academic term",
    description:
      "For keeping current modules together through assignment deadlines and exams.",
    features: [
      "Current-course Canvas sync",
      "Cited search and chat allowance",
      "Flashcards and planning tools",
      "A larger import and storage allowance",
    ],
    cta: "Get beta access",
    href: "/contact#contact-form",
    featured: true,
  },
  {
    name: "Academic year",
    price: "€79–89",
    note: "Planned pay-once option",
    description:
      "The same connected study system across the academic year, without another monthly subscription.",
    features: [
      "Everything in the semester plan",
      "A full-year billing option",
      "No monthly renewal during term",
      "Checkout stays off until pricing is final",
    ],
    cta: "Ask about the beta",
    href: "/contact#contact-form",
  },
];

const trustPoints = [
  {
    icon: EyeIcon,
    title: "No surprise paywall",
    text: "The free first import is meant to show you the Canvas workflow before upgrade pressure.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Limits shown up front",
    text: "Large histories cost real OCR and AI processing. You will see the applicable cap before an import starts.",
  },
  {
    icon: SparklesIcon,
    title: "Pay for the connection",
    text: "The value is not another blank chatbot. It is your current course material, deadlines, notes, flashcards, and planning in one place.",
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-landing text-text">
      <Header />
      <main>
        <section className="relative px-6 pb-20 pt-36 sm:pb-28 sm:pt-44 lg:px-8">
          <FadeIn>
            <div className="mx-auto max-w-3xl text-center">
              <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-text-tertiary">Student pricing</p>
              <h1 className="mt-4 font-serif text-5xl font-semibold tracking-tight text-balance sm:text-6xl">
                Pricing built around the academic term.
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-lg/8 text-text-secondary">
                Try a real Canvas import free. If having your course already organised is useful, choose a semester or academic-year plan when paid access launches.
              </p>
              <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm text-text-secondary">
                <span className="size-2 rounded-full bg-accent" aria-hidden="true" />
                Closed beta now · paid checkout is not enabled
              </div>
            </div>
          </FadeIn>
        </section>

        <section className="mx-auto max-w-7xl px-6 pb-24 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-3 lg:items-stretch">
            {plans.map((plan, index) => (
              <FadeIn key={plan.name} delay={index * 0.08}>
                <article className={`relative flex h-full flex-col rounded-radius-2xl border bg-surface p-7 ${plan.featured ? "border-accent ring-1 ring-accent" : "border-border"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-serif text-2xl font-semibold tracking-tight">{plan.name}</h2>
                    {plan.featured ? (
                      <p className="mt-1 shrink-0 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-soft-text">
                        Recommended
                      </p>
                    ) : null}
                  </div>
                  <div className="mt-6 flex items-end gap-2">
                    <span className="font-serif text-4xl font-semibold tracking-tight">{plan.price}</span>
                  </div>
                  <p className="mt-2 font-mono text-xs text-text-tertiary">{plan.note}</p>
                  <p className="mt-6 text-sm/6 text-text-secondary">{plan.description}</p>
                  <ul className="mt-7 flex-1 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-3 text-sm/6 text-text">
                        <CheckIcon className="mt-0.5 size-5 flex-none text-accent" aria-hidden="true" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <a href={plan.href} className={`mt-8 inline-flex items-center justify-center gap-2 rounded-radius-md px-4 py-3 text-sm font-semibold transition-colors ${plan.featured ? "bg-action text-on-action hover:bg-action-hover" : "border border-border bg-surface text-text hover:bg-subtle"}`}>
                    {plan.cta}<ArrowRightIcon className="size-4" aria-hidden="true" />
                  </a>
                </article>
              </FadeIn>
            ))}
          </div>
          <p className="mx-auto mt-8 max-w-3xl text-center text-sm/6 text-text-tertiary">
            These are the current planning ranges, not a checkout offer. A monthly equivalent or academic-year saving will be shown only after the final prices and active term-time comparison are set. Final allowances and terms will be published before anybody is charged.
          </p>
        </section>

        <section className="border-y border-border bg-surface py-24">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <FadeIn>
              <div className="max-w-3xl">
                <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-text-tertiary">Why pay when other AI tools are free?</p>
                <h2 className="mt-3 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">Because the setup is the product.</h2>
                <p className="mt-6 text-lg/8 text-text-secondary">
                  NotebookLM, ChatGPT, Anki, and planners are useful. OghmaNotes is different because it starts from the Canvas course you are actually taking, then keeps the study tools beside that context. You are paying to remove repeated setup, not for a claim that every other tool is worse.
                </p>
              </div>
            </FadeIn>
            <div className="mt-14 grid gap-6 md:grid-cols-3">
              {trustPoints.map((point, index) => (
                <FadeIn key={point.title} delay={index * 0.08}>
                  <div className="h-full rounded-radius-xl border border-border bg-background p-6">
                    <point.icon className="size-6 text-accent" aria-hidden="true" />
                    <h3 className="mt-5 font-serif text-xl font-semibold">{point.title}</h3>
                    <p className="mt-3 text-sm/6 text-text-secondary">{point.text}</p>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 py-24 sm:py-32 lg:px-8">
          <FadeIn>
            <div className="mx-auto max-w-3xl rounded-radius-2xl border border-border bg-surface p-8 text-center sm:p-12">
              <h2 className="font-serif text-3xl font-semibold sm:text-4xl">See your own course appear first.</h2>
              <p className="mx-auto mt-5 max-w-xl text-base/7 text-text-secondary">Join the closed beta, try the limited first import, and tell us what is worth paying for before pricing is locked.</p>
              <a href="/contact#contact-form" className="mt-8 inline-flex items-center gap-2 rounded-radius-md bg-action px-5 py-3 text-sm font-semibold text-on-action transition-colors hover:bg-action-hover">
                Join the beta free<ArrowRightIcon className="size-4" aria-hidden="true" />
              </a>
            </div>
          </FadeIn>
        </section>
      </main>
      <Footer />
    </div>
  );
}
