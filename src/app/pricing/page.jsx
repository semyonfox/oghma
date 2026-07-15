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
    href: "/register?utm_source=pricing&utm_medium=plan_cta&utm_campaign=free_canvas_import",
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
    href: "/register?utm_source=pricing&utm_medium=plan_cta&utm_campaign=semester_beta",
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
    href: "/contact?utm_source=pricing&utm_medium=plan_cta&utm_campaign=annual_interest",
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
        <section className="relative isolate overflow-hidden px-6 pb-20 pt-36 sm:pb-28 sm:pt-44 lg:px-8">
          <div className="absolute inset-x-0 top-0 -z-10 h-96 bg-linear-to-b from-primary-500/10 to-transparent" />
          <FadeIn>
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-sm font-semibold text-primary-400">Student pricing</p>
              <h1 className="mt-4 font-serif text-5xl font-semibold tracking-tight text-balance sm:text-6xl">
                Pay by semester, not by another monthly drip.
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-lg/8 text-text-secondary">
                Try a real Canvas import free. If having your course already organised is useful, the planned paid options follow the academic term.
              </p>
              <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-primary-500/20 bg-primary-500/10 px-4 py-2 text-sm text-text-secondary">
                <span className="size-2 rounded-full bg-secondary-400" />
                Closed beta now · paid checkout is not enabled
              </div>
            </div>
          </FadeIn>
        </section>

        <section className="mx-auto max-w-7xl px-6 pb-24 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-3 lg:items-stretch">
            {plans.map((plan, index) => (
              <FadeIn key={plan.name} delay={index * 0.08}>
                <article className={`relative flex h-full flex-col rounded-radius-2xl p-7 ${plan.featured ? "bg-primary-600 text-white shadow-2xl shadow-primary-950/20" : "border border-border-subtle bg-surface"}`}>
                  {plan.featured ? (
                    <p className="absolute -top-3 left-7 rounded-full bg-secondary-400 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-950">
                      Built for term time
                    </p>
                  ) : null}
                  <h2 className="font-serif text-2xl font-semibold">{plan.name}</h2>
                  <div className="mt-6 flex items-end gap-2">
                    <span className="text-4xl font-semibold tracking-tight">{plan.price}</span>
                  </div>
                  <p className={`mt-2 text-sm ${plan.featured ? "text-primary-100" : "text-text-tertiary"}`}>{plan.note}</p>
                  <p className={`mt-6 text-sm/6 ${plan.featured ? "text-primary-50" : "text-text-secondary"}`}>{plan.description}</p>
                  <ul className="mt-7 flex-1 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-3 text-sm/6">
                        <CheckIcon className={`mt-0.5 size-5 flex-none ${plan.featured ? "text-secondary-300" : "text-primary-400"}`} aria-hidden="true" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <a href={plan.href} data-marketing-event="cta_click" data-marketing-page="pricing" data-marketing-location={plan.name} className={`mt-8 inline-flex items-center justify-center gap-2 rounded-radius-md px-4 py-3 text-sm font-semibold transition-colors ${plan.featured ? "bg-white text-primary-700 hover:bg-primary-50" : "bg-primary-600 text-text-on-primary hover:bg-primary-700"}`}>
                    {plan.cta}<ArrowRightIcon className="size-4" aria-hidden="true" />
                  </a>
                </article>
              </FadeIn>
            ))}
          </div>
          <p className="mx-auto mt-8 max-w-3xl text-center text-sm/6 text-text-tertiary">
            These are planning ranges, not a checkout offer. Final allowances, renewal terms, cancellation, and refund details will be published before anybody is charged.
          </p>
        </section>

        <section className="border-y border-border-subtle bg-surface/50 py-24">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <FadeIn>
              <div className="max-w-3xl">
                <p className="text-sm font-semibold text-primary-400">Why pay when other AI tools are free?</p>
                <h2 className="mt-3 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">Because the setup is the product.</h2>
                <p className="mt-6 text-lg/8 text-text-secondary">
                  NotebookLM, ChatGPT, Anki, and planners are useful. OghmaNotes is different because it starts from the Canvas course you are actually taking, then keeps the study tools beside that context. You are paying to remove repeated setup, not for a claim that every other tool is worse.
                </p>
              </div>
            </FadeIn>
            <div className="mt-14 grid gap-6 md:grid-cols-3">
              {trustPoints.map((point, index) => (
                <FadeIn key={point.title} delay={index * 0.08}>
                  <div className="h-full rounded-radius-xl border border-border-subtle bg-background p-6">
                    <point.icon className="size-7 text-primary-400" aria-hidden="true" />
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
            <div className="mx-auto max-w-3xl rounded-radius-2xl border border-border-subtle bg-surface p-8 text-center sm:p-12">
              <h2 className="font-serif text-3xl font-semibold sm:text-4xl">See your own course appear first.</h2>
              <p className="mx-auto mt-5 max-w-xl text-base/7 text-text-secondary">Join the closed beta, try the limited first import, and tell us what is worth paying for before pricing is locked.</p>
              <a href="/register?utm_source=pricing&utm_medium=bottom_cta&utm_campaign=free_canvas_import" data-marketing-event="cta_click" data-marketing-page="pricing" data-marketing-location="bottom" className="mt-8 inline-flex items-center gap-2 rounded-radius-md bg-primary-600 px-5 py-3 text-sm font-semibold text-text-on-primary hover:bg-primary-700">
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
